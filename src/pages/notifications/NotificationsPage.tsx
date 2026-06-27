import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  severity: "INFO" | "WARN" | "BLOCKER";
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const isRtl = i18n.language?.startsWith('ar');

  // Best-effort localization for notification content.
  // Many notifications are generated in SQL and stored as English strings.
  // If Arabic isn't available in DB yet, we translate the common formats here.
  const localizeNotification = (n: NotificationRow) => {
    if (!isRtl) return { title: n.title, body: n.body };

    const titleEn = (n.title || '').trim();
    const bodyEn = (n.body || '').trim();

    const titleMap: Record<string, string> = {
      'service due soon': 'الصيانة مستحقة قريباً',
      'service overdue': 'الصيانة متأخرة',
      'odometer anomaly detected': 'اكتشاف شذوذ في قراءة العداد',
      'insurance expired': 'انتهى التأمين',
      'insurance expiring soon': 'التأمين سينتهي قريباً',
      'registration expired': 'انتهت الاستمارة',
      'registration expiring soon': 'الاستمارة ستنتهي قريباً',
    };

    // Service due soon/overdue format
    const reService = /^Vehicle\s+(.+?)\s+\((.+?)\):\s+service\s+(due soon|overdue)\.\s+Current\s+([0-9.]+)\s+km,\s+due\s+at\s+([0-9.]+)\s+km\.?$/i;
    const mService = bodyEn.match(reService);
    if (mService) {
      const [, code, plate, kind, cur, due] = mService;
      const title = kind.toLowerCase() === 'overdue' ? 'الصيانة متأخرة' : 'الصيانة مستحقة قريباً';
      const body = `المركبة ${code} (${plate}): ${title}. العداد الحالي ${Number(cur).toFixed(0)} كم، والاستحقاق عند ${Number(due).toFixed(0)} كم.`;
      return { title, body };
    }

    // Odometer anomaly format
    const reOdo = /^Vehicle\s+(.+?)\s+\((.+?)\):\s+Odometer\s+(jump detected|decreased)\s+\(([-0-9.]+)\s*->\s*([-0-9.]+)\)\.\s+Diff\s+([0-9.]+)\s+km\s+\(threshold\s+([0-9.]+)\s+km\)\.?$/i;
    const mOdo = bodyEn.match(reOdo);
    if (mOdo) {
      const [, code, plate, kind, prev, next, diff, thr] = mOdo;
      const title = 'اكتشاف شذوذ في قراءة العداد';
      const kindAr = kind.toLowerCase().includes('decreased') ? 'انخفاض' : 'قفزة';
      const body = `المركبة ${code} (${plate}): ${kindAr} في قراءة العداد (${Number(prev).toFixed(0)} → ${Number(next).toFixed(0)}). الفرق ${Number(diff).toFixed(0)} كم (الحد ${Number(thr).toFixed(0)} كم).`;
      return { title, body };
    }

    // Insurance / registration formats
    const reExp = /^Vehicle\s+(.+?)\s+\((.+?)\):\s+(insurance|registration)\s+(expired|will expire)\s+on\s+([0-9-]+)\.?$/i;
    const mExp = bodyEn.match(reExp);
    if (mExp) {
      const [, code, plate, what, kind, date] = mExp;
      const isIns = what.toLowerCase() === 'insurance';
      const title = isIns
        ? (kind.toLowerCase().includes('expired') ? 'انتهى التأمين' : 'التأمين سينتهي قريباً')
        : (kind.toLowerCase().includes('expired') ? 'انتهت الاستمارة' : 'الاستمارة ستنتهي قريباً');
      const body = `المركبة ${code} (${plate}): ${title} بتاريخ ${date}.`;
      return { title, body };
    }

    const mappedTitle = titleMap[titleEn.toLowerCase()];
    return { title: mappedTitle || titleEn, body: bodyEn || null };
  };

  const fetchRows = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,severity,entity_type,entity_id,is_read,created_at")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      toast({ title: t("notifications.load_failed"), description: error.message, variant: "destructive" });
    } else {
      setRows((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markAllRead = async () => {
    setMarking(true);
    const { data, error } = await supabase.rpc("mark_all_notifications_read");
    if (error) {
      toast({ title: t("notifications.mark_failed"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("common.done"), description: t("notifications.marked_n", { n: data ?? 0 }) });
      await fetchRows();
    }
    setMarking(false);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={t("notifications.title")}
          description={t("notifications.description")}
          actions={
            <Button onClick={markAllRead} disabled={marking || loading}>
              {t("notifications.mark_all_read")}
            </Button>
          }
        />

        <Card className="p-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("notifications.none")}</div>
          ) : (
            <div className="space-y-3">
              {rows.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const content = localizeNotification(n);
                        return (
                          <>
                            <div
                              className={`font-medium ${n.is_read ? "text-muted-foreground" : ""} ${isRtl ? "text-right" : ""}`}
                              dir={isRtl ? 'rtl' : 'ltr'}
                            >
                              {content.title}
                            </div>
                            <Badge variant={n.severity === "BLOCKER" ? "destructive" : n.severity === "WARN" ? "secondary" : "outline"}>
                              {t(`notifications.severity.${n.severity}`)}
                            </Badge>
                            {!n.is_read && <Badge variant="default">{t("notifications.new")}</Badge>}
                          </>
                        );
                      })()}
                    </div>
                    {(() => {
                      const content = localizeNotification(n);
                      return content.body ? (
                        <div className={`text-sm text-muted-foreground ${isRtl ? "text-right" : ""}`} dir={isRtl ? 'rtl' : 'ltr'}>
                          {content.body}
                        </div>
                      ) : null;
                    })()}
                    <div className="text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString(isRtl ? 'ar-SA' : undefined)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  );
}
