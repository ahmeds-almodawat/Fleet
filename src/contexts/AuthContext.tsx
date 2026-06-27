import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { hasAnyPermissionInSet, permissionSetHas } from '@/lib/permissionAliases';

interface Profile {
  id: string;
  staff_id: string;
  name_en: string;
  name_ar: string;
  job_title: string;
  phone: string | null;
  department_id: string | null;
  active: boolean;
  is_driver?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  permissions: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    profileData: Omit<Profile, 'id' | 'active'>
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // bump this whenever auth state changes (even if same user)
  const [authTick, setAuthTick] = useState(0);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    setProfile(data ?? null);
  };

  const fetchPermissions = async (userId: string) => {
    const { data, error } = await supabase.rpc('get_user_permissions', { _user_id: userId });
    if (error) throw error;

    const keys = Array.isArray(data)
      ? data.map((p: { permission_key: string }) => p.permission_key)
      : [];
    setPermissions(keys);
  };

  const loadProfileAndPerms = async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setPermissions([]);
      return;
    }
    await fetchProfile(u.id);
    await fetchPermissions(u.id);
  };

  // 1) Auth session bootstrap + listener (NO async supabase queries here)
  useEffect(() => {
    let mounted = true;

    const applySession = (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      setAuthTick((x) => x + 1);
    };

    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        applySession(data.session ?? null);
      } catch (e) {
        console.error('auth.getSession failed', e);
        applySession(null);
      }
      // do NOT setLoading(false) here — we wait for profile/permissions effect
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      // IMPORTANT: only sync state here. No awaits. (avoid deadlock)
      applySession(s);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 2) Load profile + permissions OUTSIDE onAuthStateChange
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        await loadProfileAndPerms(user);
      } catch (e) {
        console.error('loadProfileAndPerms failed', e);
        // fail-safe: don’t freeze the app on loading
        setProfile(null);
        setPermissions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // authTick makes it refetch when token refresh happens too
  }, [user?.id, authTick]);

  const refreshProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await loadProfileAndPerms(user);
    } catch (e) {
      console.error('refreshProfile failed', e);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ?? null };
  };

  // NOTE: your DB trigger already creates profiles on auth signup.
  // Keep this, but make it safe using upsert instead of insert (optional).
  const signUp = async (
    email: string,
    password: string,
    profileData: Omit<Profile, 'id' | 'active'>
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) return { error: error ?? null };

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert(
        { id: data.user.id, ...profileData, active: true },
        { onConflict: 'id' }
      );

      if (profileError) return { error: profileError ?? null };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setPermissions([]);
  };

  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const hasPermission = (permission: string) => permissionSetHas(permissionSet, permission);
  const hasAnyPermission = (perms: string[]) => hasAnyPermissionInSet(permissionSet, perms);

  const value = useMemo<AuthContextType>(() => ({
    user,
    session,
    profile,
    permissions,
    loading,
    signIn,
    signUp,
    signOut,
    hasPermission,
    hasAnyPermission,
    refreshProfile,
  }), [user, session, profile, permissions, permissionSet, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
