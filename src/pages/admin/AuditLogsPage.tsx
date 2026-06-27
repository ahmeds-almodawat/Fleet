import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { format } from "date-fns";
import { FileDown, FileText, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  actor_user_id: string | null;
  actor?: { name_en: string; name_ar: string } | null;
};

function toCsv(rows: string[][]) {
  return "\ufeff" + rows
    .map((r) =>
      r
        .map((c) => {
          const s = (c ?? "").toString().replace(/"/g, '""');
          return `"${s}"`;
        })
        .join(",")
    )
    .join("\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AuditLogsPage() {
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const language = i18n.language || "en";
  const isRtl = (i18n.language || "").startsWith("ar");

  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actorQ, setActorQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const canRead = hasPermission("audit.read");
  const canExport =
    hasPermission("audit.export") ||
    hasPermission("reports.export_csv") ||
    (hasPermission("reports.view") && hasPermission("reports.export"));

  const queryKey = useMemo(
    () => ["audit-events", q, entityType, action, dateFrom, dateTo],
    [q, entityType, action, dateFrom, dateTo]
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    enabled: canRead,
    queryFn: async () => {
      let query = supabase
        .from("audit_events")
        .select(
          "id, created_at, action, entity_type, entity_id, summary, actor_user_id, actor:profiles!audit_events_actor_user_id_fkey(name_en, name_ar)"
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (entityType.trim()) query = query.eq("entity_type", entityType.trim());
      if (action.trim()) query = query.ilike("action", `%${action.trim()}%`);
      if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);

      if (q.trim()) {
        const s = q.trim();
        query = query.or(`summary.ilike.%${s}%,action.ilike.%${s}%,entity_type.ilike.%${s}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AuditRow[];
    },
  });

  const filtered = useMemo(() => {
    const rows = data || [];
    const aq = actorQ.trim().toLowerCase();
    if (!aq) return rows;

    return rows.filter((r) => {
      const name = r.actor ? (language === "ar" ? r.actor.name_ar : r.actor.name_en) : "";
      return (name || "").toLowerCase().includes(aq);
    });
  }, [data, actorQ, language]);

  const exportCsv = () => {
    if (!canExport) {
      toast.error(t("common.noAccess", { defaultValue: "No access" }));
      return;
    }

    try {
      const header = [
        t("audit.time", { defaultValue: "Time" }),
        t("audit.actor", { defaultValue: "Actor" }),
        t("audit.event", { defaultValue: "Event" }),
        t("audit.entity", { defaultValue: "Entity" }),
        t("audit.summary", { defaultValue: "Summary" }),
      ];

      const body = filtered.map((r) => [
        format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
        r.actor ? (language === "ar" ? r.actor.name_ar : r.actor.name_en) : "-",
        r.action || "",
        [r.entity_type || "", r.entity_id || ""].filter(Boolean).join(" / "),
        r.summary || "",
      ]);

      downloadTextFile(`audit_logs_${format(new Date(), "yyyyMMdd_HHmm")}.csv`, toCsv([header, ...body]));
      toast.success(t("common.exported", { defaultValue: "Exported" }));
    } catch {
      toast.error(t("common.error", { defaultValue: "Error" }));
    }
  };

  if (!canRead) {
    return (
      <MainLayout>
        <PageHeader
          title={t("audit.title", { defaultValue: "Audit Logs" })}
          description={t("audit.subtitle", { defaultValue: "Track system events and exports" })}
        />
        <Card className="border-0 shadow-sm mt-6">
          <CardContent className="p-6 flex items-center gap-3 text-muted-foreground">
            <ShieldAlert className="w-5 h-5" />
            <span>{t("audit.noAccess", { defaultValue: "You do not have access." })}</span>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title={t("audit.title", { defaultValue: "Audit Logs" })}
          description={t("audit.subtitle", { defaultValue: "Track system events and exports" })}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()} className="print:hidden">
            <RefreshCw className={`w-4 h-4 ${isRtl ? "ml-2" : "mr-2"}`} />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Button>

          {canExport ? (
            <>
              <Button variant="outline" onClick={exportCsv} className="print:hidden">
                <FileDown className={`w-4 h-4 ${isRtl ? "ml-2" : "mr-2"}`} />
                {t("common.exportCsv", { defaultValue: "Export CSV" })}
              </Button>

              <Button variant="outline" onClick={() => window.print()} className="print:hidden">
                <FileText className={`w-4 h-4 ${isRtl ? "ml-2" : "mr-2"}`} />
                {t("reports.exportPdf", { defaultValue: "Export PDF" })}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card className="border-0 shadow-sm mt-6 print:hidden">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>{t("common.search", { defaultValue: "Search" })}</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("audit.searchPlaceholder", { defaultValue: "Search..." })} />
            </div>

            <div className="space-y-2">
              <Label>{t("audit.entityType", { defaultValue: "Entity type" })}</Label>
              <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder={t("audit.entityTypePlaceholder", { defaultValue: "vehicle / trip / ..." })} />
            </div>

            <div className="space-y-2">
              <Label>{t("audit.action", { defaultValue: "Action" })}</Label>
              <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder={t("audit.actionPlaceholder", { defaultValue: "create / update / export..." })} />
            </div>

            <div className="space-y-2">
              <Label>{t("audit.actor", { defaultValue: "Actor" })}</Label>
              <Input value={actorQ} onChange={(e) => setActorQ(e.target.value)} placeholder={t("audit.actorPlaceholder", { defaultValue: "Search actor..." })} />
            </div>

            <div className="space-y-2">
              <Label>{t("audit.dateFrom", { defaultValue: "From" })}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t("audit.dateTo", { defaultValue: "To" })}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm mt-6">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.time", { defaultValue: "Time" })}</TableHead>
                <TableHead>{t("audit.actor", { defaultValue: "Actor" })}</TableHead>
                <TableHead>{t("audit.event", { defaultValue: "Event" })}</TableHead>
                <TableHead>{t("audit.entity", { defaultValue: "Entity" })}</TableHead>
                <TableHead>{t("audit.summary", { defaultValue: "Summary" })}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {t("common.loading", { defaultValue: "Loading..." })}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {t("common.noData", { defaultValue: "No data" })}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(row.created_at), "yyyy-MM-dd HH:mm")}</TableCell>
                    <TableCell>{row.actor ? (language === "ar" ? row.actor.name_ar : row.actor.name_en) : "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {row.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[row.entity_type || "", row.entity_id || ""].filter(Boolean).join(" / ") || "-"}
                    </TableCell>
                    <TableCell>{row.summary || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
