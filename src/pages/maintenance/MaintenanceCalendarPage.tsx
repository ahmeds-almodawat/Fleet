import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { downloadCsvFile, downloadExcelHtml, printCurrentPage } from '@/lib/exportFiles';
import { CalendarDays, Download, FileSpreadsheet, Printer, Wrench } from 'lucide-react';

type Row = {
  id: string;
  vehicle_id: string;
  custom_type_name: string | null;
  description: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  status: string;
  cost: number | null;
  vehicle?: { vehicle_code?: string | null; plate_no?: string | null; department?: { name?: string | null } | null } | null;
};

function monthKey(date?: string | null) {
  if (!date) return 'No date';
  return date.slice(0, 7);
}

function monthLabel(key: string, locale: string) {
  if (key === 'No date') return key;
  try {
    return new Date(`${key}-01T00:00:00`).toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  } catch {
    return key;
  }
}

function daysUntil(date?: string | null) {
  if (!date) return null;
  const today = new Date();
  const d = new Date(`${date}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

export default function MaintenanceCalendarPage() {
  const { t } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const locale = isRtl ? 'ar-SA' : 'en-US';
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('open');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('vehicle_maintenance')
        .select('id, vehicle_id, custom_type_name, description, scheduled_date, completed_date, status, cost, vehicle:vehicles(vehicle_code, plate_no, department:departments(name))')
        .order('scheduled_date', { ascending: true });
      setRows((data || []) as unknown as Row[]);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (status === 'all') return true;
    if (status === 'open') return !['Completed', 'Cancelled'].includes(r.status);
    return r.status === status;
  }), [rows, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const key = monthKey(r.scheduled_date || r.completed_date);
      map.set(key, [...(map.get(key) || []), r]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const headers = ['Month', 'Date', 'Vehicle', 'Plate', 'Department', 'Type', 'Description', 'Status', 'Days Until', 'Cost'];
  const exportRows = filtered.map((r) => [
    monthLabel(monthKey(r.scheduled_date || r.completed_date), 'en-US'),
    r.scheduled_date || r.completed_date || '',
    r.vehicle?.vehicle_code || '',
    r.vehicle?.plate_no || '',
    r.vehicle?.department?.name || '',
    r.custom_type_name || r.description || 'Maintenance',
    r.description || '',
    r.status,
    daysUntil(r.scheduled_date) ?? '',
    r.cost ?? '',
  ]);

  return (
    <MainLayout>
      <PageHeader
        title={t('maintenance.calendar.title', { defaultValue: 'Maintenance Calendar' })}
        description={t('maintenance.calendar.desc', { defaultValue: 'Monthly maintenance schedule and overdue work.' })}
      >
        <div className={cn('flex flex-wrap gap-2', isRtl && 'flex-row-reverse')}>
          <Button variant="outline" onClick={() => downloadCsvFile(`maintenance_calendar_${new Date().toISOString().slice(0, 10)}.csv`, headers, exportRows)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => downloadExcelHtml(`maintenance_calendar_${new Date().toISOString().slice(0, 10)}.xls`, [{ name: 'Maintenance Calendar', headers, rows: exportRows }])}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={printCurrentPage}>
            <Printer className="h-4 w-4" /> PDF
          </Button>
        </div>
      </PageHeader>

      <Card className="mb-6 print:hidden">
        <CardContent className="p-4 max-w-sm">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open only</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Scheduled">Scheduled</SelectItem>
              <SelectItem value="InProgress">In progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">{t('common.loading', { defaultValue: 'Loading...' })}</div>
      ) : grouped.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No maintenance records found.</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, items]) => (
            <Card key={key} className="border-0 shadow-sm break-inside-avoid">
              <CardHeader>
                <CardTitle className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
                  <CalendarDays className="h-5 w-5" />
                  {monthLabel(key, locale)}
                  <Badge variant="outline">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((r) => {
                  const due = daysUntil(r.scheduled_date);
                  const overdue = due !== null && due < 0 && !['Completed', 'Cancelled'].includes(r.status);
                  return (
                    <div key={r.id} className="rounded-xl border p-4 grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
                      <div>
                        <div className="font-semibold">{r.scheduled_date || r.completed_date || 'No date'}</div>
                        <div className="text-sm text-muted-foreground">{r.custom_type_name || r.description || 'Maintenance'}</div>
                      </div>
                      <div>
                        <div className="font-medium">{r.vehicle?.vehicle_code || '—'}</div>
                        <div className="text-sm text-muted-foreground">{r.vehicle?.plate_no || ''}</div>
                      </div>
                      <div className="text-sm text-muted-foreground">{r.vehicle?.department?.name || '—'}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant={overdue ? 'destructive' : r.status === 'Completed' ? 'default' : 'outline'}>{r.status}</Badge>
                        {due !== null && !['Completed', 'Cancelled'].includes(r.status) && <Badge variant="secondary">{due}d</Badge>}
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </MainLayout>
  );
}
