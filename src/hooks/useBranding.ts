import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BrandingSettings = {
  // Names
  brand_title_en?: string;
  brand_title_ar?: string;
  brand_subtitle_en?: string;
  brand_subtitle_ar?: string;

  // Login screen
  login_font_color?: string; // hex
  login_logo_url?: string; // square
  login_logo_size?: number; // px
  login_logo_opacity?: number; // 0..100
  // Logo background (wrapper behind logo)
  loginLogoBgColor?: string; // hex
  loginLogoBgOpacity?: number; // 0..100
  login_bg_style?: "default" | "soft" | "dark";
  login_bg_image_url?: string;
  login_bg_overlay?: number; // 0..100
  login_bg_blur?: number; // 0..10

  // Sidebar / header
  sidebar_logo_url?: string; // wide
  sidebar_logo_height?: number; // px
  sidebar_logo_opacity?: number; // 0..100
  // Logo background (wrapper behind logo)
  sidebarLogoBgColor?: string; // hex
  sidebarLogoBgOpacity?: number; // 0..100

  // Browser tab icon
  faviconUrl?: string; // public URL (png/ico/svg)
};

export const DEFAULT_BRANDING: BrandingSettings = {
  brand_title_en: "Al Modawat Specialized Medical Company",
  brand_title_ar: "شركة المداواة التخصصية الطبية",
  brand_subtitle_en: "Fleet & Transport Operations",
  brand_subtitle_ar: "إدارة الأسطول والنقل",

  login_font_color: "#0f172a",

  login_logo_url: "",
  login_logo_size: 72,
  login_logo_opacity: 100,

  // Default: transparent background
  loginLogoBgColor: "#ffffff",
  loginLogoBgOpacity: 0,

  login_bg_style: "default",
  login_bg_image_url: "",
  login_bg_overlay: 55,
  login_bg_blur: 2,

  sidebar_logo_url: "",
  sidebar_logo_height: 32,
  sidebar_logo_opacity: 100,

  // Default: transparent background
  sidebarLogoBgColor: "#ffffff",
  sidebarLogoBgOpacity: 0,

  faviconUrl: "",
};

async function fetchBranding(): Promise<BrandingSettings> {
  try {
    const { data, error } = await supabase
      .from("app_settings" as any)
      .select("value")
      .eq("key", "branding")
      .maybeSingle();

    if (error) {
      // Table may not exist yet; return defaults without breaking app.
      return DEFAULT_BRANDING;
    }

    const v = (data as any)?.value;
    if (!v || typeof v !== "object") return DEFAULT_BRANDING;

    return { ...DEFAULT_BRANDING, ...(v as any) };
  } catch {
    return DEFAULT_BRANDING;
  }
}

export function useBranding() {
  const query = useQuery({
    queryKey: ["app_settings", "branding"],
    queryFn: fetchBranding,
    staleTime: 60_000,
  });

  return {
    branding: query.data ?? DEFAULT_BRANDING,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
