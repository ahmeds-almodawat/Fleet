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
import { MapPin, Plus, Pencil, Trash2, Search } from 'lucide-react';

interface DestinationRow {
  id: string;
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  category?: string | null;
  category_en?: string | null;
  category_ar?: string | null;
  active: boolean;
  created_at: string;
}

export default function DestinationsPage() {
  const { t } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');

  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDest, setEditingDest] = useState<DestinationRow | null>(null);

  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [categoryEn, setCategoryEn] = useState('');
  const [categoryAr, setCategoryAr] = useState('');
  const [active, setActive] = useState(true);

  const destLabel = (d: Partial<DestinationRow> | null | undefined) => {
    if (!d) return '';
    const ar = (d as any).name_ar ?? null;
    const en = (d as any).name_en ?? null;
    const legacy = (d as any).name ?? '';
    return isRtl ? (ar || en || legacy) : (en || legacy || ar || '');
  };

  const catLabel = (d: Partial<DestinationRow> | null | undefined) => {
    if (!d) return '';
    const ar = (d as any).category_ar ?? null;
    const en = (d as any).category_en ?? null;
    const legacy = (d as any).category ?? '';
    return isRtl ? (ar || en || legacy) : (en || legacy || ar || '');
  };

  const loadDestinations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('destinations')
        .select('id, name, name_en, name_ar, category, category_en, category_ar, active, created_at')
        .order('name', { ascending: true });

      if (error) throw error;
      setDestinations((data || []) as any);
    } catch (error: any) {
      toast.error(t('destinations.toast.loadFailed'), { description: error?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDestinations();
     
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((d) => {
      const hay = [d.name, d.name_en || '', d.name_ar || '', d.category || '', d.category_en || '', d.category_ar || '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [destinations, searchTerm]);

  const openAddDialog = () => {
    setEditingDest(null);
    setNameEn('');
    setNameAr('');
    setCategoryEn('');
    setCategoryAr('');
    setActive(true);
    setIsDialogOpen(true);
  };

  const openEditDialog = (d: DestinationRow) => {
    setEditingDest(d);
    setNameEn(d.name_en || d.name || '');
    setNameAr(d.name_ar || '');
    setCategoryEn(d.category_en || d.category || '');
    setCategoryAr(d.category_ar || '');
    setActive(!!d.active);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const en = nameEn.trim();
    const ar = nameAr.trim();
    if (!en && !ar) {
      toast.error(t('destinations.toast.nameRequired'));
      return;
    }

    const payload: any = {
      name: en || ar,
      name_en: en || null,
      name_ar: ar || null,
      category: categoryEn.trim() || categoryAr.trim() || null,
      category_en: categoryEn.trim() || null,
      category_ar: categoryAr.trim() || null,
      active,
    };

    try {
      if (editingDest) {
        const { error } = await supabase.from('destinations').update(payload).eq('id', editingDest.id);
        if (error) throw error;
        toast.success(t('destinations.toast.updated'));
      } else {
        const { error } = await supabase.from('destinations').insert([payload]);
        if (error) throw error;
        toast.success(t('destinations.toast.created'));
      }

      setIsDialogOpen(false);
      await loadDestinations();
    } catch (error: any) {
      toast.error(t('destinations.toast.saveFailed'), { description: error?.message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('destinations').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('destinations.toast.deleted'));
      await loadDestinations();
    } catch (error: any) {
      toast.error(t('destinations.toast.deleteFailed'), { description: error?.message });
    }
  };

  return (
    <MainLayout>
      <PageHeader title={t('destinations.title')} description={t('destinations.description')} />

      <div className="space-y-6">
        <Card>
          <CardHeader className={cn('flex flex-row items-center justify-between', isRtl && 'flex-row-reverse')}>
            <CardTitle className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
              <MapPin className="w-5 h-5" />
              {t('destinations.listTitle')}
            </CardTitle>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAddDialog} className={cn(isRtl && 'flex-row-reverse')}>
                  <Plus className={cn('w-4 h-4', isRtl ? 'ml-2' : 'mr-2')} />
                  {t('destinations.add')}
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editingDest ? t('destinations.editTitle') : t('destinations.addTitle')}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="block whitespace-normal break-words">{t('destinations.fields.nameEn')} *</Label>
                      <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder={t('destinations.placeholders.nameEn')} />
                    </div>
                    <div className="space-y-2">
                      <Label className="block whitespace-normal break-words">{t('destinations.fields.nameAr')} *</Label>
                      <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={t('destinations.placeholders.nameAr')} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="block whitespace-normal break-words">{t('destinations.fields.categoryEn')}</Label>
                      <Input value={categoryEn} onChange={(e) => setCategoryEn(e.target.value)} placeholder={t('destinations.placeholders.categoryEn')} />
                    </div>
                    <div className="space-y-2">
                      <Label className="block whitespace-normal break-words">{t('destinations.fields.categoryAr')}</Label>
                      <Input dir="rtl" value={categoryAr} onChange={(e) => setCategoryAr(e.target.value)} placeholder={t('destinations.placeholders.categoryAr')} />
                    </div>
                  </div>

                  <div className={cn('flex items-center justify-between rounded-lg border p-3', isRtl && 'flex-row-reverse')}>
                    <div>
                      <p className="text-sm font-medium">{t('destinations.fields.active')}</p>
                      <p className="text-xs text-muted-foreground">{t('destinations.fields.activeHint')}</p>
                    </div>
                    <Switch checked={active} onCheckedChange={setActive} />
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
                placeholder={t('destinations.searchPlaceholder')}
                className={cn(isRtl ? 'pr-9' : 'pl-9')}
              />
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t('destinations.empty')}</div>
            ) : (
              <div className="space-y-3">
                {filtered.map((d) => (
                  <div key={d.id} className={cn('flex items-center justify-between rounded-lg border p-4', isRtl && 'flex-row-reverse')}>
                    <div className={cn('min-w-0', isRtl && 'text-right')}>
                      <p className="font-medium truncate">{destLabel(d)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {catLabel(d) ? `${t('destinations.categoryLabel')}: ${catLabel(d)}` : t('destinations.noCategory')}
                      </p>
                      {!d.active && <p className="text-xs text-amber-700 mt-1">{t('destinations.inactive')}</p>}
                    </div>

                    <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(d)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(d.id)}>
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
