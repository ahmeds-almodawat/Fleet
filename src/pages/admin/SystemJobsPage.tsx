import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { toast } from "sonner";
import { RefreshCw, PlayCircle } from "lucide-react";

type SystemJob = {
  job_key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  schedule_cron: string | null;
  min_interval_seconds: number;
  last_run_at: string | null;
};

type JobRun = {
  id: string;
  job_key: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  message: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const v = status?.toLowerCase?.() ?? "";
  const variant = v === "success" ? "default" : v === "error" ? "destructive" : "secondary";
  return <Badge variant={variant as any}>{status}</Badge>;
}

export default function SystemJobsPage() {
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");

  const canView = hasPermission("system.jobs.view");
  const canRun = hasPermission("system.jobs.run");

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<SystemJob[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [{ data: jobsData, error: jobsErr }, { data: runsData, error: runsErr }] = await Promise.all([
        supabase.from("system_jobs").select("job_key,name,description,is_enabled,schedule_cron,min_interval_seconds,last_run_at").order("job_key"),
        supabase.from("system_job_runs").select("id,job_key,started_at,finished_at,status,message").order("started_at", { ascending: false }).limit(20),
      ]);
      if (jobsErr) throw jobsErr;
      if (runsErr) throw runsErr;
      setJobs((jobsData as any) ?? []);
      setRuns((runsData as any) ?? []);
    } catch (e: any) {
      toast.error(t("common.error", { defaultValue: "Error" }), { description: e?.message || "Failed" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    void load();
     
  }, [canView]);

  const trigger = async (force: boolean) => {
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc("admin_run_jobs", { p_force: force });
      if (error) throw error;
      toast.success(t("jobs.runOk", { defaultValue: "Jobs executed" }), {
        description: JSON.stringify(data),
      });
      await load();
    } catch (e: any) {
      toast.error(t("common.error", { defaultValue: "Error" }), { description: e?.message || "Failed" });
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <MainLayout>
        <PageHeader title={t("jobs.title", { defaultValue: "System Jobs" })} description={t("jobs.subtitle", { defaultValue: "Background jobs and history" })} />
        <Card className="border-0 shadow-sm mt-6">
          <CardContent className="p-6 text-muted-foreground">{t("common.noAccess", { defaultValue: "You do not have access." })}</CardContent>
        </Card>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader title={t("jobs.title", { defaultValue: "System Jobs" })} description={t("jobs.subtitle", { defaultValue: "Background jobs and history" })} />

      <div className={"mt-6 flex items-center gap-2 " + (isRtl ? "flex-row-reverse" : "")}> 
        <Button variant="outline" onClick={load} disabled={loading} className={isRtl ? "flex-row-reverse gap-2" : "gap-2"}>
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh", { defaultValue: "Refresh" })}
        </Button>
        {canRun && (
          <>
            <Button onClick={() => trigger(false)} disabled={busy} className={isRtl ? "flex-row-reverse gap-2" : "gap-2"}>
              <PlayCircle className="h-4 w-4" />
              {t("jobs.run", { defaultValue: "Run now" })}
            </Button>
            <Button variant="secondary" onClick={() => trigger(true)} disabled={busy} className={isRtl ? "flex-row-reverse gap-2" : "gap-2"}>
              <PlayCircle className="h-4 w-4" />
              {t("jobs.forceRun", { defaultValue: "Force run" })}
            </Button>
          </>
        )}
      </div>

      <Card className="border-0 shadow-sm mt-4">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("jobs.job", { defaultValue: "Job" })}</TableHead>
                <TableHead>{t("common.status", { defaultValue: "Status" })}</TableHead>
                <TableHead>{t("jobs.lastRun", { defaultValue: "Last run" })}</TableHead>
                <TableHead>{t("jobs.schedule", { defaultValue: "Schedule" })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    {t("common.empty", { defaultValue: "No data" })}
                  </TableCell>
                </TableRow>
              )}
              {jobs.map((j) => (
                <TableRow key={j.job_key}>
                  <TableCell>
                    <div className="font-medium">{j.name}</div>
                    <div className="text-xs text-muted-foreground">{j.job_key}</div>
                    {j.description && <div className="text-xs text-muted-foreground mt-1">{j.description}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={j.is_enabled ? "default" : "secondary"}>{j.is_enabled ? t("common.enabled", { defaultValue: "Enabled" }) : t("common.disabled", { defaultValue: "Disabled" })}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{j.last_run_at ? new Date(j.last_run_at).toLocaleString() : "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{j.schedule_cron ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm mt-6">
        <CardContent className="p-0">
          <div className={"px-6 pt-6 font-semibold " + (isRtl ? "text-right" : "text-left")}>{t("jobs.history", { defaultValue: "Recent runs" })}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("jobs.job", { defaultValue: "Job" })}</TableHead>
                <TableHead>{t("common.status", { defaultValue: "Status" })}</TableHead>
                <TableHead>{t("jobs.started", { defaultValue: "Started" })}</TableHead>
                <TableHead>{t("jobs.finished", { defaultValue: "Finished" })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    {t("common.empty", { defaultValue: "No data" })}
                  </TableCell>
                </TableRow>
              )}
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.job_key}</div>
                    {r.message && <div className="text-xs text-muted-foreground mt-1">{r.message}</div>}
                  </TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(r.started_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.finished_at ? new Date(r.finished_at).toLocaleString() : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
