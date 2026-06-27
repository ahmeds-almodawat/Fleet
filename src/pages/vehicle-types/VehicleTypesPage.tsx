import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';

import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Car, Plus, Pencil, Trash2, Search } from 'lucide-react';

interface VehicleTypeRow {
  id: string;
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  default_anomaly_distance_threshold_km?: number | null;
  default_service_interval_km?: number | null;
  default_service_notify_before_km?: number | null;
  active: boolean;
  created_at: string;
}

export default function VehicleTypesPage() {
  const { t } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');

  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<VehicleTypeRow | null>(null);

  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [anomalyThreshold, setAnomalyThreshold] = useState('5');
  const [serviceInterval, setServiceInterval] = useState('10000');
  const [serviceNotifyBefore, setServiceNotifyBefore] = useState('1000');
  const [isActive, setIsActive] = useState(true);

  const typeLabel = (vt: Partial<VehicleTypeRow> | null | undefined) => {
    if (!vt) return '';
    const ar = (vt as any).name_ar ?? (vt as any).nameAr ?? null;
    const en = (vt as any).name_en ?? (vt as any).nameEn ?? null;
    const legacy = (vt as any).name ?? '';
    return isRtl ? (ar || en || legacy) : (en || legacy || ar || '');
  };

  const loadVehicleTypes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vehicle_types')
        .select('id, name, name_en, name_ar, default_anomaly_distance_threshold_km, default_service_interval_km, default_service_notify_before_km, active, created_at')
        .order('name', { ascending: true });

      if (error) throw error;
      setVehicleTypes((data || []) as any);
    } catch (error: any) {
      toast.error(t('vehicleTypes.toast.loadFailed'), { description: error?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicleTypes();
     
  }, []);

  const filteredTypes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return vehicleTypes;
    return vehicleTypes.filter((vt) => {
      const hay = [
        vt.name,
        vt.name_en || '',
        vt.name_ar || '',
        String(vt.default_anomaly_distance_threshold_km ?? ''),
        String(vt.default_service_interval_km ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vehicleTypes, searchTerm]);

  const openAddDialog = () => {
    setEditingType(null);
    setNameEn('');
    setNameAr('');
    setAnomalyThreshold('5');
    setServiceInterval('10000');
    setServiceNotifyBefore('1000');
    setIsActive(true);
    setIsDialogOpen(true);
  };

  const openEditDialog = (vt: VehicleTypeRow) => {
    setEditingType(vt);
    setNameEn(vt.name_en || vt.name || '');
    setNameAr(vt.name_ar || '');
    setAnomalyThreshold(String(vt.default_anomaly_distance_threshold_km ?? 5));
    setServiceInterval(String(vt.default_service_interval_km ?? 10000));
    setServiceNotifyBefore(String(vt.default_service_notify_before_km ?? 1000));
    setIsActive(!!vt.active);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const en = nameEn.trim();
    const ar = nameAr.trim();

    if (!en && !ar) {
      toast.error(t('vehicleTypes.toast.nameRequired'));
      return;
    }

    const payload: any = {
      name: en || ar, // keep legacy "name" for existing code/joins
      name_en: en || null,
      name_ar: ar || null,
      default_anomaly_distance_threshold_km: anomalyThreshold ? Number(anomalyThreshold) : null,
      default_service_interval_km: serviceInterval ? Number(serviceInterval) : null,
      default_service_notify_before_km: serviceNotifyBefore ? Number(serviceNotifyBefore) : null,
      active: isActive,
    };

    try {
      if (editingType) {
        const { error } = await supabase.from('vehicle_types').update(payload).eq('id', editingType.id);
        if (error) throw error;
        toast.success(t('vehicleTypes.toast.updated'));
      } else {
        const { error } = await supabase.from('vehicle_types').insert([payload]);
        if (error) throw error;
        toast.success(t('vehicleTypes.toast.created'));
      }

      setIsDialogOpen(false);
      await loadVehicleTypes();
    } catch (error: any) {
      toast.error(t('vehicleTypes.toast.saveFailed'), { description: error?.message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('vehicle_types').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('vehicleTypes.toast.deleted'));
      await loadVehicleTypes();
    } catch (error: any) {
      toast.error(t('vehicleTypes.toast.deleteFailed'), { description: error?.message });
    }
  };

  return (
    <MainLayout>
      <PageHeader title={t('vehicleTypes.title')} description={t('vehicleTypes.description')} />

      <div className="space-y-6">
        <Card>
          <CardHeader className={cn('flex flex-row items-center justify-between', isRtl && 'flex-row-reverse')}>
            <CardTitle className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
              <Car className="w-5 h-5" />
              {t('vehicleTypes.listTitle')}
            </CardTitle>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAddDialog} className={cn(isRtl && 'flex-row-reverse')}>
                  <Plus className={cn('w-4 h-4', isRtl ? 'ml-2' : 'mr-2')} />
                  {t('vehicleTypes.add')}
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editingType ? t('vehicleTypes.editTitle') : t('vehicleTypes.addTitle')}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="block whitespace-normal break-words">{t('vehicleTypes.fields.nameEn')} *</Label>
                      <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder={t('vehicleTypes.placeholders.nameEn')} />
                    </div>
                    <div className="space-y-2">
                      <Label className="block whitespace-normal break-words">{t('vehicleTypes.fields.nameAr')} *</Label>
                      <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={t('vehicleTypes.placeholders.nameAr')} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="block whitespace-normal break-words">{t('vehicleTypes.fields.anomalyThreshold')}</Label>
                      <Input type="number" min={0} value={anomalyThreshold} onChange={(e) => setAnomalyThreshold(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="block whitespace-normal break-words">{t('vehicleTypes.fields.serviceInterval')}</Label>
                      <Input type="number" min={0} value={serviceInterval} onChange={(e) => setServiceInterval(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="block whitespace-normal break-words">{t('vehicleTypes.fields.serviceNotifyBefore')}</Label>
                      <Input type="number" min={0} value={serviceNotifyBefore} onChange={(e) => setServiceNotifyBefore(e.target.value)} />
                    </div>
                  </div>

                  <div className={cn('flex items-center justify-between rounded-lg border p-3', isRtl && 'flex-row-reverse')}>
                    <div>
                      <p className="text-sm font-medium">{t('vehicleTypes.fields.active')}</p>
                      <p className="text-xs text-muted-foreground">{t('vehicleTypes.fields.activeHint')}</p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>

                  <div className={cn('flex gap-2', isRtl && 'flex-row-reverse')}>
                    <Button onClick={handleSave} className="flex-1">
                      {t('common.save')}
                    </Button>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1">
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>

          <CardContent>
            <div className="relative mb-4">
              <Search className={cn('absolute top-3 h-4 w-4 text-muted-foreground', isRtl ? 'right-3' : 'left-3')} />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('vehicleTypes.searchPlaceholder')}
                className={cn(isRtl ? 'pr-9' : 'pl-9')}
              />
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
            ) : filteredTypes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t('vehicleTypes.empty')}</div>
            ) : (
              <div className="space-y-3">
                {filteredTypes.map((vt) => (
                  <div key={vt.id} className={cn('flex items-center justify-between rounded-lg border p-4', isRtl && 'flex-row-reverse')}>
                    <div className={cn('min-w-0', isRtl && 'text-right')}>
                      <p className="font-medium truncate">{typeLabel(vt)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t('vehicleTypes.rowMeta', {
                          anomaly: vt.default_anomaly_distance_threshold_km ?? 5,
                          interval: vt.default_service_interval_km ?? 10000,
                          notify: vt.default_service_notify_before_km ?? 1000,
                        })}
                      </p>
                      {!vt.active && <p className="text-xs text-amber-700 mt-1">{t('vehicleTypes.inactive')}</p>}
                    </div>

                    <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(vt)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(vt.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
