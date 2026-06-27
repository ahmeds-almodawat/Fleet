import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { ComplianceBadge } from '@/components/ui/compliance-badge';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { cn } from '@/lib/utils';
import { computeVehicleCompliance } from '@/lib/compliance';
import { auditLog } from '@/lib/audit';

import { Car, Eye, Pencil, Plus, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';

type Department = { id: string; name: string };
type VehicleType = { id: string; name: string; name_en?: string | null; name_ar?: string | null };
type UserOption = { id: string; name_en: string | null; name_ar: string | null };

type Vehicle = {
  id: string;
  vehicle_code: string;
  plate_no: string;
  status: string;
  current_odometer: number;
  approvals_required: boolean;
  anomaly_distance_threshold_km: number | null;
  notes: string | null;
  image_url: string | null;

  insurance_policy_no?: string | null;
  insurance_start_date?: string | null;
  insurance_end_date?: string | null;

  registration_no?: string | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;

  vehicle_type: VehicleType | null;
  department: Department | null;

  authority_user_id?: string | null;
};

export default function VehiclesPage() {
  const { t } = useTranslation();
  const { hasPermission, profile } = useAuth();
  const isRtl = (i18n.language || '').startsWith('ar');


  const vehicleTypeLabel = (vt: VehicleType | null | undefined) => {
    if (!vt) return '';
    const ar = vt.name_ar ?? null;
    const en = vt.name_en ?? null;
    const legacy = vt.name ?? '';
    return isRtl ? (ar || en || legacy) : (en || legacy || ar || '');
  };

  const canCreate = hasPermission('vehicles.create');
  const canEdit = hasPermission('vehicles.edit');

  const canViewAllVehicles =
    hasPermission('vehicles.read_all') ||
    hasPermission('vehicles.read_all_departments') ||
    hasPermission('fleet.read_all');

  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>(''); // 'all' or uuid

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    vehicle_code: '',
    plate_no: '',
    vehicle_type_id: '',
    department_id: '',
    status: 'Active',
    current_odometer: 0,
    approvals_required: true,
    anomaly_distance_threshold_km: '',
    authority_user_id: '',
    notes: '',

    insurance_policy_no: '',
    insurance_start_date: '',
    insurance_end_date: '',

    registration_no: '',
    registration_start_date: '',
    registration_end_date: '',
  });

  // Default dept filter to user's department (unless read_all)
  useEffect(() => {
    if (deptFilter) return;
    setDeptFilter(profile?.department_id ? profile.department_id : 'all');
  }, [profile?.department_id, deptFilter]);

  useEffect(() => {
    void fetchAll();
     
  }, []);

  const fetchAll = async () => {
    setLoading(true);

    const [vRes, dRes, tRes, uRes] = await Promise.all([
      supabase
        .from('vehicles')
        .select('*, vehicle_type:vehicle_types(id,name), department:departments(id,name)')
        .order('vehicle_code', { ascending: true }),
      supabase.from('departments').select('id,name').order('name', { ascending: true }),
      supabase.from('vehicle_types').select('id,name').order('name', { ascending: true }),
      supabase.from('profiles').select('id,name_en,name_ar').order('name_en', { ascending: true }),
    ]);

    if (vRes.error) toast.error(t('common.error', { defaultValue: 'Error' }), { description: vRes.error.message });
    if (dRes.error) toast.error(t('common.error', { defaultValue: 'Error' }), { description: dRes.error.message });
    if (tRes.error) toast.error(t('common.error', { defaultValue: 'Error' }), { description: tRes.error.message });
    if (uRes.error) toast.error(t('common.error', { defaultValue: 'Error' }), { description: uRes.error.message });

    setVehicles((vRes.data || []) as any);
    setDepartments((dRes.data || []) as any);
    setVehicleTypes((tRes.data || []) as any);
    setUsers((uRes.data || []) as any);

    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setImageFile(null);
    setImagePreview('');

    setForm({
      vehicle_code: '',
      plate_no: '',
      vehicle_type_id: '',
      department_id: !canViewAllVehicles && profile?.department_id ? profile.department_id : '',
      status: 'Active',
      current_odometer: 0,
      approvals_required: true,
      anomaly_distance_threshold_km: '',
      authority_user_id: '',
      notes: '',

      insurance_policy_no: '',
      insurance_start_date: '',
      insurance_end_date: '',

      registration_no: '',
      registration_start_date: '',
      registration_end_date: '',
    });

    setDialogOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setImageFile(null);
    setImagePreview(v.image_url || '');

    setForm({
      vehicle_code: v.vehicle_code || '',
      plate_no: v.plate_no || '',
      vehicle_type_id: v.vehicle_type?.id || '',
      department_id: v.department?.id || '',
      status: v.status || 'Active',
      current_odometer: Number(v.current_odometer || 0),
      approvals_required: !!v.approvals_required,
      anomaly_distance_threshold_km: v.anomaly_distance_threshold_km?.toString() || '',
      authority_user_id: v.authority_user_id || '',
      notes: v.notes || '',

      insurance_policy_no: (v.insurance_policy_no as any) || '',
      insurance_start_date: (v.insurance_start_date as any) || '',
      insurance_end_date: (v.insurance_end_date as any) || '',

      registration_no: (v.registration_no as any) || '',
      registration_start_date: (v.registration_start_date as any) || '',
      registration_end_date: (v.registration_end_date as any) || '',
    });

    setDialogOpen(true);
  };

  const onPickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const uploadVehicleImage = async (file: File) => {
    // NOTE: requires a public bucket named "vehicle-images"
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${safeName}`;

    const up = await supabase.storage.from('vehicle-images').upload(path, file, { upsert: true });
    if (up.error) throw up.error;

    const pub = supabase.storage.from('vehicle-images').getPublicUrl(path);
    return pub.data.publicUrl as string;
  };

  const saveVehicle = async () => {
    if (!form.vehicle_code.trim() || !form.plate_no.trim()) {
      toast.error(t('common.missingFields', { defaultValue: 'Please fill required fields.' }));
      return;
    }

    let image_url: string | null = editing?.image_url || null;

    try {
      if (imageFile) image_url = await uploadVehicleImage(imageFile);
    } catch (e: any) {
      toast.error(t('vehicles.uploadFailed', { defaultValue: 'Upload failed' }), {
        description: e?.message || 'Check vehicle-images bucket exists and is public.',
      });
      return;
    }

    const payload: any = {
      vehicle_code: form.vehicle_code.trim(),
      plate_no: form.plate_no.trim(),
      vehicle_type_id: form.vehicle_type_id || null,
      department_id: form.department_id || null,
      status: form.status,
      current_odometer: Number(form.current_odometer || 0),
      approvals_required: !!form.approvals_required,
      anomaly_distance_threshold_km: form.anomaly_distance_threshold_km ? Number(form.anomaly_distance_threshold_km) : null,
      authority_user_id: form.authority_user_id ? form.authority_user_id : null,
      notes: form.notes ? form.notes.trim() : null,
      image_url,

      insurance_policy_no: form.insurance_policy_no || null,
      insurance_start_date: form.insurance_start_date || null,
      insurance_end_date: form.insurance_end_date || null,

      registration_no: form.registration_no || null,
      registration_start_date: form.registration_start_date || null,
      registration_end_date: form.registration_end_date || null,
    };

    if (editing) {
      const res = await supabase.from('vehicles').update(payload).eq('id', editing.id);
      if (res.error) {
        toast.error(t('vehicles.updateFailed', { defaultValue: 'Update failed' }), { description: res.error.message });
        return;
      }

      auditLog(supabase as any, {
        action: 'vehicles.update',
        entityType: 'vehicle',
        entityId: editing.id,
        summary: `Updated vehicle ${payload.vehicle_code}`,
        metadata: { plate_no: payload.plate_no, department_id: payload.department_id, status: payload.status },
      });

      toast.success(t('vehicles.updated', { defaultValue: 'Vehicle updated' }));
    } else {
      const res = await supabase.from('vehicles').insert(payload).select('id').single();
      if (res.error) {
        toast.error(t('vehicles.createFailed', { defaultValue: 'Create failed' }), { description: res.error.message });
        return;
      }

      auditLog(supabase as any, {
        action: 'vehicles.create',
        entityType: 'vehicle',
        entityId: res.data?.id ?? null,
        summary: `Created vehicle ${payload.vehicle_code}`,
        metadata: { plate_no: payload.plate_no, department_id: payload.department_id, status: payload.status },
      });

      toast.success(t('vehicles.created', { defaultValue: 'Vehicle created' }));
    }

    setDialogOpen(false);
    await fetchAll();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return vehicles.filter((v) => {
      const matchesSearch =
        !q ||
        (v.vehicle_code || '').toLowerCase().includes(q) ||
        (v.plate_no || '').toLowerCase().includes(q) ||
        (v.vehicle_type?.name || '').toLowerCase().includes(q);

      const matchesDept =
        !deptFilter || deptFilter === 'all' ? true : (v.department?.id || '') === deptFilter;

      return matchesSearch && matchesDept;
    });
  }, [vehicles, search, deptFilter]);

  const myDeptName =
    departments.find((d) => d.id === (profile?.department_id || ''))?.name ||
    t('common.unknown', { defaultValue: 'Unknown' });

  return (
    <MainLayout>
      <PageHeader title={t('vehicles.title', { defaultValue: 'Vehicles' })} description={t('vehicles.desc', { defaultValue: 'Manage hospital vehicles' })}>
        {canCreate && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            {t('vehicles.add', { defaultValue: 'Add Vehicle' })}
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <Card className="mb-6 border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', isRtl && 'sm:flex-row-reverse')}>
            <div className="relative flex-1">
              <Search className={cn('absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground', isRtl ? 'right-3' : 'left-3')} />
              <Input
                placeholder={t('vehicles.searchPlaceholder', { defaultValue: 'Search by code, plate, type...' })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn('bg-muted/50 border-0', isRtl ? 'pr-10 text-right' : 'pl-10')}
              />
            </div>

            {departments.length > 0 && (
              canViewAllVehicles ? (
                <div className={cn('flex gap-2 w-full sm:w-auto', isRtl && 'sm:flex-row-reverse')}>
                  <Select value={deptFilter || 'all'} onValueChange={setDeptFilter}>
                    <SelectTrigger className={cn('w-full sm:w-[240px]', isRtl && 'text-right')}>
                      <SelectValue placeholder={t('vehicles.filterDepartment', { defaultValue: 'Filter by department' })} />
                    </SelectTrigger>
                    <SelectContent align={isRtl ? 'end' : 'start'}>
                      <SelectItem value="all">{t('common.allDepartments', { defaultValue: 'All departments' })}</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap"
                    onClick={() => setDeptFilter(profile?.department_id || 'all')}
                    disabled={!profile?.department_id || deptFilter === profile.department_id}
                  >
                    {t('common.myDepartment', { defaultValue: 'My department' })}
                  </Button>
                </div>
              ) : (
                <div className={cn('flex items-center', isRtl && 'justify-end')}>
                  <Badge variant="secondary">
                    {t('common.department', { defaultValue: 'Department' })}: {myDeptName}
                  </Badge>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-72 bg-muted animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((v) => (
            <Card key={v.id} className="group overflow-hidden border-0 shadow-sm hover:shadow-xl transition-all duration-300">
              <div className="aspect-[16/10] bg-gradient-to-br from-muted to-muted/50 relative overflow-hidden">
                {v.image_url ? (
                  <img src={v.image_url} alt={v.vehicle_code} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Car className="w-16 h-16 text-muted-foreground/30" />
                  </div>
                )}

                <div className={cn('absolute top-3', isRtl ? 'left-3' : 'right-3')}>
                  <StatusBadge status={v.status} />
                </div>
              </div>

              <CardContent className="p-4">
                <div className={cn('flex items-start justify-between mb-3', isRtl && 'flex-row-reverse')}>
                  <div>
                    <h3 className="font-semibold text-lg">{v.vehicle_code}</h3>
                    <p className="text-sm text-muted-foreground">{v.plate_no}</p>
                    <div className="mt-2">
                      <ComplianceBadge result={computeVehicleCompliance(v as any)} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className={cn('flex justify-between', isRtl && 'flex-row-reverse')}>
                    <span className="text-muted-foreground">{t('vehicles.type', { defaultValue: 'Type' })}</span>
                    <span className="font-medium">{vehicleTypeLabel(v.vehicle_type as any) || t('common.unknown', { defaultValue: 'Unknown' })}</span>
                  </div>
                  <div className={cn('flex justify-between', isRtl && 'flex-row-reverse')}>
                    <span className="text-muted-foreground">{t('vehicles.odometer', { defaultValue: 'Odometer' })}</span>
                    <span className="font-medium">
                      {Number(v.current_odometer || 0).toLocaleString()} {t('common.km', { defaultValue: 'km' })}
                    </span>
                  </div>
                </div>

                <div className={cn('flex gap-2 mt-4', isRtl && 'flex-row-reverse')}>
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link to={`/vehicles/${v.id}`}>
                      <Eye className={cn('w-4 h-4', isRtl ? 'ml-2' : 'mr-2')} />
                      {t('common.view', { defaultValue: 'View' })}
                    </Link>
                  </Button>

                  {canEdit && (
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(v)}>
                      <Pencil className={cn('w-4 h-4', isRtl ? 'ml-2' : 'mr-2')} />
                      {t('common.edit', { defaultValue: 'Edit' })}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('vehicles.edit', { defaultValue: 'Edit Vehicle' }) : t('vehicles.add', { defaultValue: 'Add Vehicle' })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Image */}
            <div className="space-y-2">
              <Label>{t('vehicles.photo', { defaultValue: 'Vehicle Photo' })}</Label>

              <div
                className="relative aspect-video rounded-xl border-2 border-dashed bg-muted/50 hover:bg-muted cursor-pointer transition-colors overflow-hidden"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Vehicle" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <Car className="w-10 h-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('vehicles.clickUpload', { defaultValue: 'Click to upload photo' })}</p>
                  </div>
                )}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            </div>

            {/* Core fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('vehicles.vehicleCode', { defaultValue: 'Vehicle Code' })} *</Label>
                <Input value={form.vehicle_code} onChange={(e) => setForm({ ...form, vehicle_code: e.target.value })} placeholder="AMB-001" />
              </div>
              <div className="space-y-2">
                <Label>{t('vehicles.plateNumber', { defaultValue: 'Plate Number' })} *</Label>
                <Input value={form.plate_no} onChange={(e) => setForm({ ...form, plate_no: e.target.value })} placeholder="ABC-1234" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('vehicles.type', { defaultValue: 'Vehicle Type' })}</Label>
                <Select value={form.vehicle_type_id} onValueChange={(v) => setForm({ ...form, vehicle_type_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t('vehicles.selectType', { defaultValue: 'Select type' })} /></SelectTrigger>
                  <SelectContent>
                    {vehicleTypes.map((tp) => (
                      <SelectItem key={tp.id} value={tp.id}>{tp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('common.department', { defaultValue: 'Department' })}</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t('vehicles.selectDepartment', { defaultValue: 'Select department' })} /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>{t('vehicles.authority', { defaultValue: 'Vehicle Authority (notify on anomalies)' })}</Label>
                <Select
                  value={form.authority_user_id || '__none__'}
                  onValueChange={(v) => setForm({ ...form, authority_user_id: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder={t('vehicles.selectAuthority', { defaultValue: 'Select authority user (optional)' })} /></SelectTrigger>
                  <SelectContent align={isRtl ? 'end' : 'start'}>
                    <SelectItem value="__none__">{t('common.none', { defaultValue: 'None' })}</SelectItem>
                    {users.map((u) => {
                      const label = (isRtl ? u.name_ar : u.name_en) || u.name_en || u.name_ar || u.id;
                      return (
                        <SelectItem key={u.id} value={u.id}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className={cn('text-xs text-muted-foreground', isRtl && 'text-right')}>
                  {t('vehicles.authorityHint', { defaultValue: 'If set, this user receives odometer anomaly alerts for this vehicle.' })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.status', { defaultValue: 'Status' })}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">{t('vehicles.statusActive', { defaultValue: 'Active' })}</SelectItem>
                    <SelectItem value="Maintenance">{t('vehicles.statusMaintenance', { defaultValue: 'Maintenance' })}</SelectItem>
                    <SelectItem value="OutOfService">{t('vehicles.statusOutOfService', { defaultValue: 'Out of Service' })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('vehicles.currentOdometer', { defaultValue: 'Current Odometer (km)' })}</Label>
                <Input
                  type="number"
                  value={form.current_odometer}
                  onChange={(e) => setForm({ ...form, current_odometer: Number(e.target.value || 0) })}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-muted/30 p-4">
              <div className={cn('flex items-center justify-between', isRtl && 'flex-row-reverse')}>
                <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
                  <Badge variant="secondary">{t('vehicles.approvalRequiredTitle', { defaultValue: 'Approval Required' })}</Badge>
                </div>
                <Switch checked={form.approvals_required} onCheckedChange={(v) => setForm({ ...form, approvals_required: v })} />
              </div>
              <p className={cn('mt-2 text-xs text-muted-foreground', isRtl && 'text-right')}>
                {t('vehicles.approvalRequiredDesc', { defaultValue: 'Trips need approval based on workflow.' })}
              </p>
            </div>

            {/* Compliance dates only (safe, no extra buckets required) */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('vehicles.insurancePolicyNo', { defaultValue: 'Insurance Policy No.' })}</Label>
                  <Input value={form.insurance_policy_no} onChange={(e) => setForm({ ...form, insurance_policy_no: e.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t('vehicles.insuranceStart', { defaultValue: 'Start Date' })}</Label>
                      <Input type="date" value={form.insurance_start_date} onChange={(e) => setForm({ ...form, insurance_start_date: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('vehicles.insuranceEnd', { defaultValue: 'End Date' })}</Label>
                      <Input type="date" value={form.insurance_end_date} onChange={(e) => setForm({ ...form, insurance_end_date: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('vehicles.registrationNo', { defaultValue: 'Registration No.' })}</Label>
                  <Input value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t('vehicles.registrationStart', { defaultValue: 'Start Date' })}</Label>
                      <Input type="date" value={form.registration_start_date} onChange={(e) => setForm({ ...form, registration_start_date: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('vehicles.registrationEnd', { defaultValue: 'End Date' })}</Label>
                      <Input type="date" value={form.registration_end_date} onChange={(e) => setForm({ ...form, registration_end_date: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Optional: quick upload button placeholder (does not break if buckets missing) */}
              <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
                <Button type="button" variant="outline" className="gap-2" disabled>
                  <Upload className="w-4 h-4" />
                  {t('vehicles.upload', { defaultValue: 'Upload Document' })}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t('vehicles.uploadHint', { defaultValue: 'Enable vehicle-docs bucket to upload documents.' })}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('common.notes', { defaultValue: 'Notes' })}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
          </div>

          <DialogFooter className={cn(isRtl && 'flex-row-reverse')}>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button onClick={saveVehicle}>
              {editing ? t('common.save', { defaultValue: 'Save' }) : t('common.add', { defaultValue: 'Add' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
