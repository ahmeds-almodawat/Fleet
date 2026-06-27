import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from '@/components/ErrorBoundary';
import i18n from '@/i18n';

// Pages
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
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
import NotificationsPage from "./pages/notifications/NotificationsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">{i18n.t('common.loading')}</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">{i18n.t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <RegisterPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/vehicles" element={<ProtectedRoute><VehiclesPage /></ProtectedRoute>} />
      <Route path="/vehicles/:id" element={<ProtectedRoute><VehicleDetailsPage /></ProtectedRoute>} />
      <Route path="/vehicle-types" element={<ProtectedRoute><VehicleTypesPage /></ProtectedRoute>} />
      <Route path="/destinations" element={<ProtectedRoute><DestinationsPage /></ProtectedRoute>} />
      <Route path="/maintenance" element={<ProtectedRoute><MaintenancePage /></ProtectedRoute>} />
      <Route path="/trips" element={<ProtectedRoute><TripsPage /></ProtectedRoute>} />
      <Route path="/trips/new" element={<ProtectedRoute><NewTripPage /></ProtectedRoute>} />
      <Route path="/trips/:id" element={<ProtectedRoute><TripDetailsPage /></ProtectedRoute>} />
      <Route path="/approvals" element={<ProtectedRoute><ApprovalsPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
      <Route path="/roles" element={<ProtectedRoute><RolesPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route path="/reports/maintenance-costs" element={<ProtectedRoute><MaintenanceCostReportPage /></ProtectedRoute>} />
      <Route path="/reports/compliance" element={<ProtectedRoute><ComplianceReportPage /></ProtectedRoute>} />
      <Route path="/reports/anomalies" element={<ProtectedRoute><AnomaliesReportPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/admin/studio" element={<ProtectedRoute><StudioPage /></ProtectedRoute>} />
      <Route path="/admin/audit" element={<ProtectedRoute><AuditLogsPage /></ProtectedRoute>} />
      <Route path="/admin/backups" element={<ProtectedRoute><BackupExportPage /></ProtectedRoute>} />
      <Route path="/admin/jobs" element={<ProtectedRoute><SystemJobsPage /></ProtectedRoute>} />
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