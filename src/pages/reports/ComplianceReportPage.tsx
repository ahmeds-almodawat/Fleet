import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { computeVehicleCompliance } from "@/lib/compliance";
import { ComplianceBadge } from "@/components/ui/compliance-badge";
import { auditLog } from "@/lib/audit";
import { downloadCsv, toCsv } from "@/lib/csv";

import { addDays, format, parseISO } from "date-fns";
import { Download, FileText } from "lucide-react";

type VehicleRow = {
  id: string;
  vehicle_code: string;
  plate_no: string;
  insurance_end_date: string | null;
  registration_end_date: string | null;
  current_odometer: number | null;
  service_interval_km: number | null;
  service_notify_before_km: number | null;
  department_id: string | null;
  department: { id: string; name: string } | null;
  vehicle_type: { name: string; name_en?: string | null; name_ar?: string | null } | null;

  // merged from view
  anomalies_30d?: number | null;
  next_service_km?: number | null;
  service_overdue?: boolean | null;
};

type VehicleComplianceRow = {
  vehicle_id: string;
  anomalies_30d: number | null;
  next_service_km: number | null;
  service_overdue: boolean | null;
};

function daysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = parseISO(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - new Date().getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function serviceState(v: VehicleRow): {
  status: "OK" | "DUE" | "OVERDUE";
  nextKm: number | null;
  remainingKm: number | null;
} {
  const current = typeof v.current_odometer === "number" ? v.current_odometer : null;
  const next = typeof v.next_service_km === "number" ? v.next_service_km : null;
  const notifyBefore = typeof v.service_notify_before_km === "number" ? v.service_notify_before_km : 1000;

  if (current === null || next === null) {
    return { status: "OK", nextKm: next, remainingKm: null };
  }

  if (v.service_overdue || current >= next) {
    return { status: "OVERDUE", nextKm: next, remainingKm: Math.max(0, next - current) };
  }

  const remaining = next - current;
  if (remaining <= notifyBefore) {
    return { status: "DUE", nextKm: next, remainingKm: remaining };
  }

  return { status: "OK", nextKm: next, remainingKm: remaining };
}

export default function ComplianceReportPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");


  const vehicleTypeLabel = (vt: any) => {
    if (!vt) return '';
    const ar = vt.name_ar ?? null;
    const en = vt.name_en ?? null;
    const legacy = vt.name ?? '';
    return isRtl ? (ar || en || legacy) : (en || legacy || ar || '');
  };

  const { hasPermission } = useAuth();

  const canView =
    hasPermission?.("reports.read") ||
    hasPermission?.("reports.read_all") ||
    hasPermission?.("trips.read_all") ||
    hasPermission?.("vehicles.read_all");

  const canExport = hasPermission?.("reports.export");

  // Default to 360 days (requested)
  const [windowDays, setWindowDays] = useState<string>("360");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const windowN = useMemo(() => {
    const n = Number(windowDays);
    return Number.isFinite(n) && n > 0 ? n : 90;
  }, [windowDays]);

  const windowEnd = useMemo(() => addDays(new Date(), windowN), [windowN]);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "compliance", "vehicles", windowN],
    queryFn: async () => {
      const [vehiclesRes, complianceRes, anomalyCountsRes] = await Promise.all([
        supabase
          .from("vehicles")
          .select(
            "id, vehicle_code, plate_no, insurance_end_date, registration_end_date, current_odometer, service_interval_km, service_notify_before_km, department_id, department:departments(id, name), vehicle_type:vehicle_types(name, name_en, name_ar)"
          )
          .eq("status", "Active")
          .order("vehicle_code"),
        supabase
          .from("vehicle_compliance_v")
          .select("vehicle_id, anomalies_30d, next_service_km, service_overdue")
          .eq("status", "Active"),

        // Dynamic anomaly window so the report matches the selected range
        supabase.rpc("get_vehicle_anomaly_counts", { p_days: windowN }),
      ]);

      if (vehiclesRes.error) throw vehiclesRes.error;

      const compMap = new Map<string, VehicleComplianceRow>();
      if (!complianceRes.error && Array.isArray(complianceRes.data)) {
        for (const r of complianceRes.data as any[]) {
          if (r?.vehicle_id) {
            compMap.set(String(r.vehicle_id), {
              vehicle_id: String(r.vehicle_id),
              anomalies_30d: r.anomalies_30d ?? null,
              next_service_km: r.next_service_km ?? null,
              service_overdue: r.service_overdue ?? null,
            });
          }
        }
      }

      const anomalyMap = new Map<string, number>();
      if (!anomalyCountsRes.error && Array.isArray(anomalyCountsRes.data)) {
        for (const r of anomalyCountsRes.data as any[]) {
          const vid = String(r?.vehicle_id ?? "");
          if (!vid) continue;
          anomalyMap.set(vid, Number(r?.anomalies_count ?? 0));
        }
      }

      const merged: VehicleRow[] = ((vehiclesRes.data as any[]) || []).map((v) => {
        const c = compMap.get(String(v.id));
        const dynAnom = anomalyMap.get(String(v.id));
        return {
          ...v,
          anomalies_30d: typeof dynAnom === "number" ? dynAnom : c?.anomalies_30d ?? null,
          next_service_km: c?.next_service_km ?? null,
          service_overdue: c?.service_overdue ?? null,
        } as VehicleRow;
      });

      return merged;
    },
  });

  const departmentOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of data || []) {
      const id = (v.department?.id || v.department_id || "").trim();
      const name = (v.department?.name || "").trim();
      if (id && name) m.set(id, name);
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = useMemo(() => {
    const withinWindow = (d: string | null) => {
      if (!d) return true; // missing is always included
      const parsed = parseISO(d);
      if (Number.isNaN(parsed.getTime())) return true;
      return parsed <= windowEnd;
    };

    return (data || [])
      .filter((v) => (departmentFilter === "all" ? true : (v.department?.id || v.department_id || "") === departmentFilter))
      .filter((v) => {
        const svc = serviceState(v);
        const hasSvc = svc.status !== "OK";
        const hasAnomaly = (v.anomalies_30d ?? 0) > 0;

        // only show items within the selected window (or missing) + anything service/anomaly related
        return withinWindow(v.insurance_end_date) || withinWindow(v.registration_end_date) || hasSvc || hasAnomaly;
      })
      .filter((v) => {
        if (statusFilter === "all") return true;

        if (statusFilter === "anomalies") {
          return (v.anomalies_30d ?? 0) > 0;
        }

        const insLeft = daysLeft(v.insurance_end_date);
        const regLeft = daysLeft(v.registration_end_date);

        const classify = (n: number | null) => {
          if (n === null) return "missing";
          if (n < 0) return "expired";
          if (n <= windowN) return "expiring";
          return "valid";
        };

        const insS = classify(insLeft);
        const regS = classify(regLeft);

        // Include service in the same buckets for filtering
        const svc = serviceState(v);

        const worst =
          insS === "expired" || regS === "expired" || svc.status === "OVERDUE"
            ? "expired"
            : insS === "missing" || regS === "missing"
              ? "missing"
              : insS === "expiring" || regS === "expiring" || svc.status === "DUE"
                ? "expiring"
                : "valid";

        return worst === statusFilter;
      });
  }, [data, departmentFilter, statusFilter, windowEnd, windowN]);

  const handleExportCsv = () => {
    if (!canExport) return;

    const headers = [
      t("vehicles.vehicle", { defaultValue: "Vehicle" }),
      t("vehicles.plate", { defaultValue: "Plate" }),
      t("vehicles.department", { defaultValue: "Department" }),
      t("vehicles.type", { defaultValue: "Type" }),
      t("reports.insurance", { defaultValue: "Insurance End" }),
      t("reports.registration", { defaultValue: "Registration End" }),
      t("reports.service", { defaultValue: "Service" }),
      t("reports.nextService", { defaultValue: "Next Service (km)" }),
      t("reports.anomalies", { defaultValue: `Anomalies (${windowN}d)` }),
      t("reports.compliance", { defaultValue: "Compliance" }),
    ];

    const rows = filtered.map((v) => {
      const compliance = computeVehicleCompliance(v as any, windowN);
      const svc = serviceState(v);
      return [
        v.vehicle_code,
        v.plate_no,
        v.department?.name || "",
        v.vehicle_type?.name || "",
        v.insurance_end_date || "",
        v.registration_end_date || "",
        svc.status,
        String(svc.nextKm ?? ""),
        String(v.anomalies_30d ?? 0),
        compliance.status,
      ];
    });

    const csv = toCsv(headers, rows);
    const name = `compliance-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    downloadCsv(name, csv);

    auditLog(supabase as any, {
      action: "reports.compliance_export_csv",
      entityType: "reports",
      entityId: null,
      summary: `Exported compliance report CSV (window ${windowDays}d)`,
      metadata: {
        window_days: windowDays,
        status_filter: statusFilter,
        department_filter: departmentFilter,
        rows: filtered.length,
      },
    });
  };

  if (!canView) {
    return (
      <MainLayout>
        <PageHeader
          title={t("reports.compliance", { defaultValue: "Compliance Report" })}
          description={t("reports.complianceSubtitle", { defaultValue: "Insurance, registration & service overview" })}
        />
        <Card className="border-0 shadow-sm mt-6">
          <CardContent className="p-6 text-muted-foreground">
            {t("common.noAccess", { defaultValue: "You do not have access." })}
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title={t("reports.compliance", { defaultValue: "Compliance Report" })}
          description={t("reports.complianceSubtitle", { defaultValue: "Insurance, registration & service overview" })}
        />

        <div className="flex items-center gap-2 print:hidden">
          {canExport ? (
            <>
              <Button variant="outline" onClick={handleExportCsv} className={isRtl ? "flex-row-reverse gap-2" : "gap-2"}>
                <Download className="w-4 h-4" />
                {t("reports.export.csv", { defaultValue: "Export CSV" })}
              </Button>

              <Button variant="outline" onClick={() => window.print()} className={isRtl ? "flex-row-reverse gap-2" : "gap-2"}>
                <FileText className="w-4 h-4" />
                {t("reports.exportPdf", { defaultValue: "Export PDF" })}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card className="border-0 shadow-sm mt-6 print:hidden">
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">{t("reports.window", { defaultValue: "Window" })}</div>
            <Select value={windowDays} onValueChange={setWindowDays}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("reports.window", { defaultValue: "Window" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="30">{t("reports.days30", { defaultValue: "30 days" })}</SelectItem>
                <SelectItem value="60">{t("reports.days60", { defaultValue: "60 days" })}</SelectItem>
                <SelectItem value="90">{t("reports.days90", { defaultValue: "90 days" })}</SelectItem>
                <SelectItem value="180">{t("reports.days180", { defaultValue: "180 days" })}</SelectItem>
                <SelectItem value="360">{t("reports.days360", { defaultValue: "360 days" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">{t("vehicles.department", { defaultValue: "Department" })}</div>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("vehicles.department", { defaultValue: "Department" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="all">{t("common.allDepartments", { defaultValue: "All departments" })}</SelectItem>
                {departmentOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">{t("common.status", { defaultValue: "Status" })}</div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("common.status", { defaultValue: "Status" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="all">{t("common.all", { defaultValue: "All" })}</SelectItem>
                <SelectItem value="expired">{t("reports.statusExpired", { defaultValue: "Expired / Overdue" })}</SelectItem>
                <SelectItem value="expiring">{t("reports.statusExpiring", { defaultValue: "Expiring / Due soon" })}</SelectItem>
                <SelectItem value="missing">{t("reports.statusMissing", { defaultValue: "Missing" })}</SelectItem>
                <SelectItem value="anomalies">{t("reports.statusAnomalies", { defaultValue: "Has anomalies" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm mt-6">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("vehicles.vehicle", { defaultValue: "Vehicle" })}</TableHead>
                <TableHead>{t("vehicles.plate", { defaultValue: "Plate" })}</TableHead>
                <TableHead>{t("vehicles.department", { defaultValue: "Department" })}</TableHead>
                <TableHead>{t("vehicles.type", { defaultValue: "Type" })}</TableHead>
                <TableHead>{t("reports.insurance", { defaultValue: "Insurance End" })}</TableHead>
                <TableHead>{t("reports.registration", { defaultValue: "Registration End" })}</TableHead>
                <TableHead>{t("reports.service", { defaultValue: "Service" })}</TableHead>
                <TableHead>{t("reports.anomalies", { defaultValue: `Anomalies (${windowN}d)` })}</TableHead>
                <TableHead>{t("reports.compliance", { defaultValue: "Compliance" })}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    {t("common.loading", { defaultValue: "Loading..." })}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    {t("common.noData", { defaultValue: "No data" })}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((v) => {
                  const compliance = computeVehicleCompliance(v as any, windowN);
                  const svc = serviceState(v);
                  const anomalyCount = v.anomalies_30d ?? 0;

                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.vehicle_code}</TableCell>
                      <TableCell>{v.plate_no}</TableCell>
                      <TableCell>{v.department?.name || "-"}</TableCell>
                      <TableCell>{v.vehicle_type?.name || "-"}</TableCell>

                      <TableCell>
                        {v.insurance_end_date ? (
                          <Badge variant="secondary">{v.insurance_end_date}</Badge>
                        ) : (
                          <Badge variant="destructive">{t("reports.missing", { defaultValue: "Missing" })}</Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        {v.registration_end_date ? (
                          <Badge variant="secondary">{v.registration_end_date}</Badge>
                        ) : (
                          <Badge variant="destructive">{t("reports.missing", { defaultValue: "Missing" })}</Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {svc.status === "OVERDUE" ? (
                              <Badge variant="destructive">{t("reports.serviceOverdue", { defaultValue: "Overdue" })}</Badge>
                            ) : svc.status === "DUE" ? (
                              <Badge variant="secondary">{t("reports.serviceDueSoon", { defaultValue: "Due soon" })}</Badge>
                            ) : (
                              <Badge variant="outline">{t("reports.serviceOk", { defaultValue: "OK" })}</Badge>
                            )}

                            {svc.nextKm !== null ? (
                              <span className="text-xs text-muted-foreground">
                                {t("reports.serviceDueAt", { defaultValue: "Due at" })} {Math.round(svc.nextKm)} km
                              </span>
                            ) : null}
                          </div>

                          {svc.remainingKm !== null ? (
                            <span className="text-xs text-muted-foreground">
                              {t("reports.serviceRemaining", { defaultValue: "Remaining" })}: {Math.round(svc.remainingKm)} km
                            </span>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell>
                        {anomalyCount > 0 ? <Badge variant="secondary">{anomalyCount}</Badge> : <span className="text-muted-foreground">0</span>}
                        <div className="text-xs text-muted-foreground mt-1">{t("reports.anomalies30d", { defaultValue: "Last 30 days" })}</div>
                      </TableCell>

                      <TableCell>
                        <ComplianceBadge result={compliance} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
