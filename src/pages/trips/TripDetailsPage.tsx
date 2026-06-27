import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Car, MapPin, Clock, User, Camera, Upload, 
  CheckCircle, XCircle, Loader2, AlertTriangle, History 
} from 'lucide-react';
import { toast } from 'sonner';
import { auditLog } from '@/lib/audit';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { format } from 'date-fns';

interface TripDetails {
  id: string;
  trip_no: string;
  status: string;
  destination_text: string;
  purpose: string | null;
  job_order_no: string | null;
  start_odometer_value: number;
  start_odometer_photo_url: string;
  start_fuel_level: string | null;
  end_odometer_value: number | null;
  end_odometer_photo_url: string | null;
  end_fuel_level: string | null;
  distance_km: number | null;
  anomaly_flag: boolean;
  anomaly_reason: string | null;
  reject_reason: string | null;
  requested_at: string;
  approved_at: string | null;
  closed_at: string | null;
  vehicle: { vehicle_code: string; plate_no: string; approvals_required: boolean } | null;
  driver: { name_en: string; staff_id: string } | null;
  approved_by: { name_en: string } | null;
}

interface TripAction {
  id: string;
  action: string;
  comment: string | null;
  created_at: string;
  actor: { name_en: string } | null;
}

export default function TripDetailsPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || '').startsWith('ar');
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, hasPermission } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [actions, setActions] = useState<TripAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Close trip state
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [endOdometer, setEndOdometer] = useState('');
  const [endOcrLoading, setEndOcrLoading] = useState(false);
  const [endOcrConfidence, setEndOcrConfidence] = useState<number | null>(null);
  const [endOcrRawText, setEndOcrRawText] = useState<string>('');
  const [endOdometerDisputed, setEndOdometerDisputed] = useState(false);
  const [endClaimedOdometer, setEndClaimedOdometer] = useState('');
  const [endFuelLevel, setEndFuelLevel] = useState('');
  const [endPhotoFile, setEndPhotoFile] = useState<File | null>(null);
  const [endPhotoPreview, setEndPhotoPreview] = useState('');
  const [endUploadedPhotoPath, setEndUploadedPhotoPath] = useState<string>('');

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const canApprove = hasPermission('trips.approve');
  const canReject = hasPermission('trips.reject');
  const canClose = hasPermission('trips.close');
  const isDriver = trip?.driver?.staff_id === profile?.staff_id;

  useEffect(() => {
    const fetchTrip = async () => {
      const [tripRes, actionsRes] = await Promise.all([
        supabase.from('trips')
          .select(`
            *,
            vehicle:vehicles(vehicle_code, plate_no, approvals_required),
            driver:profiles!trips_driver_user_id_fkey(name_en, staff_id),
            approved_by:profiles!trips_approved_by_user_id_fkey(name_en)
          `)
          .eq('id', id)
          .single(),
        supabase.from('trip_actions')
          .select('*, actor:profiles(name_en)')
          .eq('trip_id', id)
          .order('created_at', { ascending: false }),
      ]);

      if (tripRes.data) setTrip(tripRes.data as TripDetails);
      if (actionsRes.data) setActions(actionsRes.data as TripAction[]);
      setLoading(false);
    };

    if (id) fetchTrip();
  }, [id]);

  const handleApprove = async () => {
    if (!trip || !profile) return;
    setProcessing(true);

    const { error } = await supabase.from('trips')
      .update({ 
        status: 'Approved', 
        approved_by_user_id: profile.id, 
        approved_at: new Date().toISOString() 
      })
      .eq('id', trip.id);

    if (error) {
      toast.error(t('trips.details.toast.approveFailed'));
    } else {
      await supabase.from('trip_actions').insert({
        trip_id: trip.id,
        action: 'Approve',
        actor_user_id: profile.id,
        comment: 'Trip approved',
      });

      auditLog(supabase as any, {
        action: 'trips.approve',
        entityType: 'trip',
        entityId: trip.id,
        summary: `Approved trip ${trip.trip_no}`,
        metadata: {
          trip_no: trip.trip_no,
          vehicle_id: trip.vehicle_id,
          department_id: trip.department_id,
        },
      });
      toast.success(t('trips.details.toast.approveSuccess'));
      navigate('/approvals');
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!trip || !profile || !rejectReason) return;
    setProcessing(true);

    const { error } = await supabase.from('trips')
      .update({ 
        status: 'Rejected', 
        rejected_by_user_id: profile.id, 
        rejected_at: new Date().toISOString(),
        reject_reason: rejectReason,
      })
      .eq('id', trip.id);

    if (error) {
      toast.error(t('trips.details.toast.rejectFailed'));
    } else {
      await supabase.from('trip_actions').insert({
        trip_id: trip.id,
        action: 'Reject',
        actor_user_id: profile.id,
        comment: rejectReason,
      });

      auditLog(supabase as any, {
        action: 'trips.reject',
        entityType: 'trip',
        entityId: trip.id,
        summary: `Rejected trip ${trip.trip_no}`,
        metadata: {
          trip_no: trip.trip_no,
          vehicle_id: trip.vehicle_id,
          department_id: trip.department_id,
          reason: rejectReason,
        },
      });
      toast.success(t('trips.details.toast.rejectSuccess'));
      setRejectDialogOpen(false);
      navigate('/approvals');
    }
    setProcessing(false);
  };

  const handleEndPhotoChange = async (file: File) => {
    if (!profile) return;
    try {
      setEndOcrLoading(true);
      setEndOcrConfidence(null);
      setEndOcrRawText('');
      setEndOdometerDisputed(false);
      setEndClaimedOdometer('');

      const reader = new FileReader();
      reader.onloadend = () => setEndPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
      setEndPhotoFile(file);

      const ext = file.name.split('.').pop() || 'jpg';
      const draftPath = `${profile.id}/draft/${Date.now()}-end.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('trip-photos').upload(draftPath, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      setEndUploadedPhotoPath(draftPath);

      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      const accessToken = sessData?.session?.access_token;
      if (sessErr) throw sessErr;
      if (!accessToken) {
        throw new Error(t('trips.details.toast.authRequired'));
      }

      const { data, error } = await supabase.functions.invoke('ocr-odometer', {
        body: { bucket: 'trip-photos', path: draftPath },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (error) throw error;

      const extracted = (data as any)?.extracted_km;
      const conf = (data as any)?.confidence;
      const raw = (data as any)?.raw_text;
      setEndOcrConfidence(typeof conf === 'number' ? conf : null);
      setEndOcrRawText(typeof raw === 'string' ? raw : '');

      if (extracted !== null && extracted !== undefined && extracted !== '') {
        setEndOdometer(String(extracted));
      }
    } catch (err: any) {
      toast.error(t('trips.details.toast.ocrFailed'), { description: err?.message ?? t('trips.details.toast.ocrFailedDesc') });
    } finally {
      setEndOcrLoading(false);
    }
  };

  const handleCloseTrip = async () => {
    const finalEndOdometer = endOdometerDisputed ? endClaimedOdometer : endOdometer;
    if (!trip || !profile || !endPhotoFile || !finalEndOdometer) return;
    setProcessing(true);

    try {
      // Upload photo
      let fileName = endUploadedPhotoPath;
      if (!fileName) {
        fileName = `${profile.id}/${Date.now()}-end.${endPhotoFile.name.split('.').pop()}`;
        await supabase.storage.from('trip-photos').upload(fileName, endPhotoFile);
      }
      const { data: { publicUrl } } = supabase.storage.from('trip-photos').getPublicUrl(fileName);

      const endValue = parseFloat(finalEndOdometer);
      const distance = endValue - trip.start_odometer_value;

      // Check anomaly (simplified - would use threshold from vehicle/type)
      const anomalyFlag = distance > 500;

      const { error } = await supabase.from('trips')
        .update({ 
          status: 'Closed', 
          end_odometer_value: endValue,
          end_odometer_photo_url: publicUrl,
          // OCR/dispute fields (non-breaking)
          end_odometer_extracted_value: parseFloat(endOdometer),
          end_odometer_ocr_confidence: endOcrConfidence,
          end_odometer_ocr_raw_text: endOcrRawText || null,
          end_odometer_final_value: endValue,
          end_odometer_disputed: endOdometerDisputed,
          end_odometer_claimed_value: endOdometerDisputed ? parseFloat(endClaimedOdometer) : null,
          end_fuel_level: endFuelLevel || null,
          closed_at: new Date().toISOString(),
          distance_km: distance,
          anomaly_flag: anomalyFlag,
          anomaly_reason: anomalyFlag ? 'Distance exceeds threshold' : null,
        } as any)
        .eq('id', trip.id);

      if (error) throw error;

      await supabase.from('trip_actions').insert({
        trip_id: trip.id,
        action: 'Close',
        actor_user_id: profile.id,
        comment: `Trip closed. Distance: ${distance} km`,
      });

      auditLog(supabase as any, {
        action: 'trips.close',
        entityType: 'trip',
        entityId: trip.id,
        summary: `Closed trip ${trip.trip_no}`,
        metadata: {
          trip_no: trip.trip_no,
          vehicle_id: trip.vehicle_id,
          department_id: trip.department_id,
          start_odometer: trip.start_odometer_value,
          end_odometer: endValue,
          distance_km: distance,
          anomaly_flag: anomalyFlag,
        },
      });

      if (endOdometerDisputed) {
        await supabase.from('odometer_disputes').insert({
          trip_id: trip.id,
          stage: 'END',
          extracted_value: parseFloat(endOdometer),
          claimed_value: parseFloat(endClaimedOdometer),
          status: 'OPEN',
          created_by: profile.id,
        } as any);
      }

      // Update vehicle odometer
      await supabase.from('vehicles')
        .update({ current_odometer: endValue })
        .eq('id', trip.vehicle_id);

      toast.success(t('trips.details.closeSuccess'));
      setCloseDialogOpen(false);
      navigate('/trips');
    } catch (error: any) {
      toast.error(t('trips.details.closeFailed'), { description: error.message });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      </MainLayout>
    );
  }

  if (!trip) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('trips.details.notFound')}</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader title={trip.trip_no}>
        <StatusBadge status={trip.status} />
      </PageHeader>

      {/* Action Buttons */}
      {trip.status === 'PendingApproval' && (canApprove || canReject) && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span className="font-medium text-amber-900">{t('trips.details.requiresApproval')}</span>
              </div>
              <div className="flex gap-2">
                {canReject && (
                  <Button variant="outline" onClick={() => setRejectDialogOpen(true)}>
                    <XCircle className={isRtl ? "w-4 h-4 ml-2" : "w-4 h-4 mr-2"} />
                    Reject
                  </Button>
                )}
                {canApprove && (
                  <Button onClick={handleApprove} disabled={processing}>
                    {processing ? <Loader2 className={isRtl ? "w-4 h-4 ml-2 animate-spin" : "w-4 h-4 mr-2 animate-spin"} /> : <CheckCircle className={isRtl ? "w-4 h-4 ml-2" : "w-4 h-4 mr-2"} />}
                    Approve
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(trip.status === 'Approved' || trip.status === 'Active') && (isDriver || canClose) && (
        <Card className="mb-6 border-teal-200 bg-teal-50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-teal-600" />
                <span className="font-medium text-teal-900">{t('trips.details.active')}</span>
              </div>
              <Button onClick={() => setCloseDialogOpen(true)}>
                Close Trip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trip Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('trips.details.info')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Car className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('trips.details.vehicle')}</p>
                    <p className="font-medium">{trip.vehicle?.vehicle_code} - {trip.vehicle?.plate_no}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('trips.details.destination')}</p>
                    <p className="font-medium">{trip.destination_text}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('trips.details.driver')}</p>
                    <p className="font-medium">{trip.driver?.name_en}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('trips.details.requested')}</p>
                    <p className="font-medium">{format(new Date(trip.requested_at), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                </div>
              </div>

              {trip.purpose && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">{t('trips.details.purpose')}</p>
                  <p className="mt-1">{trip.purpose}</p>
                </div>
              )}

              {trip.reject_reason && (
                <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-800">{t('trips.details.rejectionReason')}</p>
                  <p className="text-red-700 mt-1">{trip.reject_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Odometer Photos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('trips.details.odometerReadings')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">{t('trips.details.startOdometer')}</p>
                  <img 
                    src={trip.start_odometer_photo_url} 
                    alt="Start odometer" 
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                  <p className="mt-2 font-medium text-center">{trip.start_odometer_value.toLocaleString()} km</p>
                </div>
                {trip.end_odometer_photo_url && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">End Odometer</p>
                    <img 
                      src={trip.end_odometer_photo_url} 
                      alt="End odometer" 
                      className="w-full h-48 object-cover rounded-lg border"
                    />
                    <p className="mt-2 font-medium text-center">{trip.end_odometer_value?.toLocaleString()} km</p>
                  </div>
                )}
              </div>
              {trip.distance_km && (
                <div className="mt-4 p-4 rounded-lg bg-muted text-center">
                  <p className="text-sm text-muted-foreground">Total Distance</p>
                  <p className="text-2xl font-semibold">{trip.distance_km.toLocaleString()} km</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Audit Trail */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="w-5 h-5" />
              Activity Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {actions.map((action) => (
                <div key={action.id} className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{action.action}</p>
                    {action.comment && (
                      <p className="text-sm text-muted-foreground">{action.comment}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {action.actor?.name_en} • {format(new Date(action.created_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Trip</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for rejection *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Please provide a reason for rejecting this trip..."
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason || processing}>
              {processing && <Loader2 className={isRtl ? "w-4 h-4 ml-2 animate-spin" : "w-4 h-4 mr-2 animate-spin"} />}
              Reject Trip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Trip Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.details.closeTrip')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>End Odometer Reading (km) *</Label>
              <Input
                type="number"
                value={endOdometer}
                min={trip.start_odometer_value}
                required
                disabled
                placeholder={endOcrLoading ? 'Extracting from photo…' : 'Will be extracted from photo'}
              />
              <div className="flex items-center justify-between gap-3">
                {endOcrLoading ? (
                  <p className="text-xs text-muted-foreground">OCR running…</p>
                ) : endOcrConfidence !== null ? (
                  <p className="text-xs text-muted-foreground">OCR confidence: {endOcrConfidence}%</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Must be at least {trip.start_odometer_value.toLocaleString()} km</p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEndOdometerDisputed((v) => !v)}
                  disabled={!endPhotoFile}
                >
                  {endOdometerDisputed ? 'Cancel dispute' : 'Dispute'}
                </Button>
              </div>

              {endOdometerDisputed && (
                <div className="mt-2 space-y-2 rounded-lg border p-3">
                  <Label className="text-xs">Enter correct end odometer (requires approval)</Label>
                  <Input
                    type="number"
                    value={endClaimedOdometer}
                    onChange={(e) => setEndClaimedOdometer(e.target.value)}
                    min={trip.start_odometer_value}
                    required
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>End Odometer Photo *</Label>
              <div 
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50"
                onClick={() => fileInputRef.current?.click()}
              >
                {endPhotoPreview ? (
                  <img src={endPhotoPreview} alt="End odometer" className="max-h-32 mx-auto rounded" />
                ) : (
                  <>
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to upload</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleEndPhotoChange(file);
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleCloseTrip} 
              disabled={
                processing ||
                !endPhotoFile ||
                !(endOdometerDisputed ? endClaimedOdometer : endOdometer) ||
                parseFloat(endOdometerDisputed ? endClaimedOdometer : endOdometer) < trip.start_odometer_value
              }
            >
              {processing && <Loader2 className={isRtl ? "w-4 h-4 ml-2 animate-spin" : "w-4 h-4 mr-2 animate-spin"} />}
              Close Trip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}