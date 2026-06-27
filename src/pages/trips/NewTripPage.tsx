import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/formatters';
import { computeVehicleCompliance } from '@/lib/compliance';
import { ComplianceBadge } from '@/components/ui/compliance-badge';

import { Camera, Upload, Car, MapPin, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { auditLog } from '@/lib/audit';

interface Vehicle {
  id: string;
  vehicle_code: string;
  plate_no: string;
  current_odometer: number;
  approvals_required: boolean;
  insurance_end_date: string | null;
  registration_end_date: string | null;
  vehicle_type: { name: string; name_en?: string | null; name_ar?: string | null } | null;
}

interface Destination {
  id: string;
  // Legacy columns
  name?: string;
  category?: string | null;

  // Newer schemas store bilingual columns
  name_en?: string | null;
  name_ar?: string | null;
  category_en?: string | null;
  category_ar?: string | null;
}

export default function NewTripPage() {
  const { t } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');

  // If older rows were created in English only, keep the dropdown bilingual
  // with a small built-in fallback for the common default seeds.
  const DEST_AR_FALLBACK: Record<string, string> = {
    airport: 'المطار',
    'city center': 'وسط المدينة',
    'industrial zone': 'المنطقة الصناعية',
    'main hospital': 'المستشفى الرئيسي',
    'warehouse district': 'منطقة المستودعات',
  };
  const CAT_AR_FALLBACK: Record<string, string> = {
    transport: 'نقل',
    general: 'عام',
    logistics: 'لوجستيات',
    medical: 'طبي',
  };
  const normalizeKey = (v?: string | null) => (v || '').trim().toLowerCase();
  const stripParen = (v: string) => v.replace(/\s*\([^)]*\)\s*/g, '').trim();

  const destinationLabel = (d: Destination | null | undefined) => {
    if (!d) return '';

    const nameEn = (d.name_en || d.name || '').trim();
    const nameAr = (d.name_ar || '').trim() || DEST_AR_FALLBACK[normalizeKey(stripParen(nameEn))];
    const catEn = (d.category_en || d.category || '').trim();
    const catAr = (d.category_ar || '').trim() || CAT_AR_FALLBACK[normalizeKey(stripParen(catEn))];

    const name = isRtl ? (nameAr || nameEn) : (nameEn || nameAr);
    const cat = isRtl ? (catAr || catEn) : (catEn || catAr);
    return cat ? `${name} (${cat})` : name;
  };


  const vehicleTypeLabel = (vt: any) => {
    if (!vt) return '';
    const ar = vt.name_ar ?? null;
    const en = vt.name_en ?? null;
    const legacy = vt.name ?? '';
    return isRtl ? (ar || en || legacy) : (en || legacy || ar || '');
  };

  const { profile, hasPermission } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canRequestForOthers = hasPermission?.('trips.request_for_others') ?? false;

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [destinations, setDestinations] = useState<Destination[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleBlockReason, setVehicleBlockReason] = useState<string>('');
  const [destinationId, setDestinationId] = useState<string>('');
  const [destinationText, setDestinationText] = useState('');
  const [purpose, setPurpose] = useState('');
  const [jobOrderNo, setJobOrderNo] = useState('');

  const [startOdometer, setStartOdometer] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrRawText, setOcrRawText] = useState<string>('');

  const [odometerDisputed, setOdometerDisputed] = useState(false);
  const [claimedOdometer, setClaimedOdometer] = useState('');

  const [startFuelLevel, setStartFuelLevel] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploadedPhotoPath, setUploadedPhotoPath] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      const [vehiclesRes, destinationsRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select('id, vehicle_code, plate_no, current_odometer, approvals_required, insurance_end_date, registration_end_date, vehicle_type:vehicle_types(name, name_en, name_ar)')
          .eq('status', 'Active')
          .order('vehicle_code'),
        supabase.from('destinations').select('*').eq('active', true).order('name'),
      ]);

      if (vehiclesRes.data) setVehicles(vehiclesRes.data as any);
      if (destinationsRes.data) setDestinations(destinationsRes.data as any);

      // Drivers list (not all users are drivers)
      const driversRes = await supabase
        .from('profiles')
        .select('id, name_en, name_ar, staff_id, is_driver')
        .eq('active', true)
        .eq('is_driver', true)
        .order('name_en');
      if (driversRes.data) setDrivers(driversRes.data as any);

      setLoading(false);
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default driver: if the current user is a driver, preselect self
  useEffect(() => {
    if (profile?.is_driver && !selectedDriverId) {
      setSelectedDriverId(profile.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.is_driver]);

  const handleVehicleChange = async (vehicleId: string) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    setSelectedVehicle(vehicle || null);
    setVehicleBlockReason('');

    if (vehicle) {
      // Default to the last known odometer until OCR runs.
      setStartOdometer(String(vehicle.current_odometer));

      // Pre-check compliance/service blocks (enterprise-safe)
      try {
        const { data, error } = await supabase.rpc('vehicle_trip_block_reason', { p_vehicle_id: vehicle.id });
        if (error) throw error;
        setVehicleBlockReason(data ? String(data) : '');
      } catch {
        // If RPC is not available, don't block UI here; submit will still validate.
        setVehicleBlockReason('');
      }
    }
  };

  const handleDestinationChange = (destId: string) => {
    setDestinationId(destId);
    const dest = destinations.find((d) => d.id === destId);
    if (dest) setDestinationText(destinationLabel(dest));
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);

    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload immediately (draft) then run OCR so the odometer is auto-filled and non-editable.
    if (!profile) return;

    try {
      setOcrLoading(true);
      setOcrConfidence(null);
      setOcrRawText('');
      setOdometerDisputed(false);
      setClaimedOdometer('');

      const ext = file.name.split('.').pop() || 'jpg';
      const draftPath = `${profile.id}/draft/${Date.now()}-start.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('trip-photos').upload(draftPath, file, {
        upsert: true,
      });
      if (uploadErr) throw uploadErr;
      setUploadedPhotoPath(draftPath);

      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      const accessToken = sessData?.session?.access_token;
      if (sessErr) throw sessErr;
      if (!accessToken) {
        throw new Error(t('trips.new.toast.authRequired'));
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

      setOcrConfidence(typeof conf === 'number' ? conf : null);
      setOcrRawText(typeof raw === 'string' ? raw : '');

      if (extracted !== null && extracted !== undefined && extracted !== '') {
        setStartOdometer(String(extracted));
      } else if (selectedVehicle) {
        // fallback
        setStartOdometer(String(selectedVehicle.current_odometer));
      }
    } catch (err: any) {
      toast.error(t('trips.new.toast.ocrFailed'), {
        description: err?.message ?? t('trips.new.toast.ocrFailedDesc'),
      });
      if (selectedVehicle) setStartOdometer(String(selectedVehicle.current_odometer));
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalOdometer = odometerDisputed ? claimedOdometer : startOdometer;

    // Require driver selection if requester is not a driver
    const effectiveDriverId = selectedDriverId || (profile?.is_driver ? profile.id : '');

    if (!selectedVehicle || !profile || !photoFile || !destinationText || !finalOdometer || !effectiveDriverId) {
      toast.error(t('trips.new.toast.required'));
      return;
    }

    if (vehicleBlockReason) {
      toast.error(t('trips.new.toast.blockedTitle'), {
        description: t(`trips.new.blockReason.${vehicleBlockReason}`, { defaultValue: String(vehicleBlockReason) }),
      });
      return;
    }

    setSubmitting(true);

    try {
      // Block trip if vehicle is not eligible (service/insurance/registration)
      const { data: blockReason, error: blockErr } = await supabase.rpc('vehicle_trip_block_reason', {
        p_vehicle_id: selectedVehicle.id,
      });
      if (blockErr) throw blockErr;
      if (blockReason) {
        toast.error(t('trips.new.toast.blockedTitle'), {
          description: `${t('trips.new.toast.blockedDesc')} ${String(blockReason)}`,
        });
        return;
      }

      // Upload photo (reuse the draft upload when available)
      let fileName = uploadedPhotoPath;
      if (!fileName) {
        fileName = `${profile.id}/${Date.now()}-start.${photoFile.name.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage.from('trip-photos').upload(fileName, photoFile);
        if (uploadError) throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('trip-photos').getPublicUrl(fileName);

      // Determine final status
      const desiredStatus = selectedVehicle.approvals_required ? 'PendingApproval' : 'Active';

      // Create trip
      const tripNo = 'TRP-' + Date.now();
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert([
          {
            trip_no: tripNo,
            vehicle_id: selectedVehicle.id,
            // Driver must be a driver profile (not all users are drivers)
            driver_user_id: effectiveDriverId,
            department_id: profile.department_id,
            requested_by_user_id: profile.id,
            destination_id: destinationId || null,
            destination_text: destinationText,
            purpose: purpose || null,
            job_order_no: jobOrderNo || null,
            start_odometer_value: parseFloat(finalOdometer),
            start_odometer_photo_url: publicUrl,
            // OCR/dispute fields (non-breaking)
            start_odometer_extracted_value: parseFloat(startOdometer),
            start_odometer_ocr_confidence: ocrConfidence,
            start_odometer_ocr_raw_text: ocrRawText || null,
            start_odometer_final_value: parseFloat(finalOdometer),
            start_odometer_disputed: odometerDisputed,
            start_odometer_claimed_value: odometerDisputed ? parseFloat(claimedOdometer) : null,
            start_fuel_level: startFuelLevel || null,
            // Always insert a safe status first to avoid enum "" issues, then transition.
            status: 'Draft' as any,
          },
        ] as any)
        .select()
        .single();

      if (tripError) throw tripError;

      // Transition to the intended status (and stamp approval for auto-approved trips)
      const { error: statusErr } = await supabase
        .from('trips')
        .update(
          selectedVehicle.approvals_required
            ? { status: desiredStatus as any }
            : { status: desiredStatus as any, approved_by_user_id: profile.id, approved_at: new Date().toISOString() }
        )
        .eq('id', trip.id);
      if (statusErr) throw statusErr;

      if (odometerDisputed) {
        await supabase.from('odometer_disputes').insert({
          trip_id: trip.id,
          stage: 'START',
          extracted_value: parseFloat(startOdometer),
          claimed_value: parseFloat(claimedOdometer),
          status: 'OPEN',
          created_by: profile.id,
        } as any);
      }

      // Create audit log
      await supabase.from('trip_actions').insert({
        trip_id: trip.id,
        action: 'Submit',
        actor_user_id: profile.id,
        comment: selectedVehicle.approvals_required
          ? 'Trip submitted for approval'
          : 'Trip auto-approved (no approval required for this vehicle)',
      });

      // Enterprise audit (best effort)
      auditLog(supabase as any, {
        action: 'trips.create',
        entityType: 'trip',
        entityId: trip.id,
        summary: `Created trip ${trip.trip_no} (${desiredStatus})`,
        metadata: {
          vehicle_id: trip.vehicle_id,
          department_id: trip.department_id,
          destination_id: trip.destination_id,
          status: desiredStatus,
          requested_by: profile.id,
        },
      });

      if (selectedVehicle.approvals_required) {
        toast.success(t('trips.new.toast.submittedApproval'));
      } else {
        toast.success(t('trips.new.toast.createdApproved'), {
          description: t('trips.new.toast.createdApprovedDesc'),
        });
      }

      navigate('/trips');
    } catch (error: any) {
      toast.error(t('trips.new.toast.failed'), { description: error?.message });
    } finally {
      setSubmitting(false);
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

  const driverLabel = (d: any) => {
    const name = isRtl ? d?.name_ar || d?.name_en : d?.name_en || d?.name_ar;
    return `${name ?? ''}${d?.staff_id ? ` (${d.staff_id})` : ''}`;
  };

  const fuelOptions: Array<{ value: string; labelKey: string }> = [
    { value: 'Full', labelKey: 'trips.new.fuel.full' },
    { value: '3/4', labelKey: 'trips.new.fuel.threeQuarter' },
    { value: '1/2', labelKey: 'trips.new.fuel.half' },
    { value: '1/4', labelKey: 'trips.new.fuel.quarter' },
    { value: 'Empty', labelKey: 'trips.new.fuel.empty' },
  ];

  return (
    <MainLayout>
      <PageHeader title={t('trips.new.pageTitle')} description={t('trips.new.pageDesc')} />

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vehicle Selection */}
          <Card>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2 text-lg', isRtl && 'flex-row-reverse')}>
                <Car className="w-5 h-5" />
                {t('trips.new.card.vehicle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('trips.new.label.vehicle')} *</Label>
                <Select onValueChange={handleVehicleChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('trips.new.placeholder.vehicle')} />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.vehicle_code} - {v.plate_no} ({v.vehicle_type?.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedVehicle && (
                <div
                  className={cn(
                    'p-4 rounded-lg border',
                    selectedVehicle.approvals_required ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
                  )}
                >
                  <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
                    {selectedVehicle.approvals_required ? (
                      <>
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        <p className="text-amber-800 font-medium">{t('trips.new.approvalRequired')}</p>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <p className="text-green-800 font-medium">{t('trips.new.noApprovalNeeded')}</p>
                      </>
                    )}
                  </div>
                  <p className="text-sm mt-1 text-muted-foreground">
                    {selectedVehicle.approvals_required ? t('trips.new.approvalRequiredDesc') : t('trips.new.noApprovalNeededDesc')}
                  </p>
                </div>
              )}

              {selectedVehicle && (
                <div className={cn('p-4 rounded-lg border bg-muted/30', isRtl && 'text-right')}>
                  <div className={cn('flex items-center justify-between gap-3', isRtl && 'flex-row-reverse')}>
                    <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
                      <span className="text-sm text-muted-foreground">{t('trips.new.compliance.title')}</span>
                      <ComplianceBadge result={computeVehicleCompliance(selectedVehicle)} />
                    </div>
                  </div>

                  {vehicleBlockReason ? (
                    <p className="mt-2 text-sm text-red-700">
                      {t('trips.new.compliance.blocked')} {t(`trips.new.blockReason.${vehicleBlockReason}`, { defaultValue: String(vehicleBlockReason) })}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('trips.new.compliance.hint')}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Destination */}
          <Card>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2 text-lg', isRtl && 'flex-row-reverse')}>
                <MapPin className="w-5 h-5" />
                {t('trips.new.card.destination')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('trips.new.label.selectDestination')}</Label>
                <Select onValueChange={handleDestinationChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('trips.new.placeholder.destinationSelect')} />
                  </SelectTrigger>
                  <SelectContent
                    dir={isRtl ? 'rtl' : 'ltr'}
                    className={cn(isRtl && 'text-right')}
                  >
                    {destinations.map((d) => (
                      <SelectItem
                        key={d.id}
                        value={d.id}
                        dir={isRtl ? 'rtl' : 'ltr'}
                        className={cn(isRtl && 'flex-row-reverse justify-end')}
                      >
                        <span className={cn('w-full', isRtl ? 'text-right' : 'text-left')}>
                          {destinationLabel(d)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {t('trips.new.label.selectDriver')}
                  {!profile?.is_driver ? ' *' : ''}
                </Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('trips.new.placeholder.selectDriver')} />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {driverLabel(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!profile?.is_driver && !selectedDriverId && (
                  <p className="text-xs text-red-600">{t('trips.new.toast.driverRequired')}</p>
                )}
                {!canRequestForOthers && profile?.is_driver && (
                  <p className="text-xs text-muted-foreground">{t('trips.new.hint.driverDefaultToYou')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('trips.new.label.destinationText')} *</Label>
                <Input
                  value={destinationText}
                  onChange={(e) => setDestinationText(e.target.value)}
                  placeholder={t('trips.new.placeholder.destinationText')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>{t('trips.new.label.purpose')}</Label>
                <Textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder={t('trips.new.placeholder.purpose')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('trips.new.label.jobOrderNo')}</Label>
                <Input
                  value={jobOrderNo}
                  onChange={(e) => setJobOrderNo(e.target.value)}
                  placeholder={t('trips.new.placeholder.jobOrderNo')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Odometer */}
          <Card>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2 text-lg', isRtl && 'flex-row-reverse')}>
                <Camera className="w-5 h-5" />
                {t('trips.new.card.odometer')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('trips.new.label.odometerReading')} *</Label>
                <Input
                  type="number"
                  value={startOdometer}
                  placeholder={ocrLoading ? t('trips.new.ocrExtracting') : t('trips.new.ocrWillExtract')}
                  required
                  min={selectedVehicle?.current_odometer || 0}
                  disabled
                />

                <div className={cn('flex items-center justify-between gap-3', isRtl && 'flex-row-reverse')}
                >
                  {ocrLoading ? (
                    <p className="text-xs text-muted-foreground">{t('trips.new.ocrRunning')}</p>
                  ) : ocrConfidence !== null ? (
                    <p className="text-xs text-muted-foreground">
                      {t('trips.new.ocrConfidence', { n: Math.round(ocrConfidence) })}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('trips.new.ocrUploadHint')}</p>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOdometerDisputed((v) => !v)}
                    disabled={!photoFile}
                  >
                    {odometerDisputed ? t('trips.new.cancelDispute') : t('trips.new.dispute')}
                  </Button>
                </div>

                {odometerDisputed && (
                  <div className="mt-2 space-y-2 rounded-lg border p-3">
                    <Label className="text-xs">{t('trips.new.dispute.label')}</Label>
                    <Input
                      type="number"
                      value={claimedOdometer}
                      onChange={(e) => setClaimedOdometer(e.target.value)}
                      placeholder={t('trips.new.dispute.placeholder')}
                      min={selectedVehicle?.current_odometer || 0}
                      required
                    />
                    <p className="text-xs text-muted-foreground">{t('trips.new.dispute.note')}</p>
                  </div>
                )}

                {selectedVehicle && (
                  <p className="text-xs text-muted-foreground">
                    {t('trips.new.lastRecorded', {
                      n: formatNumber(selectedVehicle.current_odometer, 'integer'),
                    })}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('trips.new.label.fuelLevel')}</Label>
                <Select value={startFuelLevel} onValueChange={setStartFuelLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('trips.new.placeholder.fuelLevel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {fuelOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {t(o.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('trips.new.label.odometerPhoto')} *</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-3 sm:p-4 lg:p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Odometer" className="max-h-40 mx-auto rounded-lg" />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">{t('trips.new.photo.uploadTitle')}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t('trips.new.photo.uploadHint')}</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <Card>
            <CardContent className="pt-6">
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting || !!vehicleBlockReason || !selectedVehicle || !photoFile || !destinationText}
              >
                {submitting && (
                  <Loader2 className={cn('w-4 h-4 animate-spin', isRtl ? 'ml-2' : 'mr-2')} />
                )}
                {submitting ? t('trips.new.submitting') : t('trips.new.submit')}
              </Button>

              {selectedVehicle?.approvals_required && (
                <p className="text-center text-sm text-muted-foreground mt-3">{t('trips.new.sentForApproval')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </form>
    </MainLayout>
  );
}
