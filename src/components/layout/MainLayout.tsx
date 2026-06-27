import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useBranding } from "@/hooks/useBranding";
import { useFeatures } from "@/hooks/useFeatures";

import { Menu, AlertTriangle, Globe, Clock, Bell } from "lucide-react";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, permissions, loading, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const isRtl = (i18n.language || "").startsWith("ar");
  const { branding } = useBranding();
  const { features } = useFeatures();

  const [bootstrapping, setBootstrapping] = useState(false);
  const [riyadhTime, setRiyadhTime] = useState<string>("");
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const lastUnreadRef = useRef<number>(0);

  // Apply dynamic favicon (Studio → Browser tab icon).
  useEffect(() => {
    const href = branding?.faviconUrl?.trim() || "/favicon.ico";
    try {
      const existing = document.querySelector<HTMLLinkElement>("link#app-favicon");
      if (existing) existing.href = href;
      else {
        const link = document.createElement("link");
        link.id = "app-favicon";
        link.rel = "icon";
        link.href = href;
        document.head.appendChild(link);
      }
    } catch {
      // ignore
    }
  }, [branding?.faviconUrl]);

  // Print watermark/footer for PDF exports (browser print).
  useEffect(() => {
    try {
      const who = user?.email || user?.id || "";
      const when = new Date().toLocaleString();
      const label = who ? `${who} • ${when}` : when;
      document.body.setAttribute("data-print-watermark", label);
    } catch {
      // ignore
    }
  }, [user?.id, user?.email]);


  // Riyadh clock
  useEffect(() => {
    const update = () => {
      try {
        const locale = isRtl ? "ar-SA-u-nu-arab" : "en-US";
        const fmt = new Intl.DateTimeFormat(locale, {
          timeZone: "Asia/Riyadh",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        setRiyadhTime(fmt.format(new Date()));
      } catch {
        // ignore
      }
    };

    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [isRtl]);

  // Notifications: generate reminders once/day + poll unread count
  useEffect(() => {
    if (!user) return;
    if (!features.remindersEnabled) return;

    const key = "fleet_last_deadline_notifs_run";
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem(key);

    if (last !== today) {
      localStorage.setItem(key, today);
      (async () => {
        const { error } = await supabase.rpc("generate_vehicle_deadline_notifications");
        if (error) console.warn("Reminder generation failed:", error.message);
      })();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!features.notificationsEnabled) return;

    const LS_NOTIF_KEY = "fleet_browser_notifications_enabled";

    const fetchCount = async () => {
      try {
        const { data, error } = await supabase.rpc("get_unread_notifications_count");
        if (error) throw error;

        const count = Number(data || 0);
        setUnreadCount(count);

        const enabled = localStorage.getItem(LS_NOTIF_KEY) === "1";
        if (enabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const prev = lastUnreadRef.current;
          if (count > prev) {
            const { data: rows } = await supabase
              .from("notifications")
              .select("id,title,body,created_at")
              .eq("is_read", false)
              .order("created_at", { ascending: false })
              .limit(1);

            const n = (rows || [])[0] as any;
            if (n?.title) new Notification(n.title, { body: n.body });
          }
        }

        lastUnreadRef.current = count;
      } catch {
        // ignore
      }
    };

    fetchCount();

    // Realtime: update badge immediately when a new notification arrives.
    let ch: any = null;
    if (features.realtimeNotificationsEnabled) {
      try {
        ch = supabase
          .channel(`notif_${user.id}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
            () => fetchCount()
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
            () => fetchCount()
          )
          .subscribe();
      } catch {
        // ignore
      }
    }

    const id = window.setInterval(fetchCount, 30000);
    return () => {
      window.clearInterval(id);
      try {
        if (ch) supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    };
  }, [user, features.notificationsEnabled, features.realtimeNotificationsEnabled]);

  const canShowBootstrap = Boolean(user) && !loading && permissions.length === 0;

  const handleBootstrap = async () => {
    try {
      setBootstrapping(true);
      const { data, error } = await supabase.rpc("bootstrap_super_admin");
      if (error) throw error;

      if (data === true) {
        toast({ title: t("bootstrap.enableTitle"), description: t("bootstrap.enableDesc") });
        await refreshProfile();
      } else {
        toast({ title: t("bootstrap.notAvailableTitle"), description: t("bootstrap.notAvailableDesc") });
      }
    } catch (e: any) {
      toast({
        title: t("bootstrap.failedTitle"),
        description: e?.message ?? t("bootstrap.failedDesc"),
        variant: "destructive",
      });
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full overflow-hidden">
        <div className="print:hidden">
          <AppSidebar side={isRtl ? "right" : "left"} />
        </div>

        <SidebarInset className="flex-1 min-w-0">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 sm:px-4 lg:px-6 print:hidden">
            <SidebarTrigger className={isRtl ? "-mr-2" : "-ml-2"}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-4 w-4" />
                <span className="sr-only">{t("layout.toggleSidebar")}</span>
              </Button>
            </SidebarTrigger>

            {features.globalSearchEnabled ? <CommandPalette /> : null}

            <div className={`flex items-center gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
              {features.notificationsEnabled ? (
              <Link to="/notifications" className="relative">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={t("header.notifications")}>
                  <Bell className="h-4 w-4" />
                </Button>
                {unreadCount > 0 ? (
                  <span className="absolute -top-1 -right-1">
                    <Badge
                      variant="destructive"
                      className="h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px] leading-none"
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Badge>
                  </span>
                ) : null}
              </Link>
              ) : null}

              {riyadhTime && (
                <div
                  className={cn(
                    "hidden sm:flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground",
                    isRtl && "flex-row-reverse"
                  )}
                  title={t("header.riyadhTimeTitle")}
                >
                  <Clock className="h-4 w-4" />
                  <span>
                    {t("header.riyadhTimeLabel")} {riyadhTime}
                  </span>
                </div>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => i18n.changeLanguage(isRtl ? "en" : "ar")}
                className="gap-2"
                title={t("common.language")}
              >
                <Globe className="h-4 w-4" />
                {isRtl ? t("common.english") : t("common.arabic")}
              </Button>
            </div>
          </header>

          {canShowBootstrap && (
            <div className="border-b bg-amber-50 px-6 py-3 text-sm flex items-center justify-between gap-3 print:hidden">
              <div className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                <span>{t("bootstrap.banner")}</span>
              </div>
              <Button onClick={handleBootstrap} disabled={bootstrapping}>
                {bootstrapping ? t("bootstrap.buttonBusy") : t("bootstrap.button")}
              </Button>
            </div>
          )}

          <main className="flex-1 overflow-y-auto print:overflow-visible">
            <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 lg:px-6 py-4 print:max-w-none print:px-0 print:py-0">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}