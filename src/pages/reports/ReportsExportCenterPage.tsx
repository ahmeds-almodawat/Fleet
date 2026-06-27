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
        name: 'Trips',
        headers: ['Trip No', 'Status', 'Vehicle', 'Plate', 'Destination', 'Purpose', 'Driver', 'Distance KM', 'Requested', 'Closed'],
        rows: report.trips.map((r) => [r.trip_no, r.status, r.vehicle?.vehicle_code, r.vehicle?.plate_no, r.destination_text, r.purpose, r.driver?.name_en || r.driver?.name_ar, r.distance_km, r.requested_at, r.closed_at]),
      },
      {
        name: 'Vehicles',
        headers: ['Vehicle', 'Plate', 'Status', 'Odometer', 'Insurance End', 'Registration End', 'Department'],
        rows: report.vehicles.map((r) => [r.vehicle_code, r.plate_no, r.status, r.current_odometer, r.insurance_end_date, r.registration_end_date, r.department?.name]),
      },
      {
        name: 'Maintenance',
        headers: ['Vehicle', 'Plate', 'Type', 'Description', 'Scheduled', 'Completed', 'Status', 'Cost'],
        rows: report.maintenance.map((r) => [r.vehicle?.vehicle_code, r.vehicle?.plate_no, r.custom_type_name, r.description, r.scheduled_date, r.completed_date, r.status, r.cost]),
      },
      {
        name: 'Notifications',
        headers: ['Title', 'Body', 'Severity', 'Read', 'Created'],
        rows: report.notifications.map((r) => [r.title, r.body, r.severity, r.is_read ? 'Yes' : 'No', r.created_at]),
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
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Load report pack
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Trips</div><div className="text-2xl font-bold">{totalTrips}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Vehicles</div><div className="text-2xl font-bold">{totalVehicles}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Maintenance</div><div className="text-2xl font-bold">{totalMaintenance}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Notifications</div><div className="text-2xl font-bold">{totalNotifications}</div></CardContent></Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle>Export Pack Contents</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Excel export includes four sheets: Trips, Vehicles, Maintenance, and Notifications.</p>
          <p>PDF export uses the browser print dialog. Choose “Save as PDF”.</p>
          {!data && <p className="font-medium text-foreground">Click “Load report pack” first.</p>}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
