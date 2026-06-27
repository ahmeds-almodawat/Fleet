import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { downloadCsvFile, downloadExcelHtml, printCurrentPage } from '@/lib/exportFiles';
import { AlertTriangle, CalendarDays, Download, FileSpreadsheet, FileText, Printer, ShieldCheck } from 'lucide-react';

type VehicleRow = {
  id: string;
  vehicle_code: string;
  plate_no: string;
  status: string | null;
  insurance_end_date: string | null;
  registration_end_date: string | null;
  insurance_no?: string | null;
  registration_no?: string | null;
  department?: { id?: string | null; name?: string | null } | null;
};

function daysLeft(date?: string | null) {
  if (!date) return null;
  const today = new Date();
  const target = new Date(`${date}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function statusFor(days: number | null) {
  if (days === null) return 'missing';
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
}

function docBadge(days: number | null, label: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const status = statusFor(days);
  const count = Math.abs(days ?? 0);
  if (status === 'expired') return <Badge variant="destructive">{label}: {t('vehicleDocs.status.expired', { count })}</Badge>;
  if (status === 'expiring') return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{label}: {t('vehicleDocs.status.expiring', { count: days ?? 0 })}</Badge>;
  if (status === 'missing') return <Badge variant="outline">{label}: {t('vehicleDocs.status.missing')}</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{label}: {t('vehicleDocs.status.valid')}</Badge>;
}

function riskLabel(risk: string, t: (key: string) => string) {
  const map: Record<string, string> = { expired: 'vehicleDocs.expired', expiring: 'common.expiring', missing: 'vehicleDocs.missing', valid: 'vehicleDocs.valid' };
  return t(map[risk] || risk);
}

export default function VehicleDocumentsDashboardPage() {
  const { t } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('vehicles')
        .select('id, vehicle_code, plate_no, status, insurance_no, registration_no, insurance_end_date, registration_end_date, department:departments(id,name)')
        .order('vehicle_code');
      setRows((data || []) as unknown as VehicleRow[]);
      setLoading(false);
    };
    load();
  }, []);

  const decorated = useMemo(() => rows.map((v) => {
    const insuranceDays = daysLeft(v.insurance_end_date);
    const registrationDays = daysLeft(v.registration_end_date);
    const worst = [statusFor(insuranceDays), statusFor(registrationDays)].includes('expired') ? 'expired'
      : [statusFor(insuranceDays), statusFor(registrationDays)].includes('expiring') ? 'expiring'
      : [statusFor(insuranceDays), statusFor(registrationDays)].includes('missing') ? 'missing'
      : 'valid';
    return { ...v, insuranceDays, registrationDays, worst };
  }), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return decorated.filter((v) => {
      const matchesSearch = !s || [v.vehicle_code, v.plate_no, v.insurance_no, v.registration_no, v.department?.name]
        .some((x) => String(x || '').toLowerCase().includes(s));
      const matchesRisk = risk === 'all' || v.worst === risk;
      return matchesSearch && matchesRisk;
    });
  }, [decorated, search, risk]);

  const stats = useMemo(() => ({
    expired: decorated.filter((v) => v.worst === 'expired').length,
    expiring: decorated.filter((v) => v.worst === 'expiring').length,
    missing: decorated.filter((v) => v.worst === 'missing').length,
    valid: decorated.filter((v) => v.worst === 'valid').length,
  }), [decorated]);

  const exportRows = filtered.map((v) => [
    v.vehicle_code,
    v.plate_no,
    v.department?.name || '',
    v.insurance_no || '',
    v.insurance_end_date || '',
    v.insuranceDays ?? '',
    v.registration_no || '',
    v.registration_end_date || '',
    v.registrationDays ?? '',
    v.worst,
  ]);

  const headers = [
    t('vehicles.vehicle'),
    t('vehicles.plate'),
    t('common.department'),
    t('vehicles.insurancePolicyNo'),
    t('vehicles.insuranceEnd'),
    `${t('vehicleDocs.insurance')} - ${t('vehicleDocs.daysLeft')}`,
    t('vehicles.registrationNo'),
    t('vehicles.registrationEnd'),
    `${t('vehicleDocs.registration')} - ${t('vehicleDocs.daysLeft')}`,
    t('vehicleDocs.risk'),
  ];

  return (
    <MainLayout>
      <PageHeader
        title={t('vehicleDocs.title', { defaultValue: 'Vehicle Document Expiry Dashboard' })}
        description={t('vehicleDocs.desc', { defaultValue: 'Insurance and registration expiry overview for all vehicles.' })}
      >
        <div className={cn('flex flex-wrap gap-2', isRtl && 'flex-row-reverse')}>
          <Button variant="outline" onClick={() => downloadCsvFile(`vehicle_documents_${new Date().toISOString().slice(0, 10)}.csv`, headers, exportRows)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => downloadExcelHtml(`vehicle_documents_${new Date().toISOString().slice(0, 10)}.xls`, [{ name: t('vehicleDocs.title'), headers, rows: exportRows }])}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={printCurrentPage}>
            <Printer className="h-4 w-4" /> PDF
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><AlertTriangle className="h-5 w-5 text-red-600" /><div className="text-sm text-muted-foreground">{t('vehicleDocs.expired')}</div><div className="text-2xl font-bold">{stats.expired}</div></CardContent></Card>
          <Card><CardContent className="p-4"><CalendarDays className="h-5 w-5 text-amber-600" /><div className="text-sm text-muted-foreground">{t('vehicleDocs.expiring30d')}</div><div className="text-2xl font-bold">{stats.expiring}</div></CardContent></Card>
          <Card><CardContent className="p-4"><FileText className="h-5 w-5 text-slate-600" /><div className="text-sm text-muted-foreground">{t('vehicleDocs.missing')}</div><div className="text-2xl font-bold">{stats.missing}</div></CardContent></Card>
          <Card><CardContent className="p-4"><ShieldCheck className="h-5 w-5 text-emerald-600" /><div className="text-sm text-muted-foreground">{t('vehicleDocs.valid')}</div><div className="text-2xl font-bold">{stats.valid}</div></CardContent></Card>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search', { defaultValue: 'Search' })} />
            <Select value={risk} onValueChange={setRisk}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('vehicleDocs.allRisks')}</SelectItem>
                <SelectItem value="expired">{t('vehicleDocs.expired')}</SelectItem>
                <SelectItem value="expiring">{t('common.expiring')}</SelectItem>
                <SelectItem value="missing">{t('vehicleDocs.missing')}</SelectItem>
                <SelectItem value="valid">{t('vehicleDocs.valid')}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:hidden">
          {filtered.map((v) => (
            <Card key={v.id} className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link to={`/vehicles/${v.id}`} className="font-bold text-primary hover:underline">{v.vehicle_code}</Link>
                    <div className="text-sm text-muted-foreground">{v.plate_no}</div>
                  </div>
                  <Badge variant={v.worst === 'expired' ? 'destructive' : v.worst === 'expiring' ? 'secondary' : 'outline'}>{riskLabel(v.worst, t)}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {docBadge(v.insuranceDays, t('vehicleDocs.insurance'), t)}
                  {docBadge(v.registrationDays, t('vehicleDocs.registration'), t)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-lg border bg-background">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {headers.map((h) => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={headers.length} className="p-8 text-center text-muted-foreground">{t('common.loading')}</td></tr>
              ) : filtered.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-4 py-3"><Link to={`/vehicles/${v.id}`} className="font-medium text-primary">{v.vehicle_code}</Link></td>
                  <td className="px-4 py-3">{v.plate_no}</td>
                  <td className="px-4 py-3">{v.department?.name || '—'}</td>
                  <td className="px-4 py-3">{v.insurance_no || '—'}</td>
                  <td className="px-4 py-3">{v.insurance_end_date || '—'}</td>
                  <td className="px-4 py-3">{v.insuranceDays ?? '—'}</td>
                  <td className="px-4 py-3">{v.registration_no || '—'}</td>
                  <td className="px-4 py-3">{v.registration_end_date || '—'}</td>
                  <td className="px-4 py-3">{v.registrationDays ?? '—'}</td>
                  <td className="px-4 py-3"><Badge variant={v.worst === 'expired' ? 'destructive' : v.worst === 'expiring' ? 'secondary' : 'outline'}>{riskLabel(v.worst, t)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
