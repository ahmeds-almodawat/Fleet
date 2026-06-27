import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';

import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { auditLog } from '@/lib/audit';

import { Calendar, CheckCircle, Clock, DollarSign, Plus, AlertTriangle, Wrench, XCircle } from 'lucide-react';

interface Vehicle {
  id: string;
  vehicle_code: string;
  plate_no: string;
  current_odometer: number;
  department_id?: string | null;
  department?: { id?: string | null; name?: string | null } | null;
}

interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  maintenance_type: string;
  description: string | null;
  scheduled_date: string;
  completed_date: string | null;
  status: 'Scheduled' | 'InProgress' | 'Completed' | 'Cancelled';
  odometer_reading: number | null;
  cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle?: Vehicle;
}

interface SummaryStats {
  totalSpent: number;
  completedCount: number;
  overdueCount: number;
  dueSoonCount: number;
  scheduledCount: number;
}

const MAINTENANCE_TYPES: Array<{ value: string; labelKey: string }> = [
  { value: 'Oil Change', labelKey: 'maintenance.types.oilChange' },
  { value: 'Tire Rotation', labelKey: 'maintenance.types.tireRotation' },
  { value: 'Brake Service', labelKey: 'maintenance.types.brakeService' },
  { value: 'Engine Service', labelKey: 'maintenance.types.engineService' },
  { value: 'Inspection', labelKey: 'maintenance.types.inspection' },
  { value: 'Other', labelKey: 'maintenance.types.other' },
];

function getTypeLabel(t: (k: string) => string, value: string) {
  const hit = MAINTENANCE_TYPES.find((x) => x.value === value);
  return hit ? t(hit.labelKey) : value;
}

function getDueMeta(record: MaintenanceRecord) {
  const now = new Date();
  const scheduled = new Date(record.scheduled_date);
  const isOverdue = scheduled < now;
  const daysUntil = Math.ceil((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isDueSoon = !isOverdue && daysUntil <= 7;
  return { isOverdue, isDueSoon, daysUntil };
}

function getDisplayStatusKey(record: MaintenanceRecord) {
  if (record.status === 'Completed') return 'maintenance.status.completed';
  if (record.status === 'Cancelled') return 'maintenance.status.cancelled';
  if (record.status === 'InProgress') return 'maintenance.status.inProgress';
  const { isOverdue, isDueSoon } = getDueMeta(record);
  if (isOverdue) return 'maintenance.status.overdue';
  if (isDueSoon) return 'maintenance.status.dueSoon';
  return 'maintenance.status.scheduled';
}

function getStatusBadgeVariant(record: MaintenanceRecord) {
  if (record.status === 'Completed') return { variant: 'default' as const, icon: CheckCircle };
  if (record.status === 'Cancelled') return { variant: 'secondary' as const, icon: XCircle };
  if (record.status === 'InProgress') return { variant: 'outline' as const, icon: Clock };
  const { isOverdue, isDueSoon } = getDueMeta(record);
  if (isOverdue) return { variant: 'destructive' as const, icon: AlertTriangle };
  if (isDueSoon) return { variant: 'secondary' as const, icon: Clock };
  return { variant: 'outline' as const, icon: Calendar };
}

export default function MaintenancePage() {
  const { t } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');

  const { hasPermission, profile } = useAuth();
  const qc = useQueryClient();

  const canManage = Boolean(hasPermission('maintenance.manage') || hasPermission('fleet.manage'));
  const canViewAll = Boolean(hasPermission('maintenance.read_all') || hasPermission('fleet.read_all'));

  const [deptFilter, setDeptFilter] = useState<string>('');
  const [departments, setDepartments] = useState<Array<{id: string; name: string}>>([]);

  const [activeTab, setActiveTab] = useState<'scheduled' | 'history'>('scheduled');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecord | null>(null);

  useEffect(() => {
    // Default to user's department unless the user can view all departments
    if (!deptFilter) {
      setDeptFilter(profile?.department_id || 'all');
    }
  }, [deptFilter, profile?.department_id]);

  // Schedule form
  const [vehicleId, setVehicleId] = useState('');
  const [type, setType] = useState('');
  const [customType, setCustomType] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [atOdometer, setAtOdometer] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  // Complete form
  const [completedDate, setCompletedDate] = useState('');
  const [completeOdometer, setCompleteOdometer] = useState('');
  const [completeCost, setCompleteCost] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');

  useEffect(() => {
    const fetchDepartments = async () => {
      const { data } = await supabase.from('departments').select('id,name').order('name');
      if (data) setDepartments(data as any);
    };
    fetchDepartments();
  }, []);

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', 'active'],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, vehicle_code, plate_no, current_odometer, department_id, department:departments(id,name)')
        .eq('status', 'Active')
        .order('vehicle_code');
      if (error) throw error;
      return (data ?? []) as any;
    },
    staleTime: 60_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['vehicle_maintenance'],
    queryFn: async (): Promise<MaintenanceRecord[]> => {
      const { data, error } = await supabase
        .from('vehicle_maintenance')
        .select(`
          *,
          vehicle:vehicles(id, vehicle_code, plate_no, current_odometer, department_id, department:departments(id,name))
        `)
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
    staleTime: 30_000,
  });

  const stats: SummaryStats = useMemo(() => {
    const rows = recordsQuery.data ?? [];
    let totalSpent = 0;
    let completedCount = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;
    let scheduledCount = 0;
    for (const r of rows) {
      if (r.status === 'Completed') {
        completedCount += 1;
        totalSpent += r.cost ?? 0;
      }
      if (r.status === 'Scheduled' || r.status === 'InProgress') {
        scheduledCount += 1;
        const { isOverdue, isDueSoon } = getDueMeta(r);
        if (isOverdue) overdueCount += 1;
        if (isDueSoon) dueSoonCount += 1;
      }
    }
    return { totalSpent, completedCount, overdueCount, dueSoonCount, scheduledCount };
  }, [recordsQuery.data]);

  const scheduledRows = useMemo(() => {
    const rows = recordsQuery.data ?? [];
    return rows.filter((r) => {
      const matchesTab = r.status === 'Scheduled' || r.status === 'InProgress';
      const matchesDept = (!deptFilter || deptFilter === 'all') ? true : (r.vehicle?.department_id === deptFilter);
      return matchesTab && matchesDept;
    });
  }, [recordsQuery.data, deptFilter]);

  const historyRows = useMemo(() => {
    const rows = recordsQuery.data ?? [];
    return rows.filter((r) => {
      const matchesTab = r.status === 'Completed' || r.status === 'Cancelled';
      const matchesDept = (!deptFilter || deptFilter === 'all') ? true : (r.vehicle?.department_id === deptFilter);
      return matchesTab && matchesDept;
    });
  }, [recordsQuery.data, deptFilter]);

  const resetScheduleForm = () => {
    setVehicleId('');
    setType('');
    setCustomType('');
    setScheduledDate('');
    setAtOdometer('');
    setDescription('');
    setNotes('');
  };

  const openCompleteFor = (r: MaintenanceRecord) => {
    setSelectedRecord(r);
    setCompletedDate(new Date().toISOString().slice(0, 10));
    setCompleteOdometer(r.vehicle?.current_odometer ? String(r.vehicle.current_odometer) : '');
    setCompleteCost('');
    setCompleteNotes('');
    setCompleteOpen(true);
  };

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !type) {
        throw new Error(t('maintenance.toast.selectVehicleType'));
      }

      const finalType = type === '__CUSTOM__' ? (customType.trim() || t('maintenance.types.other')) : type;

      const payload: Partial<MaintenanceRecord> = {
        vehicle_id: vehicleId,
        maintenance_type: finalType,
        scheduled_date: scheduledDate || new Date().toISOString().slice(0, 10),
        status: 'Scheduled',
        description: description.trim() || null,
        notes: notes.trim() || null,
        odometer_reading: atOdometer ? Number(atOdometer) : null,
      };

      const { data: created, error } = await supabase.from('vehicle_maintenance').insert(payload as any).select('id').single();
      if (error) throw error;
      auditLog(supabase as any, {
        action: 'maintenance.create',
        entityType: 'maintenance',
        entityId: created?.id ?? null,
        summary: `Scheduled maintenance for vehicle ${vehicleId}`,
        metadata: { vehicle_id: vehicleId, maintenance_type: finalType, scheduled_date: payload.scheduled_date },
      });
    },
    onSuccess: async () => {
      toast.success(t('maintenance.toast.scheduled'));
      await qc.invalidateQueries({ queryKey: ['vehicle_maintenance'] });
      resetScheduleForm();
      setScheduleOpen(false);
    },
    onError: (e: any) => {
      toast.error(t('maintenance.toast.scheduleFailed'), { description: e?.message });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (r: MaintenanceRecord) => {
      const { error } = await supabase
        .from('vehicle_maintenance')
        .update({ status: 'Cancelled', updated_at: new Date().toISOString() } as any)
        .eq('id', r.id);
      if (error) throw error;
      auditLog(supabase as any, {
        action: 'maintenance.cancel',
        entityType: 'maintenance',
        entityId: r.id,
        summary: `Cancelled maintenance for vehicle ${r.vehicle_id}`,
        metadata: { vehicle_id: r.vehicle_id },
      });
    },
    onSuccess: async () => {
      toast.success(t('maintenance.toast.cancelled'));
      await qc.invalidateQueries({ queryKey: ['vehicle_maintenance'] });
    },
    onError: (e: any) => {
      toast.error(t('maintenance.toast.cancelFailed'), { description: e?.message });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRecord) return;
      const patch: Partial<MaintenanceRecord> = {
        status: 'Completed',
        completed_date: completedDate || new Date().toISOString().slice(0, 10),
        odometer_reading: completeOdometer ? Number(completeOdometer) : selectedRecord.odometer_reading,
        cost: completeCost ? Number(completeCost) : null,
        notes: completeNotes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('vehicle_maintenance')
        .update(patch as any)
        .eq('id', selectedRecord.id);
      if (error) throw error;
      auditLog(supabase as any, {
        action: 'maintenance.complete',
        entityType: 'maintenance',
        entityId: selectedRecord.id,
        summary: `Completed maintenance for vehicle ${selectedRecord.vehicle_id}`,
        metadata: { vehicle_id: selectedRecord.vehicle_id, completed_date: patch.completed_date, cost: patch.cost },
      });
    },
    onSuccess: async () => {
      toast.success(t('maintenance.toast.completed'));
      await qc.invalidateQueries({ queryKey: ['vehicle_maintenance'] });
      setCompleteOpen(false);
      setSelectedRecord(null);
    },
    onError: (e: any) => {
      toast.error(t('maintenance.toast.completeFailed'), { description: e?.message });
    },
  });

  return (
    <MainLayout>
      <PageHeader title={t('maintenance.pageTitle')} description={t('maintenance.pageDesc')} />

      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className={cn('flex items-center justify-between', isRtl && 'flex-row-reverse')}>
                <div>
                  <p className="text-sm text-muted-foreground">{t('maintenance.kpi.totalSpent')}</p>
                  <p className="text-2xl font-semibold">{formatCurrency(stats.totalSpent, 'SAR')}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className={cn('flex items-center justify-between', isRtl && 'flex-row-reverse')}>
                <div>
                  <p className="text-sm text-muted-foreground">{t('maintenance.kpi.completed')}</p>
                  <p className="text-2xl font-semibold">{formatNumber(stats.completedCount)}</p>
                </div>
                <div className="rounded-lg bg-green-50 p-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className={cn('flex items-center justify-between', isRtl && 'flex-row-reverse')}>
                <div>
                  <p className="text-sm text-muted-foreground">{t('maintenance.kpi.overdue')}</p>
                  <p className="text-2xl font-semibold">{formatNumber(stats.overdueCount)}</p>
                </div>
                <div className="rounded-lg bg-red-50 p-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className={cn('flex items-center justify-between', isRtl && 'flex-row-reverse')}>
                <div>
                  <p className="text-sm text-muted-foreground">{t('maintenance.kpi.scheduled')}</p>
                  <p className="text-2xl font-semibold">{formatNumber(stats.scheduledCount)}</p>
                </div>
                <div className="rounded-lg bg-purple-50 p-2">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="p-4">
            <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3', isRtl && 'sm:flex-row-reverse')}>
              <div className={cn(isRtl && 'text-right')}>
                <div className="font-semibold text-amber-900">
                  {t('maintenance.reminders.title', { defaultValue: 'Maintenance Reminder Snapshot' })}
                </div>
                <div className="text-sm text-amber-800/80">
                  {t('maintenance.reminders.desc', { defaultValue: 'Focus first on overdue and due-soon maintenance before adding new schedules.' })}
                </div>
              </div>
              <div className={cn('flex flex-wrap gap-2', isRtl && 'flex-row-reverse')}>
                <Badge variant={stats.overdueCount > 0 ? 'destructive' : 'secondary'}>
                  {t('maintenance.status.overdue', { defaultValue: 'Overdue' })}: {formatNumber(stats.overdueCount)}
                </Badge>
                <Badge variant={stats.dueSoonCount > 0 ? 'secondary' : 'outline'}>
                  {t('maintenance.status.dueSoon', { defaultValue: 'Due soon' })}: {formatNumber(stats.dueSoonCount)}
                </Badge>
                <Badge variant="outline">
                  {t('maintenance.status.scheduled', { defaultValue: 'Scheduled' })}: {formatNumber(stats.scheduledCount)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Records */}
        <Card>
          <CardHeader>
            <div className={cn('flex items-center justify-between gap-2', isRtl && 'flex-row-reverse')}>
              <CardTitle className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
                <Wrench className="h-5 w-5" />
                {t('maintenance.recordsTitle')}
              </CardTitle>

              {canManage && (
                <Button onClick={() => setScheduleOpen(true)}>
                  <Plus className={cn('h-4 w-4', isRtl ? 'ml-2' : 'mr-2')} />
                  {t('maintenance.scheduleButton')}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className={cn(isRtl && 'flex-row-reverse')}>
                <TabsTrigger value="scheduled">{t('maintenance.tabs.scheduled')}</TabsTrigger>
                <TabsTrigger value="history">{t('maintenance.tabs.history')}</TabsTrigger>
              </TabsList>

              <TabsContent value="scheduled" className="mt-4">
                {scheduledRows.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    {t('maintenance.empty.scheduled')}
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className={cn('w-full text-sm', isRtl && 'text-right')}>
                      <thead>
                        <tr className="border-b">
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.vehicle')}</th>
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.type')}</th>
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.scheduled')}</th>
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.status')}</th>
                          {canManage && (
                            <th className={cn('py-3 px-2 font-medium text-right', isRtl && 'text-left')}>
                              {t('maintenance.table.actions')}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {scheduledRows.map((r) => {
                          const badge = getStatusBadgeVariant(r);
                          const Icon = badge.icon;
                          return (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="py-3 px-2">
                                <div className="font-medium">
                                  {r.vehicle ? `${r.vehicle.vehicle_code} - ${r.vehicle.plate_no}` : r.vehicle_id}
                                </div>
                              </td>
                              <td className="py-3 px-2">{getTypeLabel(t, r.maintenance_type)}</td>
                              <td className="py-3 px-2">{formatDate(r.scheduled_date)}</td>
                              <td className="py-3 px-2">
                                <Badge variant={badge.variant} className={cn('gap-1', isRtl && 'flex-row-reverse')}>
                                  <Icon className="h-3 w-3" />
                                  {t(getDisplayStatusKey(r))}
                                </Badge>
                              </td>
                              {canManage && (
                                <td className={cn('py-3 px-2 text-right', isRtl && 'text-left')}>
                                  <div className={cn('flex items-center justify-end gap-2', isRtl && 'flex-row-reverse justify-start')}>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openCompleteFor(r)}
                                    >
                                      {t('maintenance.action.complete')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => cancelMutation.mutate(r)}
                                    >
                                      {t('maintenance.action.cancel')}
                                    </Button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                {historyRows.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    {t('maintenance.empty.history')}
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className={cn('w-full text-sm', isRtl && 'text-right')}>
                      <thead>
                        <tr className="border-b">
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.vehicle')}</th>
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.type')}</th>
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.completed')}</th>
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.odometer')}</th>
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.cost')}</th>
                          <th className="py-3 px-2 font-medium">{t('maintenance.table.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRows.map((r) => {
                          const badge = getStatusBadgeVariant(r);
                          const Icon = badge.icon;
                          return (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="py-3 px-2">
                                <div className="font-medium">
                                  {r.vehicle ? `${r.vehicle.vehicle_code} - ${r.vehicle.plate_no}` : r.vehicle_id}
                                </div>
                              </td>
                              <td className="py-3 px-2">{getTypeLabel(t, r.maintenance_type)}</td>
                              <td className="py-3 px-2">{r.completed_date ? formatDate(r.completed_date) : '—'}</td>
                              <td className="py-3 px-2">{r.odometer_reading ? formatNumber(r.odometer_reading) : '—'}</td>
                              <td className="py-3 px-2">{r.cost != null ? formatCurrency(r.cost, 'SAR') : '—'}</td>
                              <td className="py-3 px-2">
                                <Badge variant={badge.variant} className={cn('gap-1', isRtl && 'flex-row-reverse')}>
                                  <Icon className="h-3 w-3" />
                                  {t(getDisplayStatusKey(r))}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('maintenance.dialog.scheduleTitle')}</DialogTitle>
            <DialogDescription>{t('maintenance.pageDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('maintenance.form.vehicle')} *</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('maintenance.form.vehiclePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(vehiclesQuery.data ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.vehicle_code} - {v.plate_no}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('maintenance.form.type')} *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('maintenance.form.typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_TYPES.map((x) => (
                    <SelectItem key={x.value} value={x.value}>
                      {t(x.labelKey)}
                    </SelectItem>
                  ))}
                  <SelectItem value="__CUSTOM__">{t('maintenance.form.typeCustom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === '__CUSTOM__' && (
              <div className="space-y-2">
                <Label>{t('maintenance.form.customName')}</Label>
                <Input
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  placeholder={t('maintenance.form.customNamePlaceholder')}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('maintenance.form.description')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('maintenance.form.descriptionPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('maintenance.form.atOdometer')}</Label>
                <Input
                  type="number"
                  value={atOdometer}
                  onChange={(e) => setAtOdometer(e.target.value)}
                  placeholder={t('maintenance.form.atOdometerPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('maintenance.form.scheduledDate')}</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('maintenance.form.notes')}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('maintenance.form.notesPlaceholder')}
              />
            </div>
          </div>

          <DialogFooter className={cn('gap-2', isRtl && 'flex-row-reverse justify-start')}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setScheduleOpen(false)}
            >
              {t('maintenance.form.cancel')}
            </Button>
            <Button type="button" onClick={() => scheduleMutation.mutate()} disabled={scheduleMutation.isPending}>
              {t('maintenance.form.schedule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('maintenance.complete.title')}</DialogTitle>
            <DialogDescription>
              {selectedRecord?.vehicle
                ? `${selectedRecord.vehicle.vehicle_code} - ${selectedRecord.vehicle.plate_no}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('maintenance.complete.completedDate')}</Label>
              <Input type="date" value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('maintenance.complete.odometer')}</Label>
                <Input
                  type="number"
                  value={completeOdometer}
                  onChange={(e) => setCompleteOdometer(e.target.value)}
                  placeholder={t('maintenance.complete.odometerPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('maintenance.complete.cost')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={completeCost}
                  onChange={(e) => setCompleteCost(e.target.value)}
                  placeholder={t('maintenance.complete.costPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('maintenance.complete.notes')}</Label>
              <Textarea
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder={t('maintenance.complete.notesPlaceholder')}
              />
            </div>
          </div>

          <DialogFooter className={cn('gap-2', isRtl && 'flex-row-reverse justify-start')}>
            <Button type="button" variant="outline" onClick={() => setCompleteOpen(false)}>
              {t('maintenance.complete.cancel')}
            </Button>
            <Button type="button" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              {t('maintenance.complete.markComplete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
