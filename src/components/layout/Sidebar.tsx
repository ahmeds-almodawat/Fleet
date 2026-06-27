import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  permission?: string;
  permissions?: string[];
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Route, label: 'My Trips', path: '/trips', permissions: ['trips.read_own', 'trips.read_all', 'trips.create'] },
  { icon: ClipboardCheck, label: 'Approvals', path: '/approvals', permissions: ['trips.approve', 'trips.reject'] },
  { icon: Car, label: 'Vehicles', path: '/vehicles', permission: 'vehicles.read' },
  { icon: Truck, label: 'Vehicle Types', path: '/vehicle-types', permission: 'vehicle_types.read' },
  { icon: Users, label: 'Users', path: '/users', permission: 'users.read' },
  { icon: Shield, label: 'Roles', path: '/roles', permission: 'roles.read' },
  { icon: BarChart3, label: 'Reports', path: '/reports', permission: 'reports.read' },
  { icon: Settings, label: 'Settings', path: '/settings', permission: 'settings.manage' },
];

export function Sidebar() {
  const location = useLocation();
  const { hasPermission, hasAnyPermission, profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const filteredItems = navItems.filter(item => {
    if (!item.permission && !item.permissions) return true;
    if (item.permission) return hasPermission(item.permission);
    if (item.permissions) return hasAnyPermission(item.permissions);
    return false;
  });

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full bg-sidebar flex flex-col transition-all duration-300 z-50",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Truck className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <span className="font-semibold text-sidebar-foreground">Fleet Control</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center mx-auto">
            <Truck className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
        )}
      </div>

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "nav-item",
                isActive && "nav-item-active"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-sidebar-border">
        {!collapsed && profile && (
          <div className="mb-3 px-3">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{profile.name_en}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{profile.job_title}</p>
          </div>
        )}
        <Button
          variant="ghost"
          onClick={signOut}
          className={cn(
            "w-full text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent",
            collapsed ? "px-2" : "justify-start"
          )}
          title={collapsed ? "Sign Out" : undefined}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span className="ml-2">Sign Out</span>}
        </Button>
      </div>
    </aside>
  );
}