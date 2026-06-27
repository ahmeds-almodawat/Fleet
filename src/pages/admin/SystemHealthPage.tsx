import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, XCircle, RefreshCw, Database, ShieldAlert, Activity } from "lucide-react";

type HealthCheck = {
  key: string;
  label: string;
  ok: boolean;
  severity?: "info" | "warning" | "critical";
  detail?: string | null;
};

type HealthPayload = {
  ok: boolean;
  generated_at?: string;
  checks: HealthCheck[];
};

function asHealthPayload(value: unknown): HealthPayload {
  const candidate = value as Partial<HealthPayload> | null;
  if (!candidate || !Array.isArray(candidate.checks)) {
    return {
      ok: false,
      checks: [{ key: "shape", label: "Health payload", ok: false, severity: "critical", detail: "Unexpected health-check response" }],
    };
  }

  return {
    ok: candidate.ok === true,
    generated_at: candidate.generated_at,
    checks: candidate.checks.map((check) => ({
      key: String(check.key ?? "unknown"),
      label: String(check.label ?? check.key ?? "Unknown check"),
      ok: check.ok === true,
      severity: check.severity ?? (check.ok ? "info" : "warning"),
      detail: check.detail ?? null,
    })),
  };
}

export default function SystemHealthPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");
  const { user } = useAuth();

  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAll = async () => {
    setRunning(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_system_health_check" as never);
      if (rpcError) throw rpcError;
      setHealth(asHealthPayload(data));
    } catch (e) {
      setHealth(null);
      setError(e instanceof Error ? e.message : "Unknown health-check error");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    runAll();
  }, []);

  const checks = health?.checks ?? [];
  const criticalFailures = checks.filter((check) => !check.ok && check.severity === "critical").length;
  const warningFailures = checks.filter((check) => !check.ok && check.severity !== "critical").length;
  const allOk = health?.ok === true && !criticalFailures && !warningFailures;

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={t("health.title", { defaultValue: "System Health" })}
          subtitle={t("health.subtitle", { defaultValue: "Run production-readiness checks against the connected Supabase project." })}
          actions={
            <Button onClick={runAll} disabled={running} variant="outline">
              <RefreshCw className={cn("h-4 w-4", running && "animate-spin", isRtl ? "ml-2" : "mr-2")} />
              {running ? t("health.running", { defaultValue: "Running..." }) : t("health.refresh", { defaultValue: "Refresh" })}
            </Button>
          }
        />

        {error && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>{t("health.failed", { defaultValue: "Health check failed" })}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className={cn("flex items-center justify-between gap-2", isRtl && "flex-row-reverse")}>
              <span className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
                <Activity className="h-5 w-5 text-muted-foreground" />
                {t("health.summary", { defaultValue: "Summary" })}
              </span>
              <Badge variant={allOk ? "secondary" : criticalFailures ? "destructive" : "outline"}>
                {allOk
                  ? t("health.ok", { defaultValue: "Ready" })
                  : criticalFailures
                    ? t("health.critical", { defaultValue: "Critical" })
                    : t("health.attention", { defaultValue: "Needs attention" })}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-3", isRtl && "text-right")}>
              <div>
                {t("health.user", { defaultValue: "User" })}: <span className="text-foreground">{user?.email ?? "-"}</span>
              </div>
              <div>
                {t("health.generatedAt", { defaultValue: "Generated" })}: <span className="text-foreground">{health?.generated_at ?? "-"}</span>
              </div>
              <div>
                {t("health.failures", { defaultValue: "Failures" })}: <span className="text-foreground">{criticalFailures} critical / {warningFailures} warning</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {checks.map((check) => (
            <Card key={check.key} className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className={cn("flex items-center justify-between gap-2", isRtl && "flex-row-reverse")}>
                  <span className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
                    <Database className="h-4 w-4 text-muted-foreground" />
                    {check.label}
                  </span>
                  {check.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className={cn("h-4 w-4", check.severity === "critical" ? "text-rose-600" : "text-amber-600")} />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge variant={check.ok ? "secondary" : check.severity === "critical" ? "destructive" : "outline"}>
                  {check.ok ? t("health.passed", { defaultValue: "Passed" }) : check.severity ?? "warning"}
                </Badge>
                <Separator />
                <div className={cn("text-sm text-muted-foreground", isRtl && "text-right")}>
                  {check.detail || (check.ok ? t("health.noIssue", { defaultValue: "No issue found." }) : t("health.noDetail", { defaultValue: "No details returned." }))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
