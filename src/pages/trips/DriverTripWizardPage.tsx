import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Camera, CheckCircle2, ClipboardList, MapPin, PlayCircle, Plus, Route, Timer, Upload } from 'lucide-react';

type TripRow = {
  id: string;
  trip_no: string;
  status: string;
  destination_text: string | null;
  purpose: string | null;
  requested_at: string | null;
  approved_at: string | null;
  closed_at: string | null;
  start_odometer_photo_url: string | null;
  end_odometer_photo_url: string | null;
  driver_user_id: string | null;
  requested_by_user_id: string | null;
  vehicle?: { vehicle_code?: string | null; plate_no?: string | null } | null;
};

const statusSteps = ['Draft', 'PendingApproval', 'Approved', 'Active', 'InProgress', 'Closed', 'Completed'];

function progressFor(status: string) {
  switch (status) {
    case 'Draft': return 15;
    case 'PendingApproval': return 30;
    case 'Approved': return 55;
    case 'Active':
    case 'InProgress': return 75;
    case 'Closed':
    case 'Completed': return 100;
    default: return 20;
  }
}

function nextAction(status: string) {
  if (status === 'Draft') return { key: 'driverWizard.action.submit', icon: ClipboardList };
  if (status === 'PendingApproval') return { key: 'driverWizard.action.waiting', icon: Timer };
  if (status === 'Approved') return { key: 'driverWizard.action.startClose', icon: PlayCircle };
  if (status === 'Active' || status === 'InProgress') return { key: 'driverWizard.action.closePhoto', icon: Camera };
  return { key: 'driverWizard.action.review', icon: CheckCircle2 };
}

function formatDate(value: string | null, isRtl: boolean) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(isRtl ? 'ar-SA' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

export default function DriverTripWizardPage() {
  const { t } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripRow[]>([]);

  useEffect(() => {
    const loadTrips = async () => {
      if (!user) return;
      setLoading(true);
      const { data } = await supabase
        .from('trips')
        .select('id, trip_no, status, destination_text, purpose, requested_at, approved_at, closed_at, start_odometer_photo_url, end_odometer_photo_url, driver_user_id, requested_by_user_id, vehicle:vehicles(vehicle_code, plate_no)')
        .or(`driver_user_id.eq.${user.id},requested_by_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(20);
      setTrips((data || []) as unknown as TripRow[]);
      setLoading(false);
    };
    loadTrips();
  }, [user?.id]);

  const activeTrips = useMemo(() => trips.filter((trip) => !['Closed', 'Completed', 'Cancelled', 'Rejected'].includes(trip.status)), [trips]);
  const latest = activeTrips[0] || trips[0] || null;

  return (
    <MainLayout>
      <PageHeader
        title={t('driverWizard.title', { defaultValue: 'Driver Mobile Trip Wizard' })}
        description={t('driverWizard.desc', { defaultValue: 'A simple mobile-first guide for requesting, driving, and closing trips.' })}
      >
        <Button asChild className="w-full sm:w-auto">
          <Link to="/trips/new">
            <Plus className={cn('h-4 w-4', isRtl ? 'ml-2' : 'mr-2')} />
            {t('trips.newTrip', { defaultValue: 'New Trip' })}
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
              <Route className="h-5 w-5" />
              {t('driverWizard.currentTitle', { defaultValue: 'Current Driver Flow' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              {[
                { num: '1', label: t('driverWizard.step.request', { defaultValue: 'Request' }), Icon: ClipboardList },
                { num: '2', label: t('driverWizard.step.approve', { defaultValue: 'Approval' }), Icon: CheckCircle2 },
                { num: '3', label: t('driverWizard.step.drive', { defaultValue: 'Drive' }), Icon: PlayCircle },
                { num: '4', label: t('driverWizard.step.close', { defaultValue: 'Close' }), Icon: Upload },
              ].map(({ num, label, Icon }) => {
                const StepIcon = Icon;
                return (
                  <div key={String(num)} className="rounded-xl border bg-muted/30 p-3">
                    <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <StepIcon className="h-4 w-4" />
                    </div>
                    <div className="font-semibold">{num}</div>
                    <div className="text-muted-foreground">{label}</div>
                  </div>
                );
              })}
            </div>

            {loading ? (
              <div className="py-10 text-center text-muted-foreground">{t('common.loading', { defaultValue: 'Loading...' })}</div>
            ) : latest ? (
              <div className="rounded-2xl border p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">{t('driverWizard.latestTrip', { defaultValue: 'Latest trip' })}</div>
                    <Link to={`/trips/${latest.id}`} className="text-xl font-bold text-primary hover:underline">{latest.trip_no}</Link>
                    <div className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5" />
                      <span>{latest.destination_text || '—'}</span>
                    </div>
                  </div>
                  <Badge variant="outline">{t(`trips.status.${latest.status}`, { defaultValue: latest.status })}</Badge>
                </div>

                <Progress value={progressFor(latest.status)} />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-muted-foreground">{t('trips.details.vehicle', { defaultValue: 'Vehicle' })}</div>
                    <div className="font-semibold">{latest.vehicle?.vehicle_code || '—'} {latest.vehicle?.plate_no ? `• ${latest.vehicle.plate_no}` : ''}</div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-muted-foreground">{t('trips.details.requested', { defaultValue: 'Requested' })}</div>
                    <div className="font-semibold">{formatDate(latest.requested_at, Boolean(isRtl))}</div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-muted-foreground">{t('driverWizard.nextAction', { defaultValue: 'Next action' })}</div>
                    <div className="font-semibold">{t(nextAction(latest.status).key)}</div>
                  </div>
                </div>

                <Button asChild className="w-full h-12 text-base">
                  <Link to={`/trips/${latest.id}`}>{t('driverWizard.openTrip', { defaultValue: 'Open trip action page' })}</Link>
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border p-6 text-center space-y-3">
                <div className="text-muted-foreground">{t('driverWizard.noTrips', { defaultValue: 'No trips yet. Start by creating a new trip request.' })}</div>
                <Button asChild>
                  <Link to="/trips/new">{t('trips.newTrip', { defaultValue: 'New Trip' })}</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>{t('driverWizard.driverCard', { defaultValue: 'Driver Card' })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground">{t('users.name', { defaultValue: 'Name' })}</div>
              <div className="font-semibold">{isRtl ? (profile?.name_ar || profile?.name_en) : (profile?.name_en || profile?.name_ar)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t('users.staffId', { defaultValue: 'Staff ID' })}</div>
              <div className="font-semibold">{profile?.staff_id || '—'}</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3 text-blue-900">
              {t('driverWizard.tip', { defaultValue: 'Tip: use your phone camera for odometer photos. The system will extract the reading automatically.' })}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
