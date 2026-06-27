import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

import {
  LayoutDashboard,
  Car,
  Route,
  ClipboardCheck,
  Users,
  Shield,
  Settings,
  BarChart3,
  Truck,
  MapPin,
  Wrench,
  Plus,
  DollarSign,
  LogOut,
  Search,
  Bell,
  Building2,
  AlertTriangle,
  FileText,
} from "lucide-react";

type PageCommand = {
  icon: React.ElementType;
  labelKey: string;
  defaultLabel: string;
  path: string;
  keywords?: string[];
  permission?: string;
  permissions?: string[];
  groupKey: string;
  defaultGroup: string;
};

type SearchHit = {
  id: string;
  type: "vehicle" | "trip" | "maintenance" | "user" | "department" | "destination";
  title: string;
  subtitle?: string;
  path: string;
  icon: React.ElementType;
};

const pageCommands: PageCommand[] = [
  { icon: LayoutDashboard, labelKey: "cmd.pages.dashboard", defaultLabel: "Dashboard", path: "/dashboard", keywords: ["home", "overview"], groupKey: "cmd.group.main", defaultGroup: "Main" },

  { icon: Route, labelKey: "cmd.pages.trips", defaultLabel: "All Trips", path: "/trips", keywords: ["journeys", "travel"], permissions: ["trips.read_own", "trips.read_all", "trips.read_department"], groupKey: "cmd.group.trips", defaultGroup: "Trips" },
  { icon: Plus, labelKey: "cmd.pages.newTrip", defaultLabel: "New Trip", path: "/trips/new", keywords: ["create", "add", "request"], permission: "trips.create", groupKey: "cmd.group.trips", defaultGroup: "Trips" },
  { icon: ClipboardCheck, labelKey: "cmd.pages.approvals", defaultLabel: "Approvals", path: "/approvals", keywords: ["pending", "review", "approve"], permissions: ["trips.approve", "trips.reject"], groupKey: "cmd.group.trips", defaultGroup: "Trips" },

  { icon: Car, labelKey: "cmd.pages.vehicles", defaultLabel: "Vehicles", path: "/vehicles", keywords: ["cars", "fleet"], permissions: ["vehicles.read", "vehicles.read_all", "vehicles.read_department"], groupKey: "cmd.group.fleet", defaultGroup: "Fleet" },
  { icon: Wrench, labelKey: "cmd.pages.maintenance", defaultLabel: "Maintenance", path: "/maintenance", keywords: ["service", "repair"], permissions: ["vehicles.read", "vehicles.read_all", "vehicles.read_department"], groupKey: "cmd.group.fleet", defaultGroup: "Fleet" },
  { icon: Truck, labelKey: "cmd.pages.vehicleTypes", defaultLabel: "Vehicle Types", path: "/vehicle-types", keywords: ["categories", "types"], permission: "vehicle_types.read", groupKey: "cmd.group.fleet", defaultGroup: "Fleet" },
  { icon: MapPin, labelKey: "cmd.pages.destinations", defaultLabel: "Destinations", path: "/destinations", keywords: ["locations"], permission: "settings.manage", groupKey: "cmd.group.fleet", defaultGroup: "Fleet" },

  { icon: BarChart3, labelKey: "cmd.pages.reports", defaultLabel: "Reports Overview", path: "/reports", keywords: ["analytics"], permission: "reports.read", groupKey: "cmd.group.reports", defaultGroup: "Reports" },
  { icon: DollarSign, labelKey: "cmd.pages.maintenanceCosts", defaultLabel: "Maintenance Costs", path: "/reports/maintenance-costs", keywords: ["spending", "expenses"], permission: "reports.read", groupKey: "cmd.group.reports", defaultGroup: "Reports" },
  { icon: FileText, labelKey: "cmd.pages.complianceReport", defaultLabel: "Compliance", path: "/reports/compliance", keywords: ["insurance", "registration"], permission: "reports.read", groupKey: "cmd.group.reports", defaultGroup: "Reports" },
  { icon: AlertTriangle, labelKey: "cmd.pages.anomalies", defaultLabel: "Anomalies", path: "/reports/anomalies", keywords: ["odometer", "anomaly", "alerts"], permission: "reports.read", groupKey: "cmd.group.reports", defaultGroup: "Reports" },

  { icon: Bell, labelKey: "cmd.pages.notifications", defaultLabel: "Notifications", path: "/notifications", keywords: ["alerts"], permissions: ["vehicles.read", "trips.read_own", "trips.read_all"], groupKey: "cmd.group.admin", defaultGroup: "Administration" },
  { icon: Users, labelKey: "cmd.pages.users", defaultLabel: "Users", path: "/users", keywords: ["staff", "employees"], permission: "users.read", groupKey: "cmd.group.admin", defaultGroup: "Administration" },
  { icon: Shield, labelKey: "cmd.pages.roles", defaultLabel: "Roles", path: "/roles", keywords: ["permissions"], permission: "roles.read", groupKey: "cmd.group.admin", defaultGroup: "Administration" },
  { icon: Settings, labelKey: "cmd.pages.settings", defaultLabel: "Settings", path: "/settings", keywords: ["configuration"], permission: "settings.manage", groupKey: "cmd.group.admin", defaultGroup: "Administration" },
];

function uniqBy<T>(arr: T[], keyFn: (x: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

export function CommandPalette() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);

  const navigate = useNavigate();
  const { profile, hasPermission, hasAnyPermission, signOut } = useAuth();

  const lastIssuedRef = useRef<number>(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const visiblePages = useMemo(() => {
    return pageCommands.filter((item) => {
      if (!item.permission && !item.permissions) return true;
      if (item.permission) return hasPermission(item.permission);
      if (item.permissions) return hasAnyPermission(item.permissions);
      return false;
    });
  }, [hasPermission, hasAnyPermission]);

  const groupedPages = useMemo(() => {
    const groups: Record<string, PageCommand[]> = {};
    for (const cmd of visiblePages) {
      const g = cmd.groupKey;
      if (!groups[g]) groups[g] = [];
      groups[g].push(cmd);
    }
    return groups;
  }, [visiblePages]);

  const handleSelect = (path: string) => {
    setOpen(false);
    setQuery("");
    setHits([]);
    navigate(path);
  };

  const handleSignOut = () => {
    setOpen(false);
    setQuery("");
    setHits([]);
    signOut();
  };

  // ---------- Global search (DB) ----------
  useEffect(() => {
    const q = query.trim();
    if (!open) return;
    if (q.length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }

    const issuedAt = Date.now();
    lastIssuedRef.current = issuedAt;
    setBusy(true);

    const timer = window.setTimeout(async () => {
      try {
        const canSearchUsers = hasAnyPermission(["users.read", "settings.manage"]);
        const canSearchVehicles = hasAnyPermission(["vehicles.read", "vehicles.read_all", "vehicles.read_department"]);
        const canSearchTrips = hasAnyPermission(["trips.read_all", "trips.read_own", "trips.read_department"]);
        const canSearchMaintenance = hasAnyPermission(["vehicles.read", "vehicles.read_all", "vehicles.read_department"]);
        const canSearchSettings = hasPermission("settings.manage");

        const deptId = profile?.department_id ?? null;
        const like = `%${q}%`;

        const tasks: Promise<SearchHit[]>[] = [];

        if (canSearchVehicles) {
          const p = (async () => {
            let qb = supabase
              .from("vehicles")
              .select("id, vehicle_code, plate_no, department_id")
              .or(`vehicle_code.ilike.${like},plate_no.ilike.${like}`)
              .limit(6);

            if (!hasPermission("vehicles.read_all") && hasPermission("vehicles.read_department") && deptId) {
              qb = qb.eq("department_id", deptId);
            }

            const { data } = await qb;
            return (data || []).map((v: any) => ({
              id: v.id,
              type: "vehicle",
              title: `${v.vehicle_code} — ${v.plate_no}`,
              subtitle: t("cmd.result.vehicle"),
              path: `/vehicles/${v.id}`,
              icon: Car,
            }));
          })();
          tasks.push(p);
        }

        if (canSearchTrips) {
          const p = (async () => {
            let qb = supabase
              .from("trips")
              .select("id, trip_no, destination_text, department_id, requested_at")
              .or(`trip_no.ilike.${like},destination_text.ilike.${like}`)
              .order("requested_at", { ascending: false })
              .limit(6);

            if (!hasPermission("trips.read_all") && hasPermission("trips.read_department") && deptId) {
              qb = qb.eq("department_id", deptId);
            }
            // trips.read_own handled by RLS in DB
            const { data } = await qb;
            return (data || []).map((tr: any) => ({
              id: tr.id,
              type: "trip",
              title: `${tr.trip_no} — ${tr.destination_text || ""}`.trim(),
              subtitle: t("cmd.result.trip"),
              path: `/trips/${tr.id}`,
              icon: Route,
            }));
          })();
          tasks.push(p);
        }

        if (canSearchMaintenance) {
          const p = (async () => {
            let qb = supabase
              .from("maintenance_records")
              .select("id, vehicle_id, maintenance_type, scheduled_date, status, vehicle:vehicles(vehicle_code, plate_no, department_id)")
              .or(`maintenance_type.ilike.${like},status.ilike.${like}`)
              .order("scheduled_date", { ascending: false })
              .limit(6);

            // department gate (if table is linked)
            if (!hasPermission("vehicles.read_all") && hasPermission("vehicles.read_department") && deptId) {
              qb = qb.eq("vehicle.department_id", deptId);
            }

            const { data } = await qb;
            return (data || []).map((m: any) => {
              const vc = m.vehicle?.vehicle_code || "";
              const pl = m.vehicle?.plate_no || "";
              return {
                id: m.id,
                type: "maintenance",
                title: `${t("cmd.result.maintenance")}: ${m.maintenance_type} — ${vc} ${pl}`.trim(),
                subtitle: m.status,
                path: `/maintenance`,
                icon: Wrench,
              };
            });
          })();
          tasks.push(p);
        }

        if (canSearchUsers) {
          const p = (async () => {
            let qb = supabase
              .from("profiles")
              .select("id, name_en, name_ar, staff_id, department_id")
              .or(`name_en.ilike.${like},name_ar.ilike.${like},staff_id.ilike.${like}`)
              .limit(6);

            if (!hasPermission("users.read_all") && hasPermission("users.read_department") && deptId) {
              qb = qb.eq("department_id", deptId);
            }

            const { data } = await qb;
            return (data || []).map((u: any) => ({
              id: u.id,
              type: "user",
              title: (isRtl ? u.name_ar : u.name_en) || u.name_en || u.name_ar || u.staff_id,
              subtitle: u.staff_id ? `${t("cmd.result.staffId")}: ${u.staff_id}` : t("cmd.result.user"),
              path: `/users`,
              icon: Users,
            }));
          })();
          tasks.push(p);
        }

        if (canSearchSettings) {
          const p = (async () => {
            const { data } = await supabase
              .from("departments")
              .select("id, name")
              .ilike("name", like)
              .limit(6);

            return (data || []).map((d: any) => ({
              id: d.id,
              type: "department",
              title: d.name,
              subtitle: t("cmd.result.department"),
              path: `/settings`,
              icon: Building2,
            }));
          })();
          tasks.push(p);
        }

        const all = (await Promise.all(tasks)).flat();
        if (lastIssuedRef.current !== issuedAt) return; // stale response

        setHits(uniqBy(all, (x) => `${x.type}:${x.id}`));
      } catch {
        if (lastIssuedRef.current === issuedAt) setHits([]);
      } finally {
        if (lastIssuedRef.current === issuedAt) setBusy(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, open, hasPermission, hasAnyPermission, profile?.department_id, isRtl, t]);

  const groupedHits = useMemo(() => {
    const g: Record<string, SearchHit[]> = {};
    for (const h of hits) {
      const key =
        h.type === "vehicle" ? "cmd.results.vehicles" :
        h.type === "trip" ? "cmd.results.trips" :
        h.type === "maintenance" ? "cmd.results.maintenance" :
        h.type === "user" ? "cmd.results.users" :
        h.type === "department" ? "cmd.results.departments" :
        "cmd.results.other";
      if (!g[key]) g[key] = [];
      g[key].push(h);
    }
    return g;
  }, [hits]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted rounded-lg border border-border/50 transition-colors ${isRtl ? "flex-row-reverse" : ""}`}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">{t("cmd.openSearch")}</span>
        <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setQuery("");
            setHits([]);
            setBusy(false);
          }
        }}
      >
        <CommandInput
          placeholder={t("cmd.searchPlaceholder")}
          value={query}
          onValueChange={setQuery}
          className={isRtl ? "text-right" : "text-left"}
        />
        <CommandList>
          <CommandEmpty>{busy ? t("cmd.searching") : t("cmd.noResults")}</CommandEmpty>

          {/* Pages */}
          <CommandGroup heading={t("cmd.section.pages")}>
            {Object.entries(groupedPages).map(([groupKey, items], idx) => (
              <div key={groupKey}>
                {idx > 0 && <CommandSeparator />}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {t(groupKey, { defaultValue: items[0]?.defaultGroup || groupKey })}
                </div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const label = t(item.labelKey, { defaultValue: item.defaultLabel });
                  return (
                    <CommandItem
                      key={item.path}
                      value={`${label} ${(item.keywords || []).join(" ")}`}
                      onSelect={() => handleSelect(item.path)}
                      className={`flex items-center gap-3 cursor-pointer ${isRtl ? "flex-row-reverse" : ""}`}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{label}</span>
                    </CommandItem>
                  );
                })}
              </div>
            ))}
          </CommandGroup>

          {/* Results */}
          {hits.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("cmd.section.results")}>
                {Object.entries(groupedHits).map(([k, items], idx) => (
                  <div key={k}>
                    {idx > 0 && <CommandSeparator />}
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {t(k)}
                    </div>
                    {items.map((h) => {
                      const Icon = h.icon;
                      return (
                        <CommandItem
                          key={`${h.type}:${h.id}`}
                          value={`${h.title} ${h.subtitle || ""}`}
                          onSelect={() => handleSelect(h.path)}
                          className={`flex items-center gap-3 cursor-pointer ${isRtl ? "flex-row-reverse" : ""}`}
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <div className={isRtl ? "text-right" : "text-left"}>
                            <div className="text-sm">{h.title}</div>
                            {h.subtitle ? <div className="text-xs text-muted-foreground">{h.subtitle}</div> : null}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </div>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Actions */}
          <CommandSeparator />
          <CommandGroup heading={t("cmd.section.actions")}>
            <CommandItem
              onSelect={handleSignOut}
              className={`flex items-center gap-3 cursor-pointer text-destructive ${isRtl ? "flex-row-reverse" : ""}`}
            >
              <LogOut className="h-4 w-4" />
              <span>{t("cmd.signOut")}</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
