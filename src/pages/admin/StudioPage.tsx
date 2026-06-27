import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ImageIcon, Save, RefreshCw, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import { hexToRgba } from "@/lib/color";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_BRANDING, BrandingSettings, useBranding } from "@/hooks/useBranding";
import { DEFAULT_FEATURES, FeatureFlags, useFeatures } from "@/hooks/useFeatures";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";

type BgStyle = BrandingSettings["login_bg_style"];

function LoginPreview({ draft }: { draft: BrandingSettings }) {
  const isRtl = (i18n.language || "").startsWith("ar");

  const title = isRtl
    ? (draft.brand_title_ar || DEFAULT_BRANDING.brand_title_ar)
    : (draft.brand_title_en || DEFAULT_BRANDING.brand_title_en);

  const subtitle = isRtl
    ? (draft.brand_subtitle_ar || DEFAULT_BRANDING.brand_subtitle_ar)
    : (draft.brand_subtitle_en || DEFAULT_BRANDING.brand_subtitle_en);

  const bgClass =
    draft.login_bg_style === "dark"
      ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800"
      : draft.login_bg_style === "soft"
        ? "bg-gradient-to-br from-primary/10 via-background to-accent/10"
        : "bg-gradient-to-br from-primary/5 via-background to-accent/5";

  const textColor = draft.login_font_color || DEFAULT_BRANDING.login_font_color;

  const logoUrl = draft.login_logo_url || DEFAULT_BRANDING.login_logo_url;
  const logoSize = draft.login_logo_size ?? DEFAULT_BRANDING.login_logo_size ?? 72;
  const logoOpacity = ((draft.login_logo_opacity ?? DEFAULT_BRANDING.login_logo_opacity ?? 100) as number) / 100;
  const logoBgColor = draft.loginLogoBgColor ?? DEFAULT_BRANDING.loginLogoBgColor ?? "#ffffff";
  const logoBgOpacity = ((draft.loginLogoBgOpacity ?? DEFAULT_BRANDING.loginLogoBgOpacity ?? 0) as number) / 100;

  const bgImageUrl = draft.login_bg_image_url || DEFAULT_BRANDING.login_bg_image_url;
  const overlayAlpha = ((draft.login_bg_overlay ?? DEFAULT_BRANDING.login_bg_overlay ?? 55) as number) / 100;
  const blurPx = (draft.login_bg_blur ?? DEFAULT_BRANDING.login_bg_blur ?? 2) as number;

  return (
    <div className={cn("relative min-h-[520px] rounded-xl overflow-hidden border", bgClass)}>
      {bgImageUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgImageUrl})` }}
          aria-hidden="true"
        />
      ) : null}

      <div
        className="absolute inset-0"
        style={{
          backgroundColor: `rgba(0,0,0,${overlayAlpha})`,
          backdropFilter: `blur(${blurPx}px)`,
          WebkitBackdropFilter: `blur(${blurPx}px)`,
        }}
        aria-hidden="true"
      />

      <div className="relative flex min-h-[520px] items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className={cn("flex items-center justify-center gap-3 mb-8", isRtl && "flex-row-reverse")}>
            <div
              className="flex items-center justify-center rounded-xl bg-background/90 border border-border/50 shadow-md overflow-hidden"
              style={{
                width: logoSize,
                height: logoSize,
                backgroundColor: hexToRgba(logoBgColor, logoBgOpacity),
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="logo"
                  className="h-full w-full object-contain p-2"
                  style={{ opacity: logoOpacity }}
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-foreground" style={{ opacity: logoOpacity }} />
              )}
            </div>

            <div className={cn(isRtl ? "text-right" : "text-left")}>
              <h1 className="text-2xl font-bold" style={{ color: textColor }}>{title}</h1>
              <p className="text-sm opacity-80" style={{ color: textColor }}>{subtitle}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-background/90 backdrop-blur shadow-lg">
            <div className="p-6 text-center">
              <div className="text-lg font-semibold" style={{ color: textColor }}>
                {isRtl ? "تسجيل الدخول" : "Sign in"}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {isRtl ? "أدخل بيانات الدخول للوصول إلى المنصة" : "Enter your credentials to access the platform"}
              </div>
            </div>
            <div className="px-6 pb-6 space-y-4">
              <div className="space-y-2">
                <Label>{isRtl ? "البريد الإلكتروني" : "Email"}</Label>
                <Input disabled placeholder={isRtl ? "name@hospital.sa" : "you@hospital.sa"} />
              </div>
              <div className="space-y-2">
                <Label>{isRtl ? "كلمة المرور" : "Password"}</Label>
                <Input disabled placeholder="••••••••" />
              </div>
              <Button disabled className="w-full">{isRtl ? "تسجيل الدخول" : "Sign In"}</Button>
            </div>
          </div>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            {isRtl ? "معاينة مباشرة — لن تؤثر على النظام إلا بعد الحفظ." : "Live preview — changes apply only after saving."}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarPreview({ draft }: { draft: BrandingSettings }) {
  const isRtl = (i18n.language || "").startsWith("ar");

  const title = isRtl
    ? (draft.brand_title_ar || DEFAULT_BRANDING.brand_title_ar)
    : (draft.brand_title_en || DEFAULT_BRANDING.brand_title_en);

  const subtitle = isRtl
    ? (draft.brand_subtitle_ar || DEFAULT_BRANDING.brand_subtitle_ar)
    : (draft.brand_subtitle_en || DEFAULT_BRANDING.brand_subtitle_en);

  const logoUrl = draft.sidebar_logo_url || draft.login_logo_url || DEFAULT_BRANDING.sidebar_logo_url || DEFAULT_BRANDING.login_logo_url;
  const logoHeight = draft.sidebar_logo_height ?? DEFAULT_BRANDING.sidebar_logo_height ?? 32;
  const logoOpacity = ((draft.sidebar_logo_opacity ?? DEFAULT_BRANDING.sidebar_logo_opacity ?? 100) as number) / 100;
  const logoBgColor = draft.sidebarLogoBgColor ?? DEFAULT_BRANDING.sidebarLogoBgColor ?? "#ffffff";
  const logoBgOpacity = ((draft.sidebarLogoBgOpacity ?? DEFAULT_BRANDING.sidebarLogoBgOpacity ?? 0) as number) / 100;

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className={cn("p-4 bg-muted/20 flex items-center gap-3", isRtl && "flex-row-reverse")}> 
        <div
          className="rounded-xl bg-background border border-border/50 shadow-sm px-3 py-2 overflow-hidden"
          style={{ backgroundColor: hexToRgba(logoBgColor, logoBgOpacity) }}
        >
          {logoUrl ? (
            <img
              src={logoUrl as string}
              alt="logo"
              className="max-w-[180px] object-contain"
              style={{ height: logoHeight, opacity: logoOpacity }}
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ImageIcon className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>

        <div className={cn("flex-1", isRtl ? "text-right" : "text-left")}>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      <div className="p-4 text-sm text-muted-foreground">
        {isRtl ? "معاينة ترويسة الشريط الجانبي." : "Sidebar header preview."}
      </div>
    </div>
  );
}

export default function StudioPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");
  const isProd = import.meta.env.VITE_APP_ENV === "production";
  const qc = useQueryClient();
  const { hasPermission } = useAuth();

  const canManage = hasPermission("settings.manage") || hasPermission("studio.manage");

  const { branding, isLoading } = useBranding();
  const { features } = useFeatures();
	// Local editable copy of feature flags (Studio → System)
	const [featuresDraft, setFeaturesDraft] = useState<FeatureFlags>(features ?? DEFAULT_FEATURES);
  const [draft, setDraft] = useState<BrandingSettings>(branding);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"login_logo" | "sidebar_logo" | "bg" | "favicon" | null>(null);

  // Reset demo data
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');

  useEffect(() => {
    setDraft(branding);
  }, [branding]);

  useEffect(() => {
		setFeaturesDraft(features ?? DEFAULT_FEATURES);
  }, [features]);

  const update = (patch: Partial<BrandingSettings>) => setDraft((p) => ({ ...p, ...patch }));

  const uploadAsset = async (file: File, objectKey: "login-logo" | "sidebar-logo" | "login-bg" | "favicon") => {
    const bucket = "branding";
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${objectKey}.${ext}`;

    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

    if (error) throw new Error(error.message || "Upload failed");

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) throw new Error("Public URL not available");

    return publicUrl;
  };

  const handleSaveFeatures = async () => {
    if (!canManage) return;
    try {
      const payload = {
        key: "features",
        value: featuresDraft,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("app_settings" as any).upsert(payload as any, { onConflict: "key" });
      if (error) throw error;

      toast.success(t("studio.featuresSaved"));
      await qc.invalidateQueries({ queryKey: ["app_settings", "features"] });
    } catch (e: any) {
      toast.error(t("studio.saveFailed"), { description: e?.message || "" });
    }
  };

  const handleSave = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const payload = {
        key: "branding",
        value: draft,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("app_settings" as any).upsert(payload as any, { onConflict: "key" });
      if (error) throw error;

      toast.success(t("studio.saved"));
      await qc.invalidateQueries({ queryKey: ["app_settings", "branding"] });
    } catch (e: any) {
      toast.error(t("studio.saveFailed"), { description: e?.message || "" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(DEFAULT_BRANDING);
    toast.message(t("studio.resetDone"));
  };

  if (!canManage) {
    return (
      <MainLayout>
        <PageHeader title={t("studio.title")} description={t("studio.description")} />
        <Card className="border-0 shadow-sm">
          <CardContent className="py-10">
            <div className="text-center space-y-2">
              <div className="text-lg font-semibold">{t("studio.noAccessTitle")}</div>
              <div className="text-sm text-muted-foreground">{t("studio.noAccessDesc")}</div>
            </div>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader title={t("studio.title")} description={t("studio.description")} />

      <Tabs defaultValue="login" className="space-y-4">
        <TabsList className={cn(isRtl && "flex-row-reverse")}> 
          <TabsTrigger value="login">{t("studio.tab.login")}</TabsTrigger>
          <TabsTrigger value="sidebar">{t("studio.tab.sidebar")}</TabsTrigger>
          <TabsTrigger value="system">{t("studio.tab.system")}</TabsTrigger>
        </TabsList>

        {/* LOGIN */}
        <TabsContent value="login" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className={cn("flex items-center justify-between gap-2", isRtl && "flex-row-reverse")}> 
                  <span>{t("studio.loginBranding")}</span>
                  <Badge variant="secondary">{t("studio.livePreview")}</Badge>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Names */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.brandTitleEn")}</Label>
                    <Input value={draft.brand_title_en || ""} onChange={(e) => update({ brand_title_en: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("studio.brandTitleAr")}</Label>
                    <Input value={draft.brand_title_ar || ""} onChange={(e) => update({ brand_title_ar: e.target.value })} dir="rtl" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("studio.brandSubtitleEn")}</Label>
                    <Input value={draft.brand_subtitle_en || ""} onChange={(e) => update({ brand_subtitle_en: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("studio.brandSubtitleAr")}</Label>
                    <Input value={draft.brand_subtitle_ar || ""} onChange={(e) => update({ brand_subtitle_ar: e.target.value })} dir="rtl" />
                  </div>
                </div>

                {/* Logo background color */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.loginLogoBgColor")}</Label>
                    <div className={cn("flex items-center gap-3", isRtl && "flex-row-reverse")}>
                      <Input
                        type="color"
                        className="h-10 w-16 p-1"
                        value={draft.loginLogoBgColor ?? DEFAULT_BRANDING.loginLogoBgColor ?? "#ffffff"}
                        onChange={(e) => update({ loginLogoBgColor: e.target.value })}
                      />
                      <Input
                        value={draft.loginLogoBgColor ?? DEFAULT_BRANDING.loginLogoBgColor ?? "#ffffff"}
                        onChange={(e) => update({ loginLogoBgColor: e.target.value })}
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("studio.loginLogoBgOpacity")}</Label>
                    <Slider
                      value={[draft.loginLogoBgOpacity ?? DEFAULT_BRANDING.loginLogoBgOpacity ?? 0]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(v) => update({ loginLogoBgOpacity: v[0] })}
                    />
                    <div className="text-xs text-muted-foreground">{t("studio.percent", { n: draft.loginLogoBgOpacity ?? DEFAULT_BRANDING.loginLogoBgOpacity ?? 0 })}</div>
                  </div>
                </div>

                <Separator />

                {/* Login Logo + Font */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.loginLogoUpload")}</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={uploading !== null}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading("login_logo");
                        try {
                          const url = await uploadAsset(file, "login-logo");
                          update({ login_logo_url: url });
                          toast.success(t("studio.uploaded"));
                        } catch (err: any) {
                          toast.error(t("studio.uploadFailed"), { description: err?.message || t("studio.bucketHint") });
                        } finally {
                          setUploading(null);
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">{t("studio.bucketHint")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("studio.fontColor")}</Label>
                    <div className={cn("flex items-center gap-3", isRtl && "flex-row-reverse")}> 
                      <Input
                        type="color"
                        className="h-10 w-16 p-1"
                        value={draft.login_font_color || DEFAULT_BRANDING.login_font_color}
                        onChange={(e) => update({ login_font_color: e.target.value })}
                      />
                      <Input
                        value={draft.login_font_color || DEFAULT_BRANDING.login_font_color}
                        onChange={(e) => update({ login_font_color: e.target.value })}
                        placeholder="#0f172a"
                      />
                    </div>
                  </div>
                </div>

                {/* Browser tab icon */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.faviconUpload")}</Label>
                    <Input
                      type="file"
                      accept="image/*,.ico"
                      disabled={uploading !== null}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading("favicon");
                        try {
                          const url = await uploadAsset(file, "favicon");
                          update({ faviconUrl: url });
                          toast.success(t("studio.uploaded"));
                        } catch (err: any) {
                          toast.error(t("studio.uploadFailed"), { description: err?.message || t("studio.bucketHint") });
                        } finally {
                          setUploading(null);
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">{t("studio.faviconHint")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("studio.faviconUrl")}</Label>
                    <Input
                      value={draft.faviconUrl ?? DEFAULT_BRANDING.faviconUrl ?? ""}
                      onChange={(e) => update({ faviconUrl: e.target.value })}
                      placeholder="https://.../favicon.ico"
                    />
                    <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}> 
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => update({ faviconUrl: "" })}
                        disabled={!draft.faviconUrl}
                      >
                        {t("studio.faviconRemove")}
                      </Button>
                      {draft.faviconUrl ? (
                        <a className="text-xs text-muted-foreground underline" href={draft.faviconUrl} target="_blank" rel="noreferrer">
                          {t("studio.viewImage")}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.loginLogoSize")}</Label>
                    <Slider
                      value={[draft.login_logo_size ?? DEFAULT_BRANDING.login_logo_size ?? 72]}
                      min={48}
                      max={120}
                      step={1}
                      onValueChange={(v) => update({ login_logo_size: v[0] })}
                    />
                    <div className="text-xs text-muted-foreground">{t("studio.pixels", { n: draft.login_logo_size ?? DEFAULT_BRANDING.login_logo_size })}</div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("studio.loginLogoOpacity")}</Label>
                    <Slider
                      value={[draft.login_logo_opacity ?? DEFAULT_BRANDING.login_logo_opacity ?? 100]}
                      min={20}
                      max={100}
                      step={1}
                      onValueChange={(v) => update({ login_logo_opacity: v[0] })}
                    />
                    <div className="text-xs text-muted-foreground">{t("studio.percent", { n: draft.login_logo_opacity ?? DEFAULT_BRANDING.login_logo_opacity })}</div>
                  </div>
                </div>

                <Separator />

                {/* Background */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.backgroundStyle")}</Label>
                    <Select
                      value={(draft.login_bg_style || DEFAULT_BRANDING.login_bg_style) as BgStyle}
                      onValueChange={(v) => update({ login_bg_style: v as BgStyle })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("studio.choose")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">{t("studio.bg.default")}</SelectItem>
                        <SelectItem value="soft">{t("studio.bg.soft")}</SelectItem>
                        <SelectItem value="dark">{t("studio.bg.dark")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("studio.backgroundImage")}</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={uploading !== null}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading("bg");
                        try {
                          const url = await uploadAsset(file, "login-bg");
                          update({ login_bg_image_url: url });
                          toast.success(t("studio.uploaded"));
                        } catch (err: any) {
                          toast.error(t("studio.uploadFailed"), { description: err?.message || t("studio.bucketHint") });
                        } finally {
                          setUploading(null);
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                    <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}> 
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => update({ login_bg_image_url: "" })}
                        disabled={!draft.login_bg_image_url}
                      >
                        {t("studio.remove")}
                      </Button>
                      {draft.login_bg_image_url ? (
                        <a className="text-xs text-muted-foreground underline" href={draft.login_bg_image_url} target="_blank" rel="noreferrer">
                          {t("studio.viewImage")}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("studio.optional")}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.backgroundOverlay")}</Label>
                    <Slider
                      value={[draft.login_bg_overlay ?? DEFAULT_BRANDING.login_bg_overlay ?? 55]}
                      min={20}
                      max={80}
                      step={1}
                      onValueChange={(v) => update({ login_bg_overlay: v[0] })}
                    />
                    <div className="text-xs text-muted-foreground">{t("studio.percent", { n: draft.login_bg_overlay ?? DEFAULT_BRANDING.login_bg_overlay })}</div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("studio.backgroundBlur")}</Label>
                    <Slider
                      value={[draft.login_bg_blur ?? DEFAULT_BRANDING.login_bg_blur ?? 2]}
                      min={0}
                      max={10}
                      step={1}
                      onValueChange={(v) => update({ login_bg_blur: v[0] })}
                    />
                    <div className="text-xs text-muted-foreground">{t("studio.pixels", { n: draft.login_bg_blur ?? DEFAULT_BRANDING.login_bg_blur })}</div>
                  </div>
                </div>

                <Separator />

                <div className={cn("flex items-center justify-end gap-2", isRtl && "flex-row-reverse justify-start")}> 
                  <Button type="button" variant="outline" onClick={handleReset}>
                    <RefreshCw className={cn("h-4 w-4", isRtl ? "ml-2" : "mr-2")} />
                    {t("studio.reset")}
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={saving || isLoading}>
                    <Save className={cn("h-4 w-4", isRtl ? "ml-2" : "mr-2")} />
                    {saving ? t("studio.saving") : t("studio.save")}
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">{t("studio.notePublic")}</div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <div className={cn("flex items-center justify-between", isRtl && "flex-row-reverse")}> 
                <div className="text-sm font-medium">{t("studio.previewTitle")}</div>
                <div className="text-xs text-muted-foreground">{t("studio.previewHint")}</div>
              </div>
              <LoginPreview draft={draft} />
            </div>
          </div>
        </TabsContent>

        {/* SIDEBAR */}
        <TabsContent value="sidebar" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className={cn("flex items-center justify-between gap-2", isRtl && "flex-row-reverse")}> 
                  <span>{t("studio.sidebarBranding")}</span>
                  <Badge variant="secondary">{t("studio.livePreview")}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.sidebarLogoUpload")}</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={uploading !== null}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading("sidebar_logo");
                        try {
                          const url = await uploadAsset(file, "sidebar-logo");
                          update({ sidebar_logo_url: url });
                          toast.success(t("studio.uploaded"));
                        } catch (err: any) {
                          toast.error(t("studio.uploadFailed"), { description: err?.message || t("studio.bucketHint") });
                        } finally {
                          setUploading(null);
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">{t("studio.bucketHint")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("studio.sidebarLogoHeight")}</Label>
                    <Slider
                      value={[draft.sidebar_logo_height ?? DEFAULT_BRANDING.sidebar_logo_height ?? 32]}
                      min={20}
                      max={60}
                      step={1}
                      onValueChange={(v) => update({ sidebar_logo_height: v[0] })}
                    />
                    <div className="text-xs text-muted-foreground">{t("studio.pixels", { n: draft.sidebar_logo_height ?? DEFAULT_BRANDING.sidebar_logo_height })}</div>
                  </div>
                </div>

                {/* Sidebar logo background */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.sidebarLogoBgColor")}</Label>
                    <div className={cn("flex items-center gap-3", isRtl && "flex-row-reverse")}>
                      <Input
                        type="color"
                        className="h-10 w-16 p-1"
                        value={draft.sidebarLogoBgColor ?? DEFAULT_BRANDING.sidebarLogoBgColor ?? "#ffffff"}
                        onChange={(e) => update({ sidebarLogoBgColor: e.target.value })}
                      />
                      <Input
                        value={draft.sidebarLogoBgColor ?? DEFAULT_BRANDING.sidebarLogoBgColor ?? "#ffffff"}
                        onChange={(e) => update({ sidebarLogoBgColor: e.target.value })}
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("studio.sidebarLogoBgOpacity")}</Label>
                    <Slider
                      value={[draft.sidebarLogoBgOpacity ?? DEFAULT_BRANDING.sidebarLogoBgOpacity ?? 0]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(v) => update({ sidebarLogoBgOpacity: v[0] })}
                    />
                    <div className="text-xs text-muted-foreground">{t("studio.percent", { n: draft.sidebarLogoBgOpacity ?? DEFAULT_BRANDING.sidebarLogoBgOpacity ?? 0 })}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("studio.sidebarLogoOpacity")}</Label>
                    <Slider
                      value={[draft.sidebar_logo_opacity ?? DEFAULT_BRANDING.sidebar_logo_opacity ?? 100]}
                      min={20}
                      max={100}
                      step={1}
                      onValueChange={(v) => update({ sidebar_logo_opacity: v[0] })}
                    />
                    <div className="text-xs text-muted-foreground">{t("studio.percent", { n: draft.sidebar_logo_opacity ?? DEFAULT_BRANDING.sidebar_logo_opacity })}</div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("studio.removeSidebarLogo")}</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => update({ sidebar_logo_url: "" })}
                      disabled={!draft.sidebar_logo_url}
                    >
                      {t("studio.remove")}
                    </Button>
                    <div className="text-xs text-muted-foreground">{t("studio.sidebarLogoFallback")}</div>
                  </div>
                </div>

                <Separator />

                <div className={cn("flex items-center justify-end gap-2", isRtl && "flex-row-reverse justify-start")}> 
                  <Button type="button" variant="outline" onClick={handleReset}>
                    <RefreshCw className={cn("h-4 w-4", isRtl ? "ml-2" : "mr-2")} />
                    {t("studio.reset")}
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={saving || isLoading}>
                    <Save className={cn("h-4 w-4", isRtl ? "ml-2" : "mr-2")} />
                    {saving ? t("studio.saving") : t("studio.save")}
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">{t("studio.notePublic")}</div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <div className={cn("flex items-center justify-between", isRtl && "flex-row-reverse")}> 
                <div className="text-sm font-medium">{t("studio.previewTitle")}</div>
                <div className="text-xs text-muted-foreground">{t("studio.previewHint")}</div>
              </div>
              <SidebarPreview draft={draft} />
            </div>
          </div>
        </TabsContent>

        {/* SYSTEM */}
        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className={cn("flex items-center justify-between gap-2", isRtl && "flex-row-reverse")}>
                  <span>{t("studio.systemTitle")}</span>
                  <Badge variant="secondary">{t("studio.optional")}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className={cn("flex items-center justify-between gap-4", isRtl && "flex-row-reverse")}>
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{t("studio.features.backups")}</div>
                      <div className="text-xs text-muted-foreground">{t("studio.features.backupsHint")}</div>
                    </div>
                    <Switch
                      checked={featuresDraft.backupsEnabled}
                      onCheckedChange={(v) => setFeaturesDraft((p) => ({ ...p, backupsEnabled: v }))}
                    />
                  </div>

                  <div className={cn("flex items-center justify-between gap-4", isRtl && "flex-row-reverse")}>
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{t("studio.features.notifications")}</div>
                      <div className="text-xs text-muted-foreground">{t("studio.features.notificationsHint")}</div>
                    </div>
                    <Switch
                      checked={featuresDraft.notificationsEnabled}
                      onCheckedChange={(v) => setFeaturesDraft((p) => ({ ...p, notificationsEnabled: v }))}
                    />
                  </div>

                  <div className={cn("flex items-center justify-between gap-4", isRtl && "flex-row-reverse")}>
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{t("studio.features.realtime")}</div>
                      <div className="text-xs text-muted-foreground">{t("studio.features.realtimeHint")}</div>
                    </div>
                    <Switch
                      checked={featuresDraft.realtimeNotificationsEnabled}
                      onCheckedChange={(v) => setFeaturesDraft((p) => ({ ...p, realtimeNotificationsEnabled: v }))}
                    />
                  </div>

                  <div className={cn("flex items-center justify-between gap-4", isRtl && "flex-row-reverse")}>
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{t("studio.features.reminders")}</div>
                      <div className="text-xs text-muted-foreground">{t("studio.features.remindersHint")}</div>
                    </div>
                    <Switch
                      checked={featuresDraft.remindersEnabled}
                      onCheckedChange={(v) => setFeaturesDraft((p) => ({ ...p, remindersEnabled: v }))}
                    />
                  </div>

                  <div className={cn("flex items-center justify-between gap-4", isRtl && "flex-row-reverse")}>
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{t("studio.features.globalSearch")}</div>
                      <div className="text-xs text-muted-foreground">{t("studio.features.globalSearchHint")}</div>
                    </div>
                    <Switch
                      checked={featuresDraft.globalSearchEnabled}
                      onCheckedChange={(v) => setFeaturesDraft((p) => ({ ...p, globalSearchEnabled: v }))}
                    />
                  </div>

                  <div className={cn("flex items-center justify-between gap-4", isRtl && "flex-row-reverse")}>
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{t("studio.features.resetDemo")}</div>
                      <div className="text-xs text-muted-foreground">
                        {isProd ? t("studio.features.resetDemoProdLocked") : t("studio.features.resetDemoHint")}
                      </div>
                    </div>
                    <Switch
                      checked={featuresDraft.resetDemoEnabled && !isProd}
                      disabled={isProd}
                      onCheckedChange={(v) => {
                        if (isProd) return;
                        setFeaturesDraft((p) => ({ ...p, resetDemoEnabled: v }));
                      }}
                    />
                  </div>
                </div>

                <div className={cn("flex items-center justify-end gap-2", isRtl && "flex-row-reverse justify-start")}>
                  <Button type="button" onClick={handleSaveFeatures}>
                    <Save className={cn("h-4 w-4", isRtl ? "ml-2" : "mr-2")} />
                    {t("studio.saveFeatures")}
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className={cn("flex items-center gap-2 text-sm font-medium", isRtl && "flex-row-reverse")}>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>{t("studio.resetDemoTitle")}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{t("studio.resetDemoDesc")}</div>
                  {isProd ? (
                    <div className="text-xs text-muted-foreground">
                      {t("studio.resetDemoProdLocked")}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isProd || !featuresDraft.resetDemoEnabled}
                    onClick={() => setResetDialogOpen(true)}
                  >
                    <Trash2 className={cn("h-4 w-4", isRtl ? "ml-2" : "mr-2")} />
                    {t("studio.resetDemoButton")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className={cn(isRtl && "text-right")}>{t("studio.opsNotesTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div>{t("studio.opsNotes1")}</div>
                <div>{t("studio.opsNotes2")}</div>
                <div>{t("studio.opsNotes3")}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reset demo dialog */}
        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <DialogContent className={cn(isRtl && "text-right")}>
            <DialogHeader>
              <DialogTitle>{t("studio.resetDemoConfirmTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">{t("studio.resetDemoConfirmDesc")}</div>
              <Input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder={t("studio.resetDemoType")} />
            </div>
            <DialogFooter className={cn(isRtl && "flex-row-reverse justify-start")}>
              <Button type="button" variant="outline" onClick={() => setResetDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={resetBusy || resetConfirm.trim().toUpperCase() !== "RESET"}
                onClick={async () => {
                  setResetBusy(true);
                  try {
                    const { error } = await supabase.rpc("admin_reset_demo_data", { p_confirm: "RESET" } as any);
                    if (error) throw error;
                    toast.success(t("studio.resetDone"));
                    setResetDialogOpen(false);
                    setResetConfirm("");
                  } catch (e: any) {
                    toast.error(t("studio.resetFailed"), { description: e?.message || "" });
                  } finally {
                    setResetBusy(false);
                  }
                }}
              >
                {resetBusy ? t("common.loading") : t("studio.resetDemoConfirmButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </Tabs>
    </MainLayout>
  );
}
