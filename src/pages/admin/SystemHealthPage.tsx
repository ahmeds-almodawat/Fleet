import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, XCircle, RefreshCw, Database, HardDrive } from "lucide-react";

type Check = {
  key: string;
  label: string;
  description: string;
  run: () => Promise<{ ok: boolean; detail?: string }>;
};

export default function SystemHealthPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");
  const { user } = useAuth();

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, { ok: boolean; detail?: string }>>({});

  const checks: Check[] = useMemo(
    () => [
      {
        key: "db",
        label: t("health.dbTitle"),
        description: t("health.dbDesc"),
        run: async () => {
          const { error } = await supabase.from("app_settings" as any).select("key").limit(1);
          return { ok: !error, detail: error?.message };
        },
      },
      {
        key: "rpc",
        label: t("health.rpcTitle"),
        description: t("health.rpcDesc"),
        run: async () => {
          const { error } = await supabase.rpc("get_unread_notifications_count");
          return { ok: !error, detail: error?.message };
        },
      },
      {
        key: "storage",
        label: t("health.storageTitle"),
        description: t("health.storageDesc"),
        run: async () => {
          const { error } = await supabase.storage.listBuckets();
          return { ok: !error, detail: error?.message };
        },
      },
    ],
    [t]
  );

  const runAll = async () => {
    setRunning(true);
    try {
      const next: Record<string, { ok: boolean; detail?: string }> = {};
      for (const c of checks) {
        try {
          next[c.key] = await c.run();
        } catch (e: any) {
          next[c.key] = { ok: false, detail: e?.message ?? "Unknown error" };
        }
      }
      setResults(next);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall = Object.values(results);
  const allOk = overall.length > 0 && overall.every((r) => r.ok);

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={t("health.title")}
          subtitle={t("health.subtitle")}
          actions={
            <Button onClick={runAll} disabled={running} variant="outline">
              <RefreshCw className={cn("h-4 w-4", isRtl ? "ml-2" : "mr-2")} />
              {running ? t("health.running") : t("health.refresh")}
            </Button>
          }
        />

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className={cn("flex items-center justify-between gap-2", isRtl && "flex-row-reverse")}> 
              <span>{t("health.summary")}</span>
              <Badge variant={allOk ? "secondary" : "destructive"}>
                {allOk ? t("health.ok") : t("health.attention")}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <div className={cn("flex flex-col gap-1", isRtl && "text-right")}>
              <div>
                {t("health.user")} : <span className="text-foreground">{user?.email ?? "-"}</span>
              </div>
              <div>
                {t("health.lang")} : <span className="text-foreground">{(i18n.language || "en").toUpperCase()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {checks.map((c) => {
            const r = results[c.key];
            const ok = r?.ok;
            const Icon = c.key === "db" ? Database : c.key === "storage" ? HardDrive : Database;
            return (
              <Card key={c.key} className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className={cn("flex items-center justify-between gap-2", isRtl && "flex-row-reverse")}> 
                    <span className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {c.label}
                    </span>
                    {r ? (
                      ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-600" />
                      )
                    ) : (
                      <Badge variant="secondary">{t("health.pending")}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className={cn("text-sm text-muted-foreground", isRtl && "text-right")}>{c.description}</div>
                  <Separator />
                  <div className={cn("text-xs", isRtl && "text-right")}>
                    {r ? (
                      r.ok ? (
                        <span className="text-emerald-700">{t("health.passed")}</span>
                      ) : (
                        <span className="text-rose-700">
                          {t("health.failed")} {r.detail ? `— ${r.detail}` : ""}
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">{t("health.pending")}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}
