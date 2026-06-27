import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
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
  LogOut,
  MapPin,
  Wrench,
  ChevronDown,
  Plus,
  FileText,
  FileDown,
  DollarSign,
  ShieldAlert,
  AlertTriangle,
  Bell,
  ImageIcon,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useBranding, DEFAULT_BRANDING } from '@/hooks/useBranding';
import { useFeatures } from '@/hooks/useFeatures';
import { hexToRgba } from '@/lib/color';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  permission?: string;
  permissions?: string[];
  children?: NavItem[];
}

const mainNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
];

const tripsNavItems: NavItem[] = [
  { 
    icon: Route, 
    label: "Trips", 
    path: "/trips", 
    children: [
      { icon: Route, label: "All Trips", path: "/trips" },
      { icon: Plus, label: "New Trip", path: "/trips/new" },
    ]
  },
  { icon: ClipboardCheck, label: "Approvals", path: "/approvals" },
];

const fleetNavItems: NavItem[] = [
  { icon: Car, label: "Vehicles", path: "/vehicles" },
  { icon: Wrench, label: "Maintenance", path: "/maintenance" },
  { icon: Truck, label: "Vehicle Types", path: "/vehicle-types" },
  { icon: MapPin, label: "Destinations", path: "/destinations" },
];

const reportsNavItems: NavItem[] = [
  { 
    icon: BarChart3, 
    label: "Reports", 
    path: "/reports", 
    children: [
      { icon: FileText, label: "Overview", path: "/reports" },
      { icon: DollarSign, label: "Maintenance Costs", path: "/reports/maintenance-costs" },
      { icon: ShieldAlert, label: "Compliance", path: "/reports/compliance" },
      { icon: AlertTriangle, label: "Anomalies", path: "/reports/anomalies" },
    ]
  },
];

const adminNavItems: NavItem[] = [
  { icon: Users, label: "Users", path: "/users" },
  { icon: Shield, label: "Roles", path: "/roles" },
  { icon: ShieldAlert, label: "Audit Logs", path: "/admin/audit", permission: 'audit.read' },
  { icon: ClipboardCheck, label: "Jobs", path: "/admin/jobs", permission: 'system.jobs.view' },
  { icon: Activity, label: "System Health", path: "/admin/health", permissions: ['system.health.view', 'system.jobs.view'] },
  { icon: FileDown, label: "Backups", path: "/admin/backups", permission: 'system.backup.export' },
  { icon: ImageIcon, label: "Studio", path: "/admin/studio", permissions: ['studio.manage','settings.manage'] },
  { icon: Settings, label: "Settings", path: "/settings" },
];

function filterNavItems(items: NavItem[], hasPermission: (p: string) => boolean, hasAnyPermission: (p: string[]) => boolean): NavItem[] {
  return items.filter(item => {
    if (!item.permission && !item.permissions) return true;
    if (item.permission) return hasPermission(item.permission);
    if (item.permissions) return hasAnyPermission(item.permissions);
    return false;
  }).map(item => ({
    ...item,
    children: item.children ? filterNavItems(item.children, hasPermission, hasAnyPermission) : undefined
  }));
}

function NavItemWithChildren({
  item,
  collapsed,
  unreadCount = 0,
  translate,
  isRtl,
}: {
  item: NavItem;
  collapsed: boolean;
  unreadCount?: number;
  translate: (label: string) => string;
  isRtl: boolean;
}) {
  const location = useLocation();
  const Icon = item.icon;
  const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
  const isChildActive = item.children?.some(child => 
    location.pathname === child.path || location.pathname.startsWith(child.path + "/")
  );

  if (!item.children || item.children.length === 0) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive}>
          <Link
            to={item.path}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 transition-all",
              isRtl && "flex-row-reverse",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex items-center justify-between w-full">
                        <span>{translate(item.label)}</span>
                        {item.path === '/notifications' && unreadCount > 0 && (
                          <span className={cn(isRtl ? "mr-2" : "ml-2", "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-foreground")}>
                            {unreadCount}
                          </span>
                        )}
                      </span>}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible defaultOpen={isActive || isChildActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={isActive || isChildActive}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 transition-all w-full",
              isRtl && "flex-row-reverse",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
              <span className={cn("flex-1", isRtl ? "text-right" : "text-left")}>{translate(item.label)}</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
              </>
            )}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        {!collapsed && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children.map((child) => {
                const ChildIcon = child.icon;
                const isChildItemActive = location.pathname === child.path;
                return (
                  <SidebarMenuSubItem key={child.path}>
                    <SidebarMenuSubButton asChild isActive={isChildItemActive}>
                      <Link to={child.path} className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}> 
                        <ChildIcon className="h-3.5 w-3.5" />
                        <span>{translate(child.label)}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppSidebar({ side }: { side?: 'left' | 'right' }) {
  const location = useLocation();
  const { hasPermission, hasAnyPermission, profile, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useTranslation();
  const { branding } = useBranding();
  const { features } = useFeatures();
  const isRtl = (i18n.language || '').startsWith('ar');

  const sidebarLogoBgColor = (branding.sidebarLogoBgColor ?? DEFAULT_BRANDING.sidebarLogoBgColor ?? '#ffffff') as string;
  const sidebarLogoBgOpacity = ((branding.sidebarLogoBgOpacity ?? DEFAULT_BRANDING.sidebarLogoBgOpacity ?? 0) as number) / 100;

  const translate = (label: string) => {
    switch (label) {
      case 'Dashboard': return t('nav.dashboard');
      case 'Vehicles': return t('nav.vehicles');
      case 'Trips': return t('nav.trips');
      case 'Notifications': return t('nav.notifications');
      case 'New Trip': return t('trips.newTrip');
      case 'All Trips': return t('trips.allTrips');
      case 'Approvals': return t('nav.approvals');
      case 'Maintenance': return t('nav.maintenance');
      case 'Vehicle Types': return t('nav.vehicleTypes');
      case 'Jobs': return t('nav.jobs');
      case 'Destinations': return t('nav.destinations');
      case 'Departments': return t('nav.departments');
      case 'Users': return t('nav.users');
      case 'Roles': return t('nav.roles');
      case 'Roles & Permissions': return t('roles.title');
      case 'Settings': return t('nav.settings');
      case 'Studio': return t('nav.studio');
      case 'Reports': return t('nav.reports');
      case 'Overview': return t('reports.overview');
      case 'Maintenance Costs': return t('reports.maintenanceCosts');
      case 'Compliance': return t('reports.compliance');
      case 'Anomalies': return t('reports.anomalies.title');
      case 'Audit Logs': return t('audit.title');
      default: return label;
    }
  };

  // Unread notifications badge (safe fallback: 0 if RPC not available)
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    if (!features.notificationsEnabled) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    const loadUnread = async () => {
      try {
        const { data, error } = await supabase.rpc("get_unread_notifications_count");
        if (cancelled) return;
        if (error) {
          // If RPC doesn't exist yet or RLS blocks it, just hide the badge.
          setUnreadCount(0);
          return;
        }
        const asNum = typeof data === "number" ? data : parseInt(String(data ?? "0"), 10);
        setUnreadCount(Number.isFinite(asNum) ? asNum : 0);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    };

    loadUnread();

    // Realtime: update badge instantly when a new notification arrives.
    // We subscribe only when we know the current profile id.
    let channel: any = null;
    if (profile?.id) {
      channel = supabase
        .channel(`rt:notifications:${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${profile.id}`,
          } as any,
          () => loadUnread()
        )
        .subscribe();
    }

    const interval = setInterval(loadUnread, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const effectiveMainNav = features.notificationsEnabled
    ? mainNavItems
    : mainNavItems.filter((i) => i.path !== "/notifications");

  const effectiveAdminNav = features.backupsEnabled
    ? adminNavItems
    : adminNavItems.filter((i) => i.path !== "/admin/backups");

  const mainItems = filterNavItems(effectiveMainNav, hasPermission, hasAnyPermission);
  const tripsItems = filterNavItems(tripsNavItems, hasPermission, hasAnyPermission);
  const fleetItems = filterNavItems(fleetNavItems, hasPermission, hasAnyPermission);
  const reportsItems = filterNavItems(reportsNavItems, hasPermission, hasAnyPermission);
  const adminItems = filterNavItems(effectiveAdminNav, hasPermission, hasAnyPermission);

  return (
    <Sidebar
      side={side}
      collapsible="icon"
      className={cn(
        "border-sidebar-border",
        side === 'right' ? 'border-l' : 'border-r'
      )}
    >
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link to="/dashboard" className={cn("flex items-center gap-3", isRtl && "flex-row-reverse")}>
          <div
            className={cn(
              "flex items-center justify-center rounded-xl bg-sidebar-accent/30 border border-sidebar-border/60 shadow-lg overflow-hidden",
              collapsed ? "h-10 w-10" : "px-3 py-2"
            )}
            style={{ backgroundColor: hexToRgba(sidebarLogoBgColor, sidebarLogoBgOpacity) }}
          >
            {collapsed ? (
              (branding.login_logo_url || DEFAULT_BRANDING.login_logo_url) ? (
                <img
                  src={(branding.login_logo_url || DEFAULT_BRANDING.login_logo_url) as string}
                  alt="logo"
                  className="h-8 w-8 object-contain"
                  style={{ opacity: ((branding.login_logo_opacity ?? DEFAULT_BRANDING.login_logo_opacity ?? 100) as number) / 100 }}
                />
              ) : (
                <Truck className="h-5 w-5 text-sidebar-primary-foreground" />
              )
            ) : ((branding.sidebar_logo_url || branding.login_logo_url || DEFAULT_BRANDING.sidebar_logo_url || DEFAULT_BRANDING.login_logo_url) ? (
              <img
                src={(branding.sidebar_logo_url || branding.login_logo_url || DEFAULT_BRANDING.sidebar_logo_url || DEFAULT_BRANDING.login_logo_url) as string}
                alt="logo"
                className="max-w-[180px] object-contain"
                style={{
                  height: (branding.sidebar_logo_height ?? DEFAULT_BRANDING.sidebar_logo_height ?? 32),
                  opacity: ((branding.sidebar_logo_opacity ?? DEFAULT_BRANDING.sidebar_logo_opacity ?? 100) as number) / 100,
                }}
              />
            ) : (
              <Truck className="h-5 w-5 text-sidebar-primary-foreground" />
            ))}
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold text-sidebar-foreground">{(isRtl ? (branding.brand_title_ar || DEFAULT_BRANDING.brand_title_ar) : (branding.brand_title_en || DEFAULT_BRANDING.brand_title_en))}</h1>
              <p className="text-xs text-sidebar-foreground/60">{(isRtl ? (branding.brand_subtitle_ar || DEFAULT_BRANDING.brand_subtitle_ar) : (branding.brand_subtitle_en || DEFAULT_BRANDING.brand_subtitle_en))}</p>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4 flex-1 min-h-0 overflow-y-auto">
        {/* Main Navigation */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 px-3 mb-2">{t('layout.section.main')}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <NavItemWithChildren key={item.path} item={item} collapsed={collapsed} unreadCount={unreadCount} translate={translate} isRtl={isRtl} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Trips & Approvals */}
        {tripsItems.length > 0 && (
          <SidebarGroup className="mt-4">
            {!collapsed && <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 px-3 mb-2">{t('layout.section.trips')}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {tripsItems.map((item) => (
                  <NavItemWithChildren key={item.path} item={item} collapsed={collapsed} unreadCount={unreadCount} translate={translate} isRtl={isRtl} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Fleet Management */}
        {fleetItems.length > 0 && (
          <SidebarGroup className="mt-4">
            {!collapsed && <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 px-3 mb-2">{t('layout.section.fleet')}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {fleetItems.map((item) => (
                  <NavItemWithChildren key={item.path} item={item} collapsed={collapsed} unreadCount={unreadCount} translate={translate} isRtl={isRtl} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Reports */}
        {reportsItems.length > 0 && (
          <SidebarGroup className="mt-4">
            {!collapsed && <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 px-3 mb-2">{t('layout.section.analytics')}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {reportsItems.map((item) => (
                  <NavItemWithChildren key={item.path} item={item} collapsed={collapsed} unreadCount={unreadCount} translate={translate} isRtl={isRtl} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Administration */}
        {adminItems.length > 0 && (
          <SidebarGroup className="mt-4">
            {!collapsed && <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 px-3 mb-2">{t('layout.section.admin')}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <NavItemWithChildren key={item.path} item={item} collapsed={collapsed} unreadCount={unreadCount} translate={translate} isRtl={isRtl} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed && profile && (
          <div className="mb-3 rounded-lg bg-sidebar-accent/50 p-3">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{(isRtl ? (profile.name_ar || profile.name_en) : (profile.name_en || profile.name_ar))}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{profile.job_title}</p>
          </div>
        )}
        <Button
          variant="ghost"
          onClick={signOut}
          className={cn(
            "w-full text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent",
            collapsed ? "px-2 justify-center" : cn("justify-start", isRtl && "flex-row-reverse justify-end")
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className={cn(isRtl ? 'mr-2' : 'ml-2')}>{t('common.signOut')}</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}