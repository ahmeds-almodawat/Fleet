import { lazy, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import i18n from "@/i18n";
import { AccessDenied } from "@/components/ui/access-denied";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const VehiclesPage = lazy(() => import("./pages/vehicles/VehiclesPage"));
const VehicleDetailsPage = lazy(() => import("./pages/vehicles/VehicleDetailsPage"));
const VehicleDocumentsDashboardPage = lazy(() => import("./pages/vehicles/VehicleDocumentsDashboardPage"));
const VehicleTypesPage = lazy(() => import("./pages/vehicle-types/VehicleTypesPage"));
const DestinationsPage = lazy(() => import("./pages/destinations/DestinationsPage"));
const MaintenancePage = lazy(() => import("./pages/maintenance/MaintenancePage"));
const MaintenanceCalendarPage = lazy(() => import("./pages/maintenance/MaintenanceCalendarPage"));
const TripsPage = lazy(() => import("./pages/trips/TripsPage"));
const NewTripPage = lazy(() => import("./pages/trips/NewTripPage"));
const DriverTripWizardPage = lazy(() => import("./pages/trips/DriverTripWizardPage"));
const TripDetailsPage = lazy(() => import("./pages/trips/TripDetailsPage"));
const ApprovalsPage = lazy(() => import("./pages/approvals/ApprovalsPage"));
const UsersPage = lazy(() => import("./pages/users/UsersPage"));
const RolesPage = lazy(() => import("./pages/roles/RolesPage"));
const ReportsPage = lazy(() => import("./pages/reports/ReportsPage"));
const ReportsExportCenterPage = lazy(() => import("./pages/reports/ReportsExportCenterPage"));
const MaintenanceCostReportPage = lazy(() => import("./pages/reports/MaintenanceCostReportPage"));
const ComplianceReportPage = lazy(() => import("./pages/reports/ComplianceReportPage"));
const AnomaliesReportPage = lazy(() => import("./pages/reports/AnomaliesReportPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const StudioPage = lazy(() => import("./pages/admin/StudioPage"));
const BackupExportPage = lazy(() => import("./pages/admin/BackupExportPage"));
const AuditLogsPage = lazy(() => import("./pages/admin/AuditLogsPage"));
const AdminActivitySummaryPage = lazy(() => import("./pages/admin/AdminActivitySummaryPage"));
const SystemJobsPage = lazy(() => import("./pages/admin/SystemJobsPage"));
const SystemHealthPage = lazy(() => import("./pages/admin/SystemHealthPage"));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

type ProtectedRouteProps = {
  children: ReactNode;
  requiredPermission?: string;
  requiredAnyPermission?: string[];
};

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">{i18n.t("common.loading")}</p>
      </div>
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
}

export function ProtectedRoute({ children, requiredPermission, requiredAnyPermission }: ProtectedRouteProps) {
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

function protectedPage(children: ReactNode, guard?: Omit<ProtectedRouteProps, "children">) {
  return (
    <ProtectedRoute {...guard}>
      <LazyPage>{children}</LazyPage>
    </ProtectedRoute>
  );
}

export const routePermissions = {
  vehicles: ["vehicles.read", "vehicles.read_all", "vehicles.read_department"],
  vehicleDocuments: ["vehicles.read", "vehicles.read_all", "vehicles.read_department", "reports.view"],
  maintenance: ["maintenance.read", "maintenance.read_all", "maintenance.read_department", "maintenance.manage", "fleet.manage"],
  trips: ["trips.read_own", "trips.read_all", "trips.read_department", "trips.create"],
  tripRead: ["trips.read_own", "trips.read_all", "trips.read_department"],
  reports: ["reports.view", "reports.read", "reports.read_all"],
  reportsExport: ["reports.view", "reports.read", "reports.read_all", "reports.export", "reports.export_csv"],
  anomalies: ["reports.view", "reports.read", "reports.read_all", "alerts.read", "alerts.odometer_anomaly"],
  users: ["users.read", "users.create", "users.edit"],
  roles: ["roles.read", "roles.create", "roles.edit", "roles.manage"],
  health: ["system.health.view", "system.jobs.view"],
} as const;

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LazyPage><LoginPage /></LazyPage>} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={protectedPage(<DashboardPage />)} />
      <Route path="/vehicles" element={protectedPage(<VehiclesPage />, { requiredAnyPermission: [...routePermissions.vehicles] })} />
      <Route path="/vehicles/:id" element={protectedPage(<VehicleDetailsPage />, { requiredAnyPermission: [...routePermissions.vehicles] })} />
      <Route path="/vehicles/documents" element={protectedPage(<VehicleDocumentsDashboardPage />, { requiredAnyPermission: [...routePermissions.vehicleDocuments] })} />
      <Route path="/vehicle-types" element={protectedPage(<VehicleTypesPage />, { requiredPermission: "vehicle_types.read" })} />
      <Route path="/destinations" element={protectedPage(<DestinationsPage />, { requiredPermission: "destinations.read" })} />
      <Route path="/maintenance" element={protectedPage(<MaintenancePage />, { requiredAnyPermission: [...routePermissions.maintenance] })} />
      <Route path="/maintenance/calendar" element={protectedPage(<MaintenanceCalendarPage />, { requiredAnyPermission: [...routePermissions.maintenance] })} />
      <Route path="/trips" element={protectedPage(<TripsPage />, { requiredAnyPermission: [...routePermissions.trips] })} />
      <Route path="/trips/new" element={protectedPage(<NewTripPage />, { requiredPermission: "trips.create" })} />
      <Route path="/trips/driver-wizard" element={protectedPage(<DriverTripWizardPage />, { requiredAnyPermission: [...routePermissions.trips] })} />
      <Route path="/trips/:id" element={protectedPage(<TripDetailsPage />, { requiredAnyPermission: [...routePermissions.tripRead] })} />
      <Route path="/approvals" element={protectedPage(<ApprovalsPage />, { requiredAnyPermission: ["trips.approve", "trips.reject"] })} />
      <Route path="/users" element={protectedPage(<UsersPage />, { requiredAnyPermission: [...routePermissions.users] })} />
      <Route path="/roles" element={protectedPage(<RolesPage />, { requiredAnyPermission: [...routePermissions.roles] })} />
      <Route path="/reports" element={protectedPage(<ReportsPage />, { requiredAnyPermission: [...routePermissions.reports] })} />
      <Route path="/reports/export-center" element={protectedPage(<ReportsExportCenterPage />, { requiredAnyPermission: [...routePermissions.reportsExport] })} />
      <Route path="/reports/maintenance-costs" element={protectedPage(<MaintenanceCostReportPage />, { requiredAnyPermission: [...routePermissions.reports] })} />
      <Route path="/reports/compliance" element={protectedPage(<ComplianceReportPage />, { requiredAnyPermission: [...routePermissions.reports, "vehicles.read_all"] })} />
      <Route path="/reports/anomalies" element={protectedPage(<AnomaliesReportPage />, { requiredAnyPermission: [...routePermissions.anomalies] })} />
      <Route path="/notifications" element={protectedPage(<NotificationsPage />)} />
      <Route path="/settings" element={protectedPage(<SettingsPage />, { requiredPermission: "settings.manage" })} />
      <Route path="/admin/studio" element={protectedPage(<StudioPage />, { requiredAnyPermission: ["studio.manage", "settings.manage"] })} />
      <Route path="/admin/audit" element={protectedPage(<AuditLogsPage />, { requiredPermission: "audit.read" })} />
      <Route path="/admin/activity" element={protectedPage(<AdminActivitySummaryPage />, { requiredPermission: "audit.read" })} />
      <Route path="/admin/backups" element={protectedPage(<BackupExportPage />, { requiredPermission: "system.backup.export" })} />
      <Route path="/admin/jobs" element={protectedPage(<SystemJobsPage />, { requiredPermission: "system.jobs.view" })} />
      <Route path="/admin/health" element={protectedPage(<SystemHealthPage />, { requiredAnyPermission: [...routePermissions.health] })} />
      <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
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
