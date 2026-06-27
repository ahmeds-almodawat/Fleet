import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';

import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { downloadCsv, toCsv } from '@/lib/csv';
import { Download, Eye, MapPin, Route } from 'lucide-react';

interface Department {
  id: string;
  name: string;
}

interface TripRow {
  id: string;
  trip_no: string;
  status: string;
  requested_at: string | null;
  closed_at: string | null;
  destination_text: string | null;
  purpose: string | null;
  job_order_no: string | null;
  distance_km: number | null;
  vehicle?: {
    vehicle_code?: string | null;
    plate_no?: string | null;
    department_id?: string | null;
    department?: { id?: string | null; name?: string | null } | null;
  } | null;
  driver?: { name_en?: string | null; name_ar?: string | null; staff_id?: string | null } | null;
  requester?: { name_en?: string | null; name_ar?: string | null; staff_id?: string | null } | null;
  created_at: string;
}

export default function TripsPage() {
  const { t } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const { hasPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const canViewAll = hasPermission('trips.read_all') || hasPermission('fleet.read_all');
  const canExport = hasPermission('reports.export') || hasPermission('reports.export_csv') || hasPermission('trips.read_all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const [deptRes] = await Promise.all([
        supabase.from('departments').select('id,name').order('name'),
      ]);
      if (deptRes.data) setDepartments(deptRes.data as any);

      const { data, error } = await supabase
        .from('trips')
        .select(`
          id,
          trip_no,
          status,
          requested_at,
          closed_at,
          destination_text,
          purpose,
          job_order_no,
          distance_km,
          created_at,
          vehicle:vehicles(vehicle_code, plate_no, department_id, department:departments(id,name)),
          driver:profiles!trips_driver_user_id_fkey(name_en, name_ar, staff_id),
          requester:profiles!trips_requested_by_user_id_fkey(name_en, name_ar, staff_id)
        `)
        .order('requested_at', { ascending: false });

      if (!error && data) setTrips(data as any);
      setLoading(false);
    };

    fetchData();
  }, []);

  const filteredTrips = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    return trips.filter((trip) => {
      const matchesSearch = !s
        || String(trip.trip_no || '').toLowerCase().includes(s)
        || String(trip.destination_text || '').toLowerCase().includes(s)
        || String(trip.vehicle?.vehicle_code || '').toLowerCase().includes(s)
        || String(trip.vehicle?.plate_no || '').toLowerCase().includes(s)
        || String(trip.driver?.name_en || '').toLowerCase().includes(s)
        || String(trip.driver?.name_ar || '').toLowerCase().includes(s)
        || String(trip.requester?.name_en || '').toLowerCase().includes(s)
        || String(trip.requester?.name_ar || '').toLowerCase().includes(s);

      const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
      const matchesDept = departmentFilter === 'all' || (trip.vehicle?.department_id && trip.vehicle.department_id === departmentFilter);
      const allowedByScope = canViewAll || true;

      return matchesSearch && matchesStatus && matchesDept && allowedByScope;
    });
  }, [trips, searchTerm, statusFilter, departmentFilter, canViewAll]);

  const statusBadge = (status: string) => {
    const key = `trips.status.${status}`;
    switch (status) {
      case 'Draft':
        return <Badge variant="secondary">{t(key)}</Badge>;
      case 'PendingApproval':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{t(key)}</Badge>;
      case 'Approved':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{t(key)}</Badge>;
      case 'InProgress':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{t(key)}</Badge>;
      case 'Completed':
      case 'Closed':
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{t(key, { defaultValue: status })}</Badge>;
      case 'Rejected':
      case 'Cancelled':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{t(key)}</Badge>;
      default:
        return <Badge variant="outline">{t(key, { defaultValue: status })}</Badge>;
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString(isRtl ? 'ar-SA' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return d;
    }
  };

  const exportTrips = () => {
    const csv = toCsv(
      ['Trip No', 'Status', 'Vehicle', 'Plate', 'Destination', 'Purpose', 'Driver', 'Requested At', 'Closed At', 'Distance KM'],
      filteredTrips.map((trip) => [
        trip.trip_no,
        trip.status,
        trip.vehicle?.vehicle_code,
        trip.vehicle?.plate_no,
        trip.destination_text,
        trip.purpose,
        trip.driver?.name_en || trip.driver?.name_ar,
        trip.requested_at ? formatDate(trip.requested_at) : formatDate(trip.created_at),
        trip.closed_at ? formatDate(trip.closed_at) : '',
        trip.distance_km ?? '',
      ])
    );
    downloadCsv(`fleet_trips_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <MainLayout>
      <PageHeader title={t('trips.all.title')} description={t('trips.all.desc')}>
        {canExport && (
          <Button variant="outline" onClick={exportTrips} disabled={filteredTrips.length === 0} className="w-full sm:w-auto">
            <Download className={cn('h-4 w-4', isRtl ? 'ml-2' : 'mr-2')} />
            {t('common.export', { defaultValue: 'Export' })}
          </Button>
        )}
      </PageHeader>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('common.search')} />

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('trips.filters.status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {['Draft', 'PendingApproval', 'Approved', 'InProgress', 'Completed', 'Closed', 'Rejected', 'Cancelled'].map((s) => (
                    <SelectItem key={s} value={s}>{t(`trips.status.${s}`, { defaultValue: s })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('trips.filters.department')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>
        ) : filteredTrips.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">{t('trips.all.empty')}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filteredTrips.map((trip) => (
                <Card key={trip.id} className="border-0 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link to={`/trips/${trip.id}`} className="font-semibold text-primary hover:underline">{trip.trip_no}</Link>
                        <div className="text-xs text-muted-foreground mt-1">{trip.requested_at ? formatDate(trip.requested_at) : formatDate(trip.created_at)}</div>
                      </div>
                      {statusBadge(trip.status)}
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{trip.vehicle?.vehicle_code || '—'}</span>
                        <span className="text-muted-foreground">{trip.vehicle?.plate_no || ''}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <div className="font-medium">{trip.destination_text || '—'}</div>
                          {trip.purpose && <div className="text-muted-foreground text-xs">{trip.purpose}</div>}
                        </div>
                      </div>
                    </div>

                    <Button asChild className="w-full" variant="outline">
                      <Link to={`/trips/${trip.id}`}>
                        <Eye className="h-4 w-4" />
                        {t('common.viewDetails')}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className={cn(isRtl && 'text-right')}>
                    <th className="px-4 py-3 font-medium">{t('trips.table.tripNo')}</th>
                    <th className="px-4 py-3 font-medium">{t('trips.table.status')}</th>
                    <th className="px-4 py-3 font-medium">{t('trips.table.vehicle')}</th>
                    <th className="px-4 py-3 font-medium">{t('trips.table.route')}</th>
                    <th className="px-4 py-3 font-medium">{t('trips.table.period')}</th>
                    <th className={cn('px-4 py-3 font-medium', isRtl ? 'text-left' : 'text-right')}>{t('trips.table.distance')}</th>
                    <th className={cn('px-4 py-3 font-medium', isRtl ? 'text-left' : 'text-right')}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((trip) => (
                    <tr key={trip.id} className="border-t">
                      <td className="px-4 py-3">
                        <Link to={`/trips/${trip.id}`} className="font-medium text-primary hover:underline">{trip.trip_no}</Link>
                      </td>
                      <td className="px-4 py-3">{statusBadge(trip.status)}</td>
                      <td className="px-4 py-3 text-sm">
                        {trip.vehicle?.vehicle_code ? (
                          <div className="space-y-1">
                            <div className="font-medium">{trip.vehicle.vehicle_code}</div>
                            <div className="text-muted-foreground">{trip.vehicle?.plate_no || '—'}</div>
                          </div>
                        ) : trip.vehicle?.plate_no || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="space-y-1">
                          <div className="font-medium">{trip.destination_text || '—'}</div>
                          {trip.purpose && <div className="text-muted-foreground">{trip.purpose}</div>}
                          {trip.job_order_no && <div className="text-xs text-muted-foreground">{t('trips.new.label.jobOrderNo')}: {trip.job_order_no}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {trip.requested_at ? formatDate(trip.requested_at) : formatDate(trip.created_at)}
                        {trip.closed_at ? ` — ${formatDate(trip.closed_at)}` : ''}
                      </td>
                      <td className={cn('px-4 py-3 text-sm tabular-nums', isRtl ? 'text-left' : 'text-right')}>
                        {trip.distance_km ? (
                          <span>{Math.round(trip.distance_km * 10) / 10}<span className={cn('text-muted-foreground', isRtl ? 'mr-1' : 'ml-1')}>{t('trips.km')}</span></span>
                        ) : '—'}
                      </td>
                      <td className={cn('px-4 py-3 text-sm', isRtl ? 'text-left' : 'text-right')}>
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/trips/${trip.id}`}>{t('common.viewDetails')}</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
