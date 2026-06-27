import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { downloadExcelHtml, printCurrentPage, type ExcelSheet } from '@/lib/exportFiles';
import { FileSpreadsheet, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type ReportSet = {
  trips: any[];
  vehicles: any[];
  maintenance: any[];
  notifications: any[];
};

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function ReportsExportCenterPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState('30');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportSet | null>(null);

  const load = async () => {
    setLoading(true);
    const fromDate = isoDaysAgo(Number(range));
    const [tripsRes, vehiclesRes, maintenanceRes, notificationsRes] = await Promise.all([
      supabase.from('trips').select('trip_no,status,destination_text,purpose,distance_km,requested_at,closed_at,vehicle:vehicles(vehicle_code,plate_no),driver:profiles!trips_driver_user_id_fkey(name_en,name_ar)').gte('created_at', fromDate).order('created_at', { ascending: false }).limit(2000),
      supabase.from('vehicles').select('vehicle_code,plate_no,status,current_odometer,insurance_end_date,registration_end_date,department:departments(name)').order('vehicle_code'),
      supabase.from('vehicle_maintenance').select('custom_type_name,description,scheduled_date,completed_date,status,cost,vehicle:vehicles(vehicle_code,plate_no)').order('scheduled_date', { ascending: false }).limit(2000),
      supabase.from('notifications').select('title,body,severity,is_read,created_at').gte('created_at', fromDate).order('created_at', { ascending: false }).limit(2000),
    ]);

    const firstError = tripsRes.error || vehiclesRes.error || maintenanceRes.error || notificationsRes.error;
    if (firstError) {
      toast.error(t('reports.export.loadFailed', { defaultValue: 'Failed to load reports' }), { description: firstError.message });
    } else {
      setData({
        trips: tripsRes.data || [],
        vehicles: vehiclesRes.data || [],
        maintenance: maintenanceRes.data || [],
        notifications: notificationsRes.data || [],
      });
      toast.success(t('common.done', { defaultValue: 'Done' }));
    }
    setLoading(false);
  };

  const sheets = (): ExcelSheet[] => {
    const report = data || { trips: [], vehicles: [], maintenance: [], notifications: [] };
    return [
      {
        name: t('reports.exportCenter.trips'),
        headers: [t('trips.tripNo'), t('common.status'), t('vehicles.vehicle'), t('vehicles.plate'), t('trips.destination'), t('trips.purpose'), t('trips.driver'), 'KM', t('trips.details.requested'), t('status.Closed')],
        rows: report.trips.map((r) => [r.trip_no, r.status, r.vehicle?.vehicle_code, r.vehicle?.plate_no, r.destination_text, r.purpose, r.driver?.name_en || r.driver?.name_ar, r.distance_km, r.requested_at, r.closed_at]),
      },
      {
        name: t('reports.exportCenter.vehicles'),
        headers: [t('vehicles.vehicle'), t('vehicles.plate'), t('common.status'), t('trips.odometer'), t('vehicles.insuranceEnd'), t('vehicles.registrationEnd'), t('common.department')],
        rows: report.vehicles.map((r) => [r.vehicle_code, r.plate_no, r.status, r.current_odometer, r.insurance_end_date, r.registration_end_date, r.department?.name]),
      },
      {
        name: t('reports.exportCenter.maintenance'),
        headers: [t('vehicles.vehicle'), t('vehicles.plate'), t('vehicles.type'), t('common.description'), t('maintenance.status.scheduled'), t('maintenance.status.completed'), t('common.status'), t('maintenance.table.cost')],
        rows: report.maintenance.map((r) => [r.vehicle?.vehicle_code, r.vehicle?.plate_no, r.custom_type_name, r.description, r.scheduled_date, r.completed_date, r.status, r.cost]),
      },
      {
        name: t('reports.exportCenter.notifications'),
        headers: [t('notifications.title'), t('common.description'), t('common.status'), t('notifications.read'), t('common.createdAt')],
        rows: report.notifications.map((r) => [r.title, r.body, r.severity, r.is_read ? t('common.yes') : t('common.no'), r.created_at]),
      },
    ];
  };

  const exportExcel = () => {
    if (!data) return toast.error(t('reports.export.loadFirst', { defaultValue: 'Load the report first.' }));
    downloadExcelHtml(`fleet_all_reports_${new Date().toISOString().slice(0, 10)}.xls`, sheets());
  };

  const totalTrips = data?.trips.length || 0;
  const totalVehicles = data?.vehicles.length || 0;
  const totalMaintenance = data?.maintenance.length || 0;
  const totalNotifications = data?.notifications.length || 0;

  return (
    <MainLayout>
      <PageHeader
        title={t('reports.exportCenter.title', { defaultValue: 'Reports Export Center' })}
        description={t('reports.exportCenter.desc', { defaultValue: 'Export all key operational reports to Excel or browser PDF.' })}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={!data}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={printCurrentPage} disabled={!data}>
            <Printer className="h-4 w-4" /> PDF
          </Button>
        </div>
      </PageHeader>

      <Card className="mb-6 print:hidden">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('common.last7d')}</SelectItem>
              <SelectItem value="30">{t('common.last30d')}</SelectItem>
              <SelectItem value="90">{t('common.last90d')}</SelectItem>
              <SelectItem value="365">{t('common.lastYear')}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.loadReportPack')}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{t('reports.exportCenter.trips')}</div><div className="text-2xl font-bold">{totalTrips}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{t('reports.exportCenter.vehicles')}</div><div className="text-2xl font-bold">{totalVehicles}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{t('reports.exportCenter.maintenance')}</div><div className="text-2xl font-bold">{totalMaintenance}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{t('reports.exportCenter.notifications')}</div><div className="text-2xl font-bold">{totalNotifications}</div></CardContent></Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle>{t('reports.exportCenter.contentsTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t('reports.exportCenter.contentsLine1')}</p>
          <p>{t('reports.exportCenter.contentsLine2')}</p>
          {!data && <p className="font-medium text-foreground">Click “{t('common.loadReportPack')}” first.</p>}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
