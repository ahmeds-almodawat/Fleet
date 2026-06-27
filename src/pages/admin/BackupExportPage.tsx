import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useFeatures } from "@/hooks/useFeatures";

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

export default function BackupExportPage() {
  const { hasPermission } = useAuth();
  const { features } = useFeatures();
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");

  const canExport = hasPermission("system.backup.export");

  const [busy, setBusy] = useState(false);

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
        description={t("backup.subtitle", { defaultValue: "Export a system backup (Admin)" })}
      />

      <Alert className="mt-6">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>{t("backup.noticeTitle", { defaultValue: "Important" })}</AlertTitle>
        <AlertDescription>
          {t("backup.notice", {
            defaultValue:
              "This is an operational export (JSON). It does not replace database automated backups. Store exports securely.",
          })}
        </AlertDescription>
      </Alert>

      <Card className="border-0 shadow-sm mt-6">
        <CardContent className="p-6">
          <div className={`flex items-center justify-between gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
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
    </MainLayout>
  );
}
