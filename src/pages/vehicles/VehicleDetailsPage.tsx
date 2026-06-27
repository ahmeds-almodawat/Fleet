import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import i18n from "@/i18n";
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Car, 
  ArrowLeft, 
  Gauge, 
  Calendar, 
  Wrench, 
  History,
  Route,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText
} from 'lucide-react';
import { format, isPast, isToday, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { ComplianceBadge } from '@/components/ui/compliance-badge';
import { computeVehicleCompliance } from '@/lib/compliance';
import { VehicleWeekTimeline } from '@/components/vehicles/VehicleWeekTimeline';

interface Vehicle {
  id: string;
  vehicle_code: string;
  plate_no: string;
  status: string;
  current_odometer: number;
  image_url: string | null;
  notes: string | null;
  approvals_required: boolean;
  insurance_policy_no: string | null;
  insurance_start_date: string | null;
  insurance_end_date: string | null;
  insurance_document_url: string | null;
  registration_no: string | null;
  registration_start_date: string | null;
  registration_end_date: string | null;
  registration_document_url: string | null;
  vehicle_type: { name: string } | null;
  department: { name: string } | null;
}

interface MaintenanceRecord {
  id: string;
  maintenance_type: { name: string } | null;
  custom_type_name: string | null;
  scheduled_date: string | null;
  scheduled_odometer: number | null;
  completed_date: string | null;
  completed_odometer: number | null;
  cost: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface TripRecord {
  id: string;
  trip_no: string;
  destination_text: string;
  status: string;
  distance_km: number | null;
  requested_at: string;
  closed_at: string | null;
  driver: { name_en: string } | null;
}

export default function VehicleDetailsPage() {
  const { t } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const vehicleTypeLabel = (vt: any) => {
    if (!vt) return '';
    const ar = vt.name_ar ?? null;
    const en = vt.name_en ?? null;
    const legacy = vt.name ?? '';
    return isRtl ? (ar || en || legacy) : (en || legacy || ar || '');
  };

  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchVehicleData();
    }
  }, [id]);

  const fetchVehicleData = async () => {
    const [vehicleRes, maintenanceRes, tripsRes] = await Promise.all([
      supabase
        .from('vehicles')
        .select('*, vehicle_type:vehicle_types(name, name_en, name_ar), department:departments(name)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('vehicle_maintenance')
        .select('*, maintenance_type:maintenance_types(name)')
        .eq('vehicle_id', id)
        .order('scheduled_date', { ascending: false }),
      supabase
        .from('trips')
        .select('id, trip_no, destination_text, status, distance_km, requested_at, closed_at, driver:profiles!trips_driver_user_id_fkey(name_en)')
        .eq('vehicle_id', id)
        .order('requested_at', { ascending: false })
        .limit(20),
    ]);

    if (vehicleRes.data) setVehicle(vehicleRes.data as Vehicle);
    if (maintenanceRes.data) setMaintenance(maintenanceRes.data as MaintenanceRecord[]);
    if (tripsRes.data) setTrips(tripsRes.data as unknown as TripRecord[]);
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return <Badge className="bg-status-success">{t('vehicles.statusActive')}</Badge>;
      case 'Maintenance':
        return <Badge className="bg-status-warning">{t('vehicles.statusMaintenance')}</Badge>;
      case 'OutOfService':
        return <Badge variant="destructive">{t('vehicles.statusOutOfService')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMaintenanceStatusBadge = (record: MaintenanceRecord) => {
    if (record.status === 'Completed') {
      return <Badge className="bg-status-success">{t('maintenance.status.completed')}</Badge>;
    }
    if (record.status === 'Cancelled') {
      return <Badge variant="secondary">{t('maintenance.status.cancelled')}</Badge>;
    }
    
    if (record.scheduled_date) {
      const scheduledDate = new Date(record.scheduled_date);
      if (isPast(scheduledDate) && !isToday(scheduledDate)) {
        return <Badge variant="destructive">{t('maintenance.status.overdue')}</Badge>;
      }
      const daysUntil = differenceInDays(scheduledDate, new Date());
      if (daysUntil <= 7) {
        return <Badge className="bg-status-warning">{t('maintenance.status.dueSoon')}</Badge>;
      }
    }
    
    return <Badge variant="outline">{t('maintenance.status.scheduled')}</Badge>;
  };

  const upcomingMaintenance = maintenance.filter(m => 
    ['Scheduled', 'Overdue', 'InProgress'].includes(m.status)
  );
  const completedMaintenance = maintenance.filter(m => m.status === 'Completed');
  const totalMaintenanceCost = completedMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0);
  const totalDistance = trips.reduce((sum, t) => sum + (t.distance_km || 0), 0);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!vehicle) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('vehicles.notFound')}</p>
          <Button asChild className="mt-4">
            <Link to="/vehicles">{t('vehicles.backToVehicles')}</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link to="/vehicles">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('vehicles.backToVehicles')}
          </Link>
        </Button>
        
        <PageHeader 
          title={vehicle.vehicle_code}
          description={`${vehicle.plate_no} • ${vehicleTypeLabel(vehicle.vehicle_type) || t('vehicles.unknownType')}`}
        />
      </div>

      {/* Vehicle Info Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex gap-6">
              {vehicle.image_url ? (
                <img 
                  src={vehicle.image_url} 
                  alt={vehicle.vehicle_code}
                  className="w-48 h-32 object-cover rounded-xl"
                />
              ) : (
                <div className="w-48 h-32 bg-muted rounded-xl flex items-center justify-center">
                  <Car className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold">{vehicle.vehicle_code}</h2>
                  {getStatusBadge(vehicle.status)}
                  <ComplianceBadge className="ml-2" result={computeVehicleCompliance(vehicle)} />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('vehicles.plateNumber')}</p>
                    <p className="font-medium">{vehicle.plate_no}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('vehicles.type')}</p>
                    <p className="font-medium">{vehicle.vehicle_type?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('common.department')}</p>
                    <p className="font-medium">{vehicle.department?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('vehicles.approvalsRequired')}</p>
                    <p className="font-medium">{vehicle.approvals_required ? t('common.yes') : t('common.no')}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border bg-muted/30">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{t('vehicles.insurance')}</p>
                        <p className="text-sm text-muted-foreground">
                          {vehicle.insurance_policy_no || '-'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(vehicle.insurance_start_date || '-') + ' → ' + (vehicle.insurance_end_date || '-')}
                        </p>
                      </div>
                      {vehicle.insurance_document_url && (
                        <Button asChild variant="outline" size="sm" className="gap-2">
                          <a href={vehicle.insurance_document_url} target="_blank" rel="noreferrer">
                            <FileText className="w-4 h-4" />
                            View
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border bg-muted/30">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{t('vehicles.registration')}</p>
                        <p className="text-sm text-muted-foreground">
                          {vehicle.registration_no || '-'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(vehicle.registration_start_date || '-') + ' → ' + (vehicle.registration_end_date || '-')}
                        </p>
                      </div>
                      {vehicle.registration_document_url && (
                        <Button asChild variant="outline" size="sm" className="gap-2">
                          <a href={vehicle.registration_document_url} target="_blank" rel="noreferrer">
                            <FileText className="w-4 h-4" />
                            View
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {vehicle.notes && (
                  <div>
                    <p className="text-muted-foreground text-sm">{t('common.notes')}</p>
                    <p className="text-sm">{vehicle.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Card */}
        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Gauge className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{vehicle.current_odometer.toLocaleString()} km</p>
                  <p className="text-sm text-muted-foreground">{t('vehicles.currentOdometer')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-status-info/10 flex items-center justify-center">
                  <Route className="w-6 h-6 text-status-info" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalDistance.toLocaleString()} km</p>
                  <p className="text-sm text-muted-foreground">{t('vehicles.totalDistance')} ({t('dashboard.driverTrips', { count: trips.length })})</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-status-warning/10 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-status-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">${totalMaintenanceCost.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">{t('vehicles.totalMaintenanceCost')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upcoming Maintenance Alert */}
      {upcomingMaintenance.length > 0 && (
        <Card className="border-0 shadow-sm mb-6 border-l-4 border-l-status-warning">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-status-warning" />
              {t('vehicles.upcomingMaintenance')} ({upcomingMaintenance.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingMaintenance.slice(0, 3).map((record) => (
                <div key={record.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">
                      {record.maintenance_type?.name || record.custom_type_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {record.scheduled_date && (
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(record.scheduled_date), 'MMM d, yyyy')}
                      </span>
                    )}
                    {getMaintenanceStatusBadge(record)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Maintenance & Trips */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <Tabs defaultValue="timeline">
            <TabsList className="mb-4">
              <TabsTrigger value="timeline" className="gap-2">
                <Calendar className="w-4 h-4" />
                {t('vehicles.timeline')}
              </TabsTrigger>
              <TabsTrigger value="maintenance" className="gap-2">
                <Wrench className="w-4 h-4" />
                {t('vehicles.maintenanceHistory')}
              </TabsTrigger>
              <TabsTrigger value="trips" className="gap-2">
                <Route className="w-4 h-4" />
                {t('vehicles.tripHistory')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground">{t('vehicles.tripsLast20')}</div>
                    <div className="text-2xl font-bold">{trips.length}</div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground">{t('trips.totalDistance')}</div>
                    <div className="text-2xl font-bold">{Math.round(totalDistance).toLocaleString()} km</div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground">{t('vehicles.upcomingMaintenance')}</div>
                    <div className="text-2xl font-bold">{upcomingMaintenance.length}</div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground">{t('vehicles.maintenanceCostCompleted')}</div>
                    <div className="text-2xl font-bold">{totalMaintenanceCost.toLocaleString()} SAR</div>
                  </CardContent>
                </Card>
              </div>

              <VehicleWeekTimeline vehicleId={vehicle.id} />
            </TabsContent>

            <TabsContent value="maintenance">
              {maintenance.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('vehicles.noMaintenanceRecords')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('vehicles.service')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('trips.odometer')}</TableHead>
                      <TableHead>{t('maintenance.table.cost')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {maintenance.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.maintenance_type?.name || record.custom_type_name}
                        </TableCell>
                        <TableCell>
                          {record.completed_date
                            ? format(new Date(record.completed_date), 'MMM d, yyyy')
                            : record.scheduled_date
                              ? format(new Date(record.scheduled_date), 'MMM d, yyyy')
                              : '-'}
                        </TableCell>
                        <TableCell>
                          {(record.completed_odometer || record.scheduled_odometer)?.toLocaleString()} km
                        </TableCell>
                        <TableCell>
                          {record.cost ? `$${record.cost.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell>{getMaintenanceStatusBadge(record)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="trips">
              {trips.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Route className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('vehicles.noTripRecords')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('vehicles.tripNumber')}</TableHead>
                      <TableHead>{t('trips.destination')}</TableHead>
                      <TableHead>{t('trips.driver')}</TableHead>
                      <TableHead>{t('trips.totalDistance')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.map((trip) => (
                      <TableRow key={trip.id}>
                        <TableCell>
                          <Link to={`/trips/${trip.id}`} className="text-primary hover:underline font-medium">
                            {trip.trip_no}
                          </Link>
                        </TableCell>
                        <TableCell>{trip.destination_text}</TableCell>
                        <TableCell>{trip.driver?.name_en || '-'}</TableCell>
                        <TableCell>
                          {trip.distance_km ? `${trip.distance_km.toLocaleString()} km` : '-'}
                        </TableCell>
                        <TableCell>
                          {format(new Date(trip.requested_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={trip.status === 'Closed' ? 'default' : 'outline'}>
                            {t(`status.${trip.status}`, { defaultValue: trip.status })}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
