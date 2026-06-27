import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FeatureFlags = {
  backupsEnabled: boolean;
  notificationsEnabled: boolean;
  browserNotificationsEnabled: boolean;
  remindersEnabled: boolean;
  realtimeNotificationsEnabled: boolean;
  globalSearchEnabled: boolean;
  resetDemoEnabled: boolean;
};

// Safe defaults: keep core UX enabled, keep destructive/admin-only actions opt-in.
export const DEFAULT_FEATURES: FeatureFlags = {
  backupsEnabled: false,
  notificationsEnabled: true,
  browserNotificationsEnabled: false,
  remindersEnabled: true,
  realtimeNotificationsEnabled: true,
  globalSearchEnabled: true,
  resetDemoEnabled: false,
};

async function fetchFeatures(): Promise<FeatureFlags> {
  try {
    const { data, error } = await supabase
      .from("app_settings" as any)
      .select("value")
      .eq("key", "features")
      .maybeSingle();

    if (error) return DEFAULT_FEATURES;

    const v = (data as any)?.value;
    if (!v || typeof v !== "object") return DEFAULT_FEATURES;

    return { ...DEFAULT_FEATURES, ...(v as any) };
  } catch {
    return DEFAULT_FEATURES;
  }
}

export function useFeatures() {
  const q = useQuery({
    queryKey: ["app_settings", "features"],
    queryFn: fetchFeatures,
    staleTime: 60_000,
  });

  return {
    features: q.data ?? DEFAULT_FEATURES,
    isLoading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  };
}
