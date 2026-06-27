import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { CheckCircle2, Download, FileSearch, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useFeatures } from "@/hooks/useFeatures";
import { validateFleetBackupDryRun, type BackupDryRunResult } from "@/lib/backupDryRun";

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text);
}

export default function BackupExportPage() {
  const { hasPermission } = useAuth();
  const { features } = useFeatures();
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");

  const canExport = hasPermission("system.backup.export");

  const [busy, setBusy] = useState(false);
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<BackupDryRunResult | null>(null);
  const [dryRunFileName, setDryRunFileName] = useState<string>("");

  const dryRunStatus = useMemo(() => {
    if (!dryRunResult) return null;
    return dryRunResult.ok ? "passed" : "failed";
  }, [dryRunResult]);

  const exportBackup = async () => {
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc("admin_export_backup");
      if (error) throw error;

      const name = `fleet_backup_${new Date().toISOString().slice(0, 10)}.json`;
      downloadJson(name, data);

      toast.success(t("backup.exported", { defaultValue: "Backup exported" }));
    } catch (e: any) {
      toast.error(t("common.error", { defaultValue: "Error" }), {
        description: e?.message || t("backup.failed", { defaultValue: "Failed to export backup" }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDryRunFile = async (file: File | undefined) => {
    if (!file) return;
    setDryRunBusy(true);
    setDryRunResult(null);
    setDryRunFileName(file.name);

    try {
      const parsed = await readJsonFile(file);
      const result = validateFleetBackupDryRun(parsed);
      setDryRunResult(result);
      if (result.ok) {
        toast.success(t("backup.dryRunPassed", { defaultValue: "Backup dry-run passed" }));
      } else {
        toast.error(t("backup.dryRunFailed", { defaultValue: "Backup dry-run failed" }), {
          description: result.errors[0],
        });
      }
    } catch (e: any) {
      setDryRunResult({
        ok: false,
        version: "unknown",
        exportedAt: null,
        totalRows: 0,
        tables: [],
        warnings: [],
        errors: [e?.message || "Invalid JSON file."],
      });
      toast.error(t("backup.dryRunFailed", { defaultValue: "Backup dry-run failed" }), {
        description: e?.message || "Invalid JSON file.",
      });
    } finally {
      setDryRunBusy(false);
    }
  };

  if (!features.backupsEnabled) {
    return (
      <MainLayout>
        <PageHeader
          title={t("backup.title", { defaultValue: "Backups" })}
          description={t("backup.subtitle", { defaultValue: "Export a system backup (Admin)" })}
        />
        <Card className="border-0 shadow-sm">
          <CardContent className="py-10">
            <div className={isRtl ? "text-right" : "text-left"}>
              <div className="text-lg font-semibold">{t("common.notAvailable", { defaultValue: "Not available" })}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {t("backup.disabledHint", { defaultValue: "Backups are disabled by Studio settings." })}
              </div>
            </div>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  if (!canExport) {
    return (
      <MainLayout>
        <PageHeader
          title={t("backup.title", { defaultValue: "Backups" })}
          description={t("backup.subtitle", { defaultValue: "Export a system backup (Admin)" })}
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
      <PageHeader
        title={t("backup.title", { defaultValue: "Backups" })}
        description={t("backup.subtitle", { defaultValue: "Export and validate backups before any test restore." })}
      />

      <Alert className="mt-6">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>{t("backup.noticeTitle", { defaultValue: "Important" })}</AlertTitle>
        <AlertDescription>
          {t("backup.notice", {
            defaultValue:
              "This is an operational export (JSON). It does not replace Supabase automated backups. Restore testing must be done only on a separate test project.",
          })}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${isRtl ? "sm:flex-row-reverse" : ""}`}>
              <div>
                <div className="font-semibold">{t("backup.exportTitle", { defaultValue: "Export Backup" })}</div>
                <div className="text-sm text-muted-foreground">
                  {t("backup.exportDesc", { defaultValue: "Download JSON of core system tables." })}
                </div>
              </div>

              <Button onClick={exportBackup} disabled={busy} className={isRtl ? "flex-row-reverse gap-2" : "gap-2"}>
                <Download className="w-4 h-4" />
                {busy ? t("common.loading", { defaultValue: "Loading..." }) : t("backup.exportBtn", { defaultValue: "Export" })}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${isRtl ? "sm:flex-row-reverse" : ""}`}>
              <div>
                <div className="font-semibold">{t("backup.dryRunTitle", { defaultValue: "Restore Dry-Run Validator" })}</div>
                <div className="text-sm text-muted-foreground">
                  {t("backup.dryRunDesc", { defaultValue: "Upload a Fleet backup JSON to validate structure only. No database writes." })}
                </div>
              </div>

              <div>
                <Input
                  id="backup-dry-run-input"
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => handleDryRunFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  disabled={dryRunBusy}
                  variant="outline"
                  className={isRtl ? "flex-row-reverse gap-2" : "gap-2"}
                  onClick={() => document.getElementById("backup-dry-run-input")?.click()}
                >
                  <FileSearch className="w-4 h-4" />
                  {dryRunBusy ? t("common.loading", { defaultValue: "Loading..." }) : t("backup.dryRunBtn", { defaultValue: "Validate JSON" })}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {dryRunResult && (
        <Card className="border-0 shadow-sm mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {dryRunStatus === "passed" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
              {t("backup.dryRunResult", { defaultValue: "Dry-Run Result" })}
              <Badge variant={dryRunResult.ok ? "default" : "destructive"}>
                {dryRunResult.ok ? t("common.passed", { defaultValue: "Passed" }) : t("common.failed", { defaultValue: "Failed" })}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-muted-foreground">{t("backup.file", { defaultValue: "File" })}</div>
                <div className="font-medium break-all">{dryRunFileName}</div>
              </div>
              <div>
                <div className="text-muted-foreground">{t("backup.version", { defaultValue: "Version" })}</div>
                <div className="font-medium">{dryRunResult.version}</div>
              </div>
              <div>
                <div className="text-muted-foreground">{t("backup.totalRows", { defaultValue: "Total rows" })}</div>
                <div className="font-medium">{dryRunResult.totalRows}</div>
              </div>
              <div>
                <div className="text-muted-foreground">{t("backup.exportedAt", { defaultValue: "Exported at" })}</div>
                <div className="font-medium">{dryRunResult.exportedAt || "—"}</div>
              </div>
            </div>

            {(dryRunResult.errors.length > 0 || dryRunResult.warnings.length > 0) && (
              <div className="space-y-2">
                {dryRunResult.errors.map((err) => (
                  <div key={err} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>
                ))}
                {dryRunResult.warnings.map((warning) => (
                  <div key={warning} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{warning}</div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t("backup.table", { defaultValue: "Table" })}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("backup.rows", { defaultValue: "Rows" })}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("backup.status", { defaultValue: "Status" })}</th>
                  </tr>
                </thead>
                <tbody>
                  {dryRunResult.tables.map((table) => (
                    <tr key={table.key} className="border-t">
                      <td className="px-3 py-2 font-medium">{table.label}</td>
                      <td className="px-3 py-2">{table.count}</td>
                      <td className="px-3 py-2">
                        <Badge variant={table.ok ? "secondary" : "destructive"}>{table.ok ? "OK" : "Missing"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </MainLayout>
  );
}
