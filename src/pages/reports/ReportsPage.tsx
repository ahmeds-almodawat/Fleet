import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Download, Printer, Route, Car, Users, AlertTriangle, Wrench, ArrowRight, ShieldAlert } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/formatters';
import { AccessDenied } from '@/components/ui/access-denied';

interface ReportData {
  totalTrips: number;
  totalDistance: number;
  anomalies: number;
  avgTripDistance: number;
  tripsByStatus: Record<string, number>;
  topVehicles: { code: string; trips: number; distance: number }[];
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || '').startsWith('ar');
  const { hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');
  const [reportData, setReportData] = useState<ReportData>({
    totalTrips: 0,
    totalDistance: 0,
    anomalies: 0,
    avgTripDistance: 0,
    tripsByStatus: {},
    topVehicles: [],
  });

  const canView = hasPermission('reports.view') || hasPermission('reports.read') || hasPermission('reports.read_all');
  const canExport = hasPermission('reports.export_csv') || (hasPermission('reports.view') && hasPermission('reports.export'));

  useEffect(() => {
    if (canView) fetchReportData();
  }, [dateRange]);

  const fetchReportData = async () => {
    setLoading(true);
    const fromDate = subDays(new Date(), parseInt(dateRange)).toISOString();

    const { data: trips } = await supabase
      .from('trips')
      .select('*, vehicle:vehicles(vehicle_code)')
      .gte('created_at', fromDate);

    if (trips) {
      const statusCounts: Record<string, number> = {};
      let totalDist = 0;
      let anomalyCount = 0;
      const vehicleStats: Record<string, { trips: number; distance: number }> = {};

      trips.forEach(trip => {
        statusCounts[trip.status] = (statusCounts[trip.status] || 0) + 1;
        if (trip.distance_km) totalDist += Number(trip.distance_km);
        if (trip.anomaly_flag) anomalyCount++;
        
        const code = trip.vehicle?.vehicle_code || 'Unknown';
        if (!vehicleStats[code]) vehicleStats[code] = { trips: 0, distance: 0 };
        vehicleStats[code].trips++;
        if (trip.distance_km) vehicleStats[code].distance += Number(trip.distance_km);
      });

      const topVehicles = Object.entries(vehicleStats)
        .map(([code, stats]) => ({ code, ...stats }))
        .sort((a, b) => b.trips - a.trips)
        .slice(0, 5);

      setReportData({
        totalTrips: trips.length,
        totalDistance: totalDist,
        anomalies: anomalyCount,
        avgTripDistance: trips.length > 0 ? totalDist / trips.length : 0,
        tripsByStatus: statusCounts,
        topVehicles,
      });
    }

    setLoading(false);
  };

  const handleExportCSV = async () => {
    if (!canExport) {
      toast.error(t('common.noAccess'));
      return;
    }
    const fromDate = subDays(new Date(), parseInt(dateRange)).toISOString();
    const { data: trips } = await supabase
      .from('trips')
      .select('trip_no, status, destination_text, start_odometer_value, end_odometer_value, distance_km, requested_at, closed_at')
      .gte('created_at', fromDate);

    if (!trips) return;

    const headers = ['Trip No', 'Status', 'Destination', 'Start Odometer', 'End Odometer', 'Distance (km)', 'Requested At', 'Closed At'];
    const csvContent = [
      headers.join(','),
      ...trips.map(t => [
        t.trip_no,
        t.status,
        `"${String(t.destination_text || '').replace(/"/g, '""')}"`,
        t.start_odometer_value,
        t.end_odometer_value || '',
        t.distance_km || '',
        t.requested_at,
        t.closed_at || ''
      ].join(','))
    ].join('\n');

    // UTF-8 BOM so Arabic opens correctly in Excel
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fleet-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    // Audit (best effort)
    try {
      await supabase.rpc('log_audit_event', {
        p_action: 'reports.export_csv',
        p_entity_type: 'reports',
        p_entity_id: null,
        p_summary: `Exported trips CSV (range ${dateRange}d)`,
        p_metadata_json: { range_days: dateRange }
      });
    } catch {
      // ignore
    }
    toast.success(t('reports.export.success'));
  };

  if (!canView) {
    return (
      <MainLayout>
        <PageHeader title={t('nav.reports')} description={t('reports.description')} icon={BarChart3} />
        <AccessDenied titleKey="studio.noAccessTitle" descKey="common.noAccess" />
      </MainLayout>
    );
  }

  const handleExportPDF = () => {
    // Audit (best effort)
    supabase.rpc('log_audit_event', {
      p_action: 'reports.export_pdf',
      p_entity_type: 'reports',
      p_entity_id: null,
      p_summary: `Printed report as PDF (range ${dateRange}d)`,
      p_metadata_json: { range_days: dateRange }
    }).catch(() => void 0);
    window.print();
  };

  return (
    <MainLayout>
      <PageHeader title={t('reports.title')} description={t('reports.desc')}>
        <div className={cn('flex gap-3', isRtl && 'flex-row-reverse')}>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className={cn('w-full sm:w-40', isRtl && 'text-right')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align={isRtl ? 'end' : 'start'}>
              <SelectItem value="7">{t('reports.range.last7')}</SelectItem>
              <SelectItem value="30">{t('reports.range.last30')}</SelectItem>
              <SelectItem value="90">{t('reports.range.last90')}</SelectItem>
              <SelectItem value="365">{t('reports.range.lastYear')}</SelectItem>
            </SelectContent>
          </Select>
          {canExport && (
            <Button onClick={handleExportCSV} variant="outline" className={cn('gap-2', isRtl && 'flex-row-reverse')}>
              <Download className="w-4 h-4" />
              {t('reports.export.csv')}
            </Button>
          )}
          {canExport && (
            <Button onClick={handleExportPDF} variant="outline" className={cn('gap-2', isRtl && 'flex-row-reverse')}>
              <Printer className="w-4 h-4" />
              {t('reports.export.pdf')}
            </Button>
          )}
        </div>
      </PageHeader>

      {/* Quick access */}
      <div className="grid gap-6 mb-8 md:grid-cols-3">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 lg:p-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <p className="font-semibold">{t('reports.complianceReport')}</p>
                <p className="text-xs text-muted-foreground">{t('reports.complianceReportDesc')}</p>
              </div>
            </div>
            <Link to="/reports/compliance" className="inline-flex w-full">
              <Button variant="outline" className={cn('w-full gap-2', isRtl && 'flex-row-reverse')}>
                {t('common.view')}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 lg:p-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{t('reports.anomalies.title')}</p>
                  <span className="text-sm font-bold">{reportData.anomalies}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t('reports.anomalies.desc')}</p>
              </div>
            </div>
            <Link to="/reports/anomalies" className="inline-flex w-full">
              <Button variant="outline" className={cn('w-full gap-2', isRtl && 'flex-row-reverse')}>
                {t('common.view')}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 lg:p-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-indigo-700" />
              </div>
              <div>
                <p className="font-semibold">{t('reports.maintenanceCostReport')}</p>
                <p className="text-xs text-muted-foreground">{t('reports.maintenanceCostReportDesc')}</p>
              </div>
            </div>
            <Link to="/reports/maintenance-costs" className="inline-flex w-full">
              <Button variant="outline" className={cn('w-full gap-2', isRtl && 'flex-row-reverse')}>
                {t('common.view')}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Route className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('reports.kpi.totalTrips')}</p>
                <p className="text-2xl font-bold">{reportData.totalTrips}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
                <Car className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('reports.kpi.totalDistance')}</p>
                <p className="text-2xl font-bold">{formatNumber(reportData.totalDistance)} {t('trips.km')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('reports.kpi.avgDistance')}</p>
                <p className="text-2xl font-bold">{formatNumber(Number(reportData.avgTripDistance.toFixed(1)))} {t('trips.km')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('reports.kpi.anomalies')}</p>
                <p className="text-2xl font-bold">{reportData.anomalies}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trips by Status */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t('reports.tripsByStatus')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(reportData.tripsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm">{t(`status.${status}`, { defaultValue: status })}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${(count / reportData.totalTrips) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Vehicles */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t('reports.topVehicles')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reportData.topVehicles.map((v, i) => (
                <div key={v.code} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-sm font-medium flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="font-medium">{v.code}</span>
                  </div>
                  <div className={cn('text-sm', isRtl ? 'text-left' : 'text-right')}>
                    <p className="font-medium">{v.trips} {t('reports.tripCount')}</p>
                    <p className="text-muted-foreground">{formatNumber(v.distance)} {t('trips.km')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Links */}
      <Card className="border-0 shadow-sm mt-6">
        <CardHeader>
          <CardTitle className="text-lg">{t('reports.detailed')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link to="/reports/maintenance-costs">
              <Card className="border hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-status-warning/10 flex items-center justify-center">
                      <Wrench className="w-5 h-5 text-status-warning" />
                    </div>
                    <div>
                      <p className="font-medium">{t('reports.maintenanceCosts.title')}</p>
                      <p className="text-sm text-muted-foreground">{t('reports.maintenanceCosts.desc')}</p>
                    </div>
                  </div>
                  <ArrowRight className={cn('w-5 h-5 text-muted-foreground', isRtl && 'rotate-180')} />
                </CardContent>
              </Card>
            </Link>
          </div>
        </CardContent>
      </Card>
    </MainLayout>
  );
}