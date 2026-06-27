import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardCheck, Car, User, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface PendingTrip {
  id: string;
  trip_no: string;
  status: string;
  destination_text: string;
  start_odometer_value: number;
  requested_at: string;
  vehicle: { vehicle_code: string; plate_no: string } | null;
  driver: { name_en: string; staff_id: string } | null;
  department: { name: string } | null;
}

export default function ApprovalsPage() {
  const { t } = useTranslation();
  const { profile, hasPermission } = useAuth();
  const [trips, setTrips] = useState<PendingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('PendingApproval');

  const canApprove = hasPermission('trips.approve');
  const canReject = hasPermission('trips.reject');

  useEffect(() => {
    fetchTrips();
  }, [statusFilter]);

  const fetchTrips = async () => {
    let query = supabase
      .from('trips')
      .select(`
        id, trip_no, status, destination_text, start_odometer_value, requested_at,
        vehicle:vehicles(vehicle_code, plate_no),
        driver:profiles!trips_driver_user_id_fkey(name_en, staff_id),
        department:departments(name)
      `)
      .order('requested_at', { ascending: true });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as "PendingApproval" | "Approved" | "Rejected");
    } else {
      query = query.in('status', ['PendingApproval', 'Approved', 'Rejected']);
    }

    const { data } = await query;
    if (data) setTrips(data as unknown as PendingTrip[]);
    setLoading(false);
  };

  const handleQuickApprove = async (tripId: string) => {
    if (!profile) return;
    setProcessingId(tripId);

    const { error } = await supabase.from('trips')
      .update({ 
        status: 'Approved', 
        approved_by_user_id: profile.id, 
        approved_at: new Date().toISOString() 
      })
      .eq('id', tripId);

    if (error) {
      toast.error('Failed to approve trip');
    } else {
      await supabase.from('trip_actions').insert({
        trip_id: tripId,
        action: 'Approve',
        actor_user_id: profile.id,
        comment: 'Quick approved from queue',
      });
      toast.success('Trip approved');
      fetchTrips();
    }
    setProcessingId(null);
  };

  const pendingCount = trips.filter(t => t.status === 'PendingApproval').length;

  return (
    <MainLayout>
      <PageHeader 
        title={t('approvals.queueTitle', 'Approvals')}
        description={t('approvals.awaitingReview', { count: pendingCount, defaultValue: `${pendingCount} trips awaiting review` }) as any}
      />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{t('approvals.filter.status', 'Filter by Status')}:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PendingApproval">{t('approvals.status.pending', 'Pending Approval')}</SelectItem>
                <SelectItem value="Approved">{t('approvals.status.approved', 'Approved')}</SelectItem>
                <SelectItem value="Rejected">{t('approvals.status.rejected', 'Rejected')}</SelectItem>
                <SelectItem value="all">{t('approvals.status.all', 'All')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Trips List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">{t('approvals.empty.title', 'No trips to review')}</h3>
            <p className="text-muted-foreground">{t('approvals.empty.description', 'All caught up!')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {trips.map((trip) => (
            <Card key={trip.id} className={`transition-all ${trip.status === 'PendingApproval' ? 'border-amber-200 bg-amber-50/50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${trip.status === 'PendingApproval' ? 'bg-amber-100' : 'bg-muted'}`}>
                      <ClipboardCheck className={`w-6 h-6 ${trip.status === 'PendingApproval' ? 'text-amber-600' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link to={`/trips/${trip.id}`} className="font-semibold hover:text-accent">
                          {trip.trip_no}
                        </Link>
                        <StatusBadge status={trip.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">{trip.destination_text}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Car className="w-3 h-3" />
                          {trip.vehicle?.vehicle_code}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {trip.driver?.name_en}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(trip.requested_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link to={`/trips/${trip.id}`}>
                      <Button variant="outline" size="sm">View Details</Button>
                    </Link>
                    {trip.status === 'PendingApproval' && (
                      <>
                        {canReject && (
                          <Link to={`/trips/${trip.id}`}>
                            <Button variant="outline" size="sm">
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </Link>
                        )}
                        {canApprove && (
                          <Button 
                            size="sm" 
                            onClick={() => handleQuickApprove(trip.id)}
                            disabled={processingId === trip.id}
                          >
                            {processingId === trip.id ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4 mr-1" />
                            )}
                            Approve
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </MainLayout>
  );
}