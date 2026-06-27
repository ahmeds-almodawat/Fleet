import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from '@/components/ErrorBoundary';
import i18n from '@/i18n';
import { AccessDenied } from '@/components/ui/access-denied';

// Pages
import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import VehiclesPage from "./pages/vehicles/VehiclesPage";
import VehicleDetailsPage from "./pages/vehicles/VehicleDetailsPage";
import VehicleTypesPage from "./pages/vehicle-types/VehicleTypesPage";
import DestinationsPage from "./pages/destinations/DestinationsPage";
import MaintenancePage from "./pages/maintenance/MaintenancePage";
import TripsPage from "./pages/trips/TripsPage";
import NewTripPage from "./pages/trips/NewTripPage";
import TripDetailsPage from "./pages/trips/TripDetailsPage";
import ApprovalsPage from "./pages/approvals/ApprovalsPage";
import UsersPage from "./pages/users/UsersPage";
import RolesPage from "./pages/roles/RolesPage";
import ReportsPage from "./pages/reports/ReportsPage";
import MaintenanceCostReportPage from "./pages/reports/MaintenanceCostReportPage";
import ComplianceReportPage from "./pages/reports/ComplianceReportPage";
import AnomaliesReportPage from "./pages/reports/AnomaliesReportPage";
import SettingsPage from "./pages/settings/SettingsPage";
import StudioPage from "./pages/admin/StudioPage";
import BackupExportPage from "./pages/admin/BackupExportPage";
import AuditLogsPage from "./pages/admin/AuditLogsPage";
import SystemJobsPage from "./pages/admin/SystemJobsPage";
import SystemHealthPage from "./pages/admin/SystemHealthPage";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

type ProtectedRouteProps = {
  children: ReactNode;
  requiredPermission?: string;
  requiredAnyPermission?: string[];
};

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">{i18n.t('common.loading')}</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, requiredPermission, requiredAnyPermission }: ProtectedRouteProps) {
  const { user, loading, hasPermission, hasAnyPermission } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const allowedBySingle = requiredPermission ? hasPermission(requiredPermission) : true;
  const allowedByAny = requiredAnyPermission ? hasAnyPermission(requiredAnyPermission) : true;

  if (!allowedBySingle || !allowedByAny) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <AccessDenied />
      </div>
    );
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/vehicles" element={<ProtectedRoute requiredAnyPermission={['vehicles.read', 'vehicles.read_all', 'vehicles.read_department']}><VehiclesPage /></ProtectedRoute>} />
      <Route path="/vehicles/:id" element={<ProtectedRoute requiredAnyPermission={['vehicles.read', 'vehicles.read_all', 'vehicles.read_department']}><VehicleDetailsPage /></ProtectedRoute>} />
      <Route path="/vehicle-types" element={<ProtectedRoute requiredPermission="vehicle_types.read"><VehicleTypesPage /></ProtectedRoute>} />
      <Route path="/destinations" element={<ProtectedRoute requiredPermission="destinations.read"><DestinationsPage /></ProtectedRoute>} />
      <Route path="/maintenance" element={<ProtectedRoute requiredAnyPermission={['maintenance.read', 'maintenance.read_all', 'maintenance.read_department', 'maintenance.manage', 'fleet.manage']}><MaintenancePage /></ProtectedRoute>} />
      <Route path="/trips" element={<ProtectedRoute requiredAnyPermission={['trips.read_own', 'trips.read_all', 'trips.read_department', 'trips.create']}><TripsPage /></ProtectedRoute>} />
      <Route path="/trips/new" element={<ProtectedRoute requiredPermission="trips.create"><NewTripPage /></ProtectedRoute>} />
      <Route path="/trips/:id" element={<ProtectedRoute requiredAnyPermission={['trips.read_own', 'trips.read_all', 'trips.read_department']}><TripDetailsPage /></ProtectedRoute>} />
      <Route path="/approvals" element={<ProtectedRoute requiredAnyPermission={['trips.approve', 'trips.reject']}><ApprovalsPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute requiredAnyPermission={['users.read', 'users.create', 'users.edit']}><UsersPage /></ProtectedRoute>} />
      <Route path="/roles" element={<ProtectedRoute requiredAnyPermission={['roles.read', 'roles.create', 'roles.edit', 'roles.manage']}><RolesPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute requiredAnyPermission={['reports.view', 'reports.read', 'reports.read_all']}><ReportsPage /></ProtectedRoute>} />
      <Route path="/reports/maintenance-costs" element={<ProtectedRoute requiredAnyPermission={['reports.view', 'reports.read', 'reports.read_all']}><MaintenanceCostReportPage /></ProtectedRoute>} />
      <Route path="/reports/compliance" element={<ProtectedRoute requiredAnyPermission={['reports.view', 'reports.read', 'reports.read_all', 'vehicles.read_all']}><ComplianceReportPage /></ProtectedRoute>} />
      <Route path="/reports/anomalies" element={<ProtectedRoute requiredAnyPermission={['reports.view', 'reports.read', 'reports.read_all', 'alerts.read', 'alerts.odometer_anomaly']}><AnomaliesReportPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute requiredPermission="settings.manage"><SettingsPage /></ProtectedRoute>} />
      <Route path="/admin/studio" element={<ProtectedRoute requiredAnyPermission={['studio.manage', 'settings.manage']}><StudioPage /></ProtectedRoute>} />
      <Route path="/admin/audit" element={<ProtectedRoute requiredPermission="audit.read"><AuditLogsPage /></ProtectedRoute>} />
      <Route path="/admin/backups" element={<ProtectedRoute requiredPermission="system.backup.export"><BackupExportPage /></ProtectedRoute>} />
      <Route path="/admin/jobs" element={<ProtectedRoute requiredPermission="system.jobs.view"><SystemJobsPage /></ProtectedRoute>} />
      <Route path="/admin/health" element={<ProtectedRoute requiredAnyPermission={['system.health.view', 'system.jobs.view']}><SystemHealthPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;