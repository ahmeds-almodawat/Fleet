import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save, Building, Bell, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";

interface SettingRow {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

interface Department {
  id: string;
  name: string;
}

const LS_NOTIF_KEY = "fleet_browser_notifications_enabled";

export default function SettingsPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");
  const { hasPermission } = useAuth();

  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDept, setNewDept] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(() => localStorage.getItem(LS_NOTIF_KEY) === "1");
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    try { return Notification.permission; } catch { return "default"; }
  });
  const [runningReminders, setRunningReminders] = useState(false);

  const canManage = hasPermission("settings.manage");

  const title = useMemo(() => t("settings.title", { defaultValue: "Settings" }), [t]);

  useEffect(() => {
    fetchData();
     
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [settingsRes, deptsRes] = await Promise.all([
      supabase.from("settings").select("*").order("key"),
      supabase.from("departments").select("*").order("name"),
    ]);

    if (settingsRes.error) toast.error(t("settings.loadFailed"), { description: settingsRes.error.message });
    if (deptsRes.error) toast.error(t("settings.loadFailed"), { description: deptsRes.error.message });

    if (settingsRes.data) setSettings(settingsRes.data as any);
    if (deptsRes.data) setDepartments(deptsRes.data as any);

    try { setNotifPermission(Notification.permission); } catch {}
    setLoading(false);
  };

  const handleSettingChange = (key: string, value: string) => {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
  };

  const handleSaveSettings = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      for (const setting of settings) {
        const { error } = await supabase.from("settings").update({ value: setting.value }).eq("key", setting.key);
        if (error) throw error;
      }
      toast.success(t("settings.saved"));
    } catch (e: any) {
      toast.error(t("settings.saveFailed"), { description: e?.message || "" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddDepartment = async () => {
    if (!canManage) return;
    if (!newDept.trim()) return;

    const { error } = await supabase.from("departments").insert({ name: newDept.trim() } as any);
    if (error) {
      toast.error(t("settings.deptAddFailed"), { description: error.message });
    } else {
      toast.success(t("settings.deptAdded"));
      setNewDept("");
      fetchData();
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!canManage) return;
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) {
      toast.error(t("settings.deptDeleteFailed"), { description: t("settings.deptInUse") });
    } else {
      toast.success(t("settings.deptDeleted"));
      fetchData();
    }
  };

  const handleToggleBrowserNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setNotifEnabled(false);
      localStorage.setItem(LS_NOTIF_KEY, "0");
      toast.message(t("settings.notificationsDisabled"));
      return;
    }

    try {
      if (!("Notification" in window)) {
        toast.error(t("settings.notificationsNotSupported"));
        return;
      }
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm !== "granted") {
        setNotifEnabled(false);
        localStorage.setItem(LS_NOTIF_KEY, "0");
        toast.error(t("settings.notificationsPermissionDenied"));
        return;
      }
      setNotifEnabled(true);
      localStorage.setItem(LS_NOTIF_KEY, "1");
      toast.success(t("settings.notificationsEnabled"));
      new Notification(t("settings.notificationsTestTitle"), { body: t("settings.notificationsTestBody") });
    } catch (e: any) {
      toast.error(t("settings.notificationsEnableFailed"), { description: e?.message || "" });
    }
  };

  const runRemindersNow = async () => {
    if (!canManage) return;
    setRunningReminders(true);
    try {
      const { data, error } = await supabase.rpc("generate_vehicle_deadline_notifications");
      if (error) throw error;
      toast.success(t("settings.remindersRan"), { description: t("settings.remindersInserted", { count: data || 0 }) });
    } catch (e: any) {
      toast.error(t("settings.remindersFailed"), { description: e?.message || "" });
    } finally {
      setRunningReminders(false);
    }
  };

  return (
    <MainLayout>
      <PageHeader title={title} description={t("settings.description")} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className={cn("flex items-center gap-2 text-lg", isRtl && "flex-row-reverse")}>
              <SettingsIcon className="w-5 h-5" />
              {t("settings.systemSettings")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                {settings.map((setting) => (
                  <div key={setting.key} className="space-y-2">
                    <Label className="capitalize">{setting.key.replace(/_/g, " ")}</Label>
                    <Input
                      value={setting.value}
                      onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                      disabled={!canManage}
                    />
                    {setting.description && <p className="text-xs text-muted-foreground">{setting.description}</p>}
                  </div>
                ))}
                {canManage && (
                  <Button onClick={handleSaveSettings} disabled={saving} className="w-full mt-4">
                    <Save className={cn("w-4 h-4", isRtl ? "ml-2" : "mr-2")} />
                    {saving ? t("settings.saving") : t("settings.save")}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Departments + Notifications */}
        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className={cn("flex items-center gap-2 text-lg", isRtl && "flex-row-reverse")}>
                <Building className="w-5 h-5" />
                {t("settings.departments")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {canManage && (
                <div className={cn("flex gap-2 mb-4", isRtl && "flex-row-reverse")}>
                  <Input
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    placeholder={t("settings.newDeptPlaceholder")}
                    onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()}
                  />
                  <Button onClick={handleAddDepartment}>{t("common.add")}</Button>
                </div>
              )}

              <div className="space-y-2">
                {departments.map((dept) => (
                  <div key={dept.id} className={cn("flex items-center justify-between p-3 rounded-lg bg-muted/50", isRtl && "flex-row-reverse")}>
                    <span>{dept.name}</span>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDepartment(dept.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        {t("settings.remove")}
                      </Button>
                    )}
                  </div>
                ))}
                {!loading && departments.length === 0 && (
                  <div className="text-sm text-muted-foreground">{t("settings.noDepartments")}</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className={cn("flex items-center gap-2 text-lg", isRtl && "flex-row-reverse")}>
                <Bell className="w-5 h-5" />
                {t("settings.notifications")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn("flex items-center justify-between gap-3", isRtl && "flex-row-reverse")}>
                <div>
                  <div className="font-medium">{t("settings.browserNotifications")}</div>
                  <div className="text-sm text-muted-foreground">
                    {t("settings.browserNotificationsDesc")}
                    {notifPermission !== "granted" ? ` (${t("settings.permission")}: ${notifPermission})` : ""}
                  </div>
                </div>
                <Switch checked={notifEnabled} onCheckedChange={handleToggleBrowserNotifications} />
              </div>

              {canManage && (
                <div className={cn("flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3", isRtl && "flex-row-reverse")}>
                  <div>
                    <div className="font-medium">{t("settings.reminders")}</div>
                    <div className="text-sm text-muted-foreground">{t("settings.remindersDesc")}</div>
                  </div>
                  <Button onClick={runRemindersNow} disabled={runningReminders} variant="outline" className="gap-2">
                    <RefreshCw className={cn("h-4 w-4", runningReminders ? "animate-spin" : "")} />
                    {t("settings.runNow")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
