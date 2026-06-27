import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import i18n from "@/i18n";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDateTime, formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Download, ExternalLink, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

type VehicleMini = {
  id: string;
  vehicle_code: string;
  plate_no: string;
};

type ProfileMini = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  staff_id: string | null;
};

type AnomalyRow = {
  id: string;
  trip_no: string;
  created_at: string;
  vehicle_id: string;
  vehicle_code: string;
  plate_no: string;
  driver_user_id: string | null;
  requested_by_user_id: string | null;
  start_odometer_final_value: number | null;
  anomaly_reason: string | null;
};

function makeDateRange(year: string, month: string, day: string): { start?: Date; end?: Date } {
  if (year === "all") return {};
  const y = Number(year);
  if (!Number.isFinite(y)) return {};

  if (month === "all") {
    const start = new Date(y, 0, 1);
    const end = new Date(y + 1, 0, 1);
    return { start, end };
  }

  const m = Number(month);
  if (!Number.isFinite(m) || m < 1 || m > 12) return {};

  if (day === "all") {
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    return { start, end };
  }

  const d = Number(day);
  if (!Number.isFinite(d) || d < 1 || d > 31) return {};

  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 1);
  return { start, end };
}

export default function AnomaliesReportPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");

  const { hasPermission } = useAuth();

  const canView =
    hasPermission?.("reports.read") ||
    hasPermission?.("reports.read_all") ||
    hasPermission?.("trips.read_all") ||
    hasPermission?.("alerts.odometer_anomaly") ||
    hasPermission?.("alerts.read");

  const canExport = hasPermission?.("reports.export");

  const [vehicles, setVehicles] = useState<VehicleMini[]>([]);
  const [drivers, setDrivers] = useState<ProfileMini[]>([]);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, ProfileMini>>(new Map());

  // Filters
  const [search, setSearch] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("all");
  const [driverId, setDriverId] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [day, setDay] = useState<string>("all");
  // Rolling window is used when Year = All (default 360 days)
  const [windowDays, setWindowDays] = useState<string>("360");
  const [groupBy, setGroupBy] = useState<"month" | "day">("month");

  const years = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    // show last 7 years (including current)
    return Array.from({ length: 7 }, (_, i) => String(y - i));
  }, []);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")), []);
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")), []);

  const driverLabel = (p: ProfileMini) => {
    const name = isRtl ? p.name_ar || p.name_en : p.name_en || p.name_ar;
    return `${name ?? ""}${p.staff_id ? ` (${p.staff_id})` : ""}`.trim();
  };

  const loadLookups = async () => {
    try {
      const [vehiclesRes, driversRes] = await Promise.all([
        supabase.from("vehicles").select("id, vehicle_code, plate_no").eq("status", "Active").order("vehicle_code"),
        supabase
          .from("profiles")
          .select("id, name_en, name_ar, staff_id")
          .eq("active", true)
          .eq("is_driver", true)
          .order("name_en"),
      ]);

      if (vehiclesRes.error) throw vehiclesRes.error;
      if (driversRes.error) throw driversRes.error;

      setVehicles((vehiclesRes.data as any) || []);
      setDrivers((driversRes.data as any) || []);
    } catch (e: any) {
      toast.error(t("common.failed", { defaultValue: "Failed" }), {
        description: e?.message ?? String(e),
      });
    }
  };

  const loadRows = async () => {
    if (!canView) return;

    setLoading(true);

    try {
      const range = makeDateRange(year, month, day);

	      let q = supabase
        .from("trip_anomalies_v")
        .select(
          "id, trip_no, created_at, vehicle_id, vehicle_code, plate_no, driver_user_id, requested_by_user_id, start_odometer_final_value, anomaly_reason"
        )
        .order("created_at", { ascending: false })
	        .limit(5000);

      if (vehicleId !== "all") q = q.eq("vehicle_id", vehicleId);
      if (driverId !== "all") q = q.eq("driver_user_id", driverId);

      const s = search.trim();
      if (s) {
        // Search on trip_no OR vehicle_code OR plate_no
        q = q.or(`trip_no.ilike.%${s}%,vehicle_code.ilike.%${s}%,plate_no.ilike.%${s}%`);
      }

      if (range.start && range.end) {
        q = q.gte("created_at", range.start.toISOString()).lt("created_at", range.end.toISOString());
      }

	      // When Year = All, apply a rolling window for KPI/trend (default 360 days)
	      if (year === "all") {
	        const days = Math.max(parseInt(windowDays || "360", 10) || 360, 1);
	        const start = new Date();
	        start.setDate(start.getDate() - days);
	        q = q.gte("created_at", start.toISOString());
	      }

      const res = await q;
      if (res.error) throw res.error;

      const data = (res.data as any[]) || [];
      setRows(data as AnomalyRow[]);

      // Fetch driver/requester display names in one query
      const ids = Array.from(
        new Set(
          data
            .flatMap((r) => [r.driver_user_id, r.requested_by_user_id])
            .filter(Boolean)
            .map((x) => String(x))
        )
      );

      if (ids.length > 0) {
        const profRes = await supabase
          .from("profiles")
          .select("id, name_en, name_ar, staff_id")
          .in("id", ids);
        if (!profRes.error && Array.isArray(profRes.data)) {
          const m = new Map<string, ProfileMini>();
          for (const p of profRes.data as any[]) {
            if (p?.id) m.set(String(p.id), p as ProfileMini);
          }
          setProfileMap(m);
        }
      } else {
        setProfileMap(new Map());
      }
    } catch (e: any) {
      toast.error(t("common.failed", { defaultValue: "Failed" }), {
        description: e?.message ?? String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (!canView) return;
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  // Reload rows when filters change (small debounce for search)
  useEffect(() => {
    if (!canView) return;
    const handle = setTimeout(() => {
      loadRows();
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, search, vehicleId, driverId, year, month, day, windowDays]);

  const exportCsv = () => {
    if (!canExport) {
      toast.error(t("common.noAccess", { defaultValue: "No access" }));
      return;
    }

    const headers = [
      "Trip No",
      "Date",
      "Vehicle",
      "Plate",
      "Driver",
      "Requested By",
      "Start Odometer",
      "Reason",
    ];

    const out = rows.map((r) => {
      const driver = r.driver_user_id ? profileMap.get(String(r.driver_user_id)) : null;
      const requester = r.requested_by_user_id ? profileMap.get(String(r.requested_by_user_id)) : null;
      return [
        r.trip_no,
        r.created_at,
        r.vehicle_code,
        r.plate_no,
        driver ? driverLabel(driver) : "",
        requester ? driverLabel(requester) : "",
        r.start_odometer_final_value != null ? String(r.start_odometer_final_value) : "",
        r.anomaly_reason || "",
      ];
    });

    const csv = toCsv(headers, out);
    const name = `anomalies-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(name, csv);
  };

  const severityOf = (reason?: string | null) => {
    const r = (reason || "").toLowerCase();
    if (r.includes("decrease") || r.includes("decreased") || r.includes("down")) return "BLOCKER";
    return "WARN";
  };

  const kpis = useMemo(() => {
    const total = rows.length;
    const vehicleSet = new Set<string>();
    const driverSet = new Set<string>();
    let blocker = 0;
    let warn = 0;

    const byVehicle = new Map<string, { label: string; n: number }>();

    for (const r of rows) {
      if (r.vehicle_id) vehicleSet.add(r.vehicle_id);
      if (r.driver_user_id) driverSet.add(r.driver_user_id);

      const sev = severityOf(r.anomaly_reason);
      if (sev === "BLOCKER") blocker++;
      else warn++;

      const vid = String(r.vehicle_id || "");
      const label = `${r.vehicle_code || "?"} (${r.plate_no || "?"})`;
      const prev = byVehicle.get(vid) || { label, n: 0 };
      prev.n += 1;
      byVehicle.set(vid, prev);
    }

    const topVehicles = Array.from(byVehicle.values())
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);

    return {
      total,
      vehicles: vehicleSet.size,
      drivers: driverSet.size,
      blocker,
      warn,
      topVehicles,
    };
  }, [rows]);

  const trend = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const r of rows) {
      const dt = new Date(r.created_at);
      const key = groupBy === "month" ? format(dt, "yyyy-MM") : format(dt, "yyyy-MM-dd");
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    const keys = Array.from(buckets.keys()).sort();
    let running = 0;
    return keys.map((k) => {
      const count = buckets.get(k) || 0;
      running += count;
      return { period: k, count, cumulative: running };
    });
  }, [rows, groupBy]);

  if (!canView) {
    return (
      <MainLayout>
        <PageHeader
          title={t("reports.anomalies.title", { defaultValue: "Anomalies" })}
          description={t("reports.anomalies.desc", { defaultValue: "Odometer anomalies detected for trips." })}
        />
        <div className="mt-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6 text-muted-foreground">
              {t("common.noAccess", { defaultValue: "You do not have access." })}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title={t("reports.anomalies.title", { defaultValue: "Anomalies" })}
          description={t("reports.anomalies.desc", { defaultValue: "Odometer anomalies detected for trips." })}
        />

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={loadRows}
            className={cn(isRtl ? "flex-row-reverse gap-2" : "gap-2")}
            disabled={loading}
          >
            <RefreshCcw className="w-4 h-4" />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Button>

          {canExport ? (
            <Button variant="outline" onClick={exportCsv} className={cn(isRtl ? "flex-row-reverse gap-2" : "gap-2")}>
              <Download className="w-4 h-4" />
              {t("reports.export.csv", { defaultValue: "Export CSV" })}
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="border-0 shadow-sm mt-6">
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-8 gap-4">
          <div className="md:col-span-2 space-y-2">
            <Label>{t("common.search", { defaultValue: "Search" })}</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("reports.anomalies.searchPlaceholder", { defaultValue: "Trip no, vehicle code, plate" })}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("vehicles.vehicle", { defaultValue: "Vehicle" })}</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder={t("vehicles.vehicle", { defaultValue: "Vehicle" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="all">{t("common.all", { defaultValue: "All" })}</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.vehicle_code} - {v.plate_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("trips.driver", { defaultValue: "Driver" })}</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder={t("trips.driver", { defaultValue: "Driver" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="all">{t("common.all", { defaultValue: "All" })}</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {driverLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("reports.year", { defaultValue: "Year" })}</Label>
            <Select
              value={year}
              onValueChange={(v) => {
                setYear(v);
                // reset month/day if going back to all
                if (v === "all") {
                  setMonth("all");
                  setDay("all");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("reports.year", { defaultValue: "Year" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="all">{t("common.all", { defaultValue: "All" })}</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("reports.month", { defaultValue: "Month" })}</Label>
            <Select
              value={month}
              onValueChange={(v) => {
                setMonth(v);
                if (v === "all") setDay("all");
              }}
              disabled={year === "all"}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("reports.month", { defaultValue: "Month" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="all">{t("common.all", { defaultValue: "All" })}</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("reports.day", { defaultValue: "Day" })}</Label>
            <Select value={day} onValueChange={setDay} disabled={year === "all" || month === "all"}>
              <SelectTrigger>
                <SelectValue placeholder={t("reports.day", { defaultValue: "Day" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="all">{t("common.all", { defaultValue: "All" })}</SelectItem>
                {days.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("reports.window", { defaultValue: "Window" })}</Label>
            <Select value={windowDays} onValueChange={setWindowDays} disabled={year !== "all"}>
              <SelectTrigger>
                <SelectValue placeholder={t("reports.window", { defaultValue: "Window" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="30">{t("reports.days30", { defaultValue: "30 days" })}</SelectItem>
                <SelectItem value="90">{t("reports.days90", { defaultValue: "90 days" })}</SelectItem>
                <SelectItem value="180">{t("reports.days180", { defaultValue: "180 days" })}</SelectItem>
                <SelectItem value="360">{t("reports.days360", { defaultValue: "360 days" })}</SelectItem>
              </SelectContent>
            </Select>
            {year !== "all" ? (
              <p className="text-xs text-muted-foreground">
                {t("reports.windowHint", { defaultValue: "Set Year = All to use rolling window trends." })}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>{t("reports.groupBy", { defaultValue: "Group by" })}</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder={t("reports.groupBy", { defaultValue: "Group by" })} />
              </SelectTrigger>
              <SelectContent align={isRtl ? "end" : "start"}>
                <SelectItem value="month">{t("reports.month", { defaultValue: "Month" })}</SelectItem>
                <SelectItem value="day">{t("reports.day", { defaultValue: "Day" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs + Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className={cn("text-base", isRtl && "text-right")}>
              {t("reports.kpis", { defaultValue: "KPIs" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t("reports.totalAnomalies", { defaultValue: "Total anomalies" })}</div>
              <div className="text-2xl font-semibold">{kpis.total}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t("reports.vehiclesImpacted", { defaultValue: "Vehicles impacted" })}</div>
              <div className="text-2xl font-semibold">{kpis.vehicles}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t("reports.driversImpacted", { defaultValue: "Drivers impacted" })}</div>
              <div className="text-2xl font-semibold">{kpis.drivers}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t("reports.blockers", { defaultValue: "Blockers" })}</div>
              <div className="text-2xl font-semibold">{kpis.blocker}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {t("reports.warns", { defaultValue: "Warnings" })}: {kpis.warn}
              </div>
            </div>

            <div className="col-span-2 rounded-lg border p-3">
              <div className={cn("text-xs text-muted-foreground mb-2", isRtl && "text-right")}>
                {t("reports.topVehicles", { defaultValue: "Top vehicles" })}
              </div>
              {kpis.topVehicles.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t("common.noData", { defaultValue: "No data" })}</div>
              ) : (
                <div className="space-y-1">
					  {kpis.topVehicles.map((v) => (
						<div key={v.label} className={cn("flex items-center justify-between text-sm", isRtl && "flex-row-reverse")}>
                      <span className="truncate">{v.label}</span>
                      <span className="font-medium">{v.n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className={cn("text-base", isRtl && "text-right")}>
              {t("reports.trend", { defaultValue: "Trend" })}
              <span className="text-sm text-muted-foreground ml-2">
                ({groupBy === "month" ? t("reports.month", { defaultValue: "Month" }) : t("reports.day", { defaultValue: "Day" })})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" hide={trend.length > 14} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" hide={trend.length > 14} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="cumulative" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm mt-6">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("trips.tripNo", { defaultValue: "Trip" })}</TableHead>
                <TableHead>{t("common.date", { defaultValue: "Date" })}</TableHead>
                <TableHead>{t("vehicles.vehicle", { defaultValue: "Vehicle" })}</TableHead>
                <TableHead>{t("trips.driver", { defaultValue: "Driver" })}</TableHead>
                <TableHead>{t("trips.requestedBy", { defaultValue: "Requested by" })}</TableHead>
                <TableHead>{t("trips.odometer", { defaultValue: "Odometer" })}</TableHead>
                <TableHead>{t("reports.reason", { defaultValue: "Reason" })}</TableHead>
                <TableHead className="text-right">{t("common.actions", { defaultValue: "Actions" })}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {t("common.loading", { defaultValue: "Loading..." })}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {t("common.noData", { defaultValue: "No data" })}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const driver = r.driver_user_id ? profileMap.get(String(r.driver_user_id)) : null;
                  const requester = r.requested_by_user_id ? profileMap.get(String(r.requested_by_user_id)) : null;

                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.trip_no}</TableCell>
                      <TableCell>{formatDateTime(r.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{r.vehicle_code}</span>
                          <span className="text-xs text-muted-foreground">{r.plate_no}</span>
                        </div>
                      </TableCell>
                      <TableCell>{driver ? driverLabel(driver) : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell>
                        {requester ? driverLabel(requester) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {r.start_odometer_final_value != null ? (
                          <Badge variant="secondary">{formatNumber(r.start_odometer_final_value, "integer")}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[420px] whitespace-pre-line">
                        {r.anomaly_reason ? r.anomaly_reason : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm" className={cn(isRtl ? "flex-row-reverse gap-2" : "gap-2")}>
                          <Link to={`/trips/${r.id}`}>
                            <ExternalLink className="w-4 h-4" />
                            {t("common.view", { defaultValue: "View" })}
                          </Link>
                        </Button>
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
