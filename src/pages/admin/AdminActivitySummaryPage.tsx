import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { downloadCsvFile, downloadExcelHtml, printCurrentPage } from '@/lib/exportFiles';
import { Activity, Download, FileSpreadsheet, Printer, ShieldAlert, Users } from 'lucide-react';

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  summary: string | null;
  actor?: { name_en?: string | null; name_ar?: string | null } | null;
};

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function countBy<T extends string>(rows: AuditRow[], selector: (row: AuditRow) => T | null | undefined) {
  const out = new Map<T, number>();
  for (const r of rows) {
    const key = selector(r);
    if (!key) continue;
    out.set(key, (out.get(key) || 0) + 1);
  }
  return Array.from(out.entries()).sort((a, b) => b[1] - a[1]);
}

export default function AdminActivitySummaryPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const [range, setRange] = useState('7');

  const { data = [], isLoading } = useQuery({
    queryKey: ['admin-activity-summary', range],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_events')
        .select('id, created_at, action, entity_type, summary, actor:profiles!audit_events_actor_user_id_fkey(name_en, name_ar)')
        .gte('created_at', daysAgo(Number(range)))
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as unknown as AuditRow[];
    },
  });

  const actionCounts = useMemo(() => countBy(data, (r) => r.action), [data]);
  const entityCounts = useMemo(() => countBy(data, (r) => r.entity_type), [data]);
  const actorCounts = useMemo(() => countBy(data, (r) => isRtl ? (r.actor?.name_ar || r.actor?.name_en || 'System') : (r.actor?.name_en || r.actor?.name_ar || 'System')), [data, isRtl]);
  const exports = data.filter((r) => r.action?.includes('export')).length;
  const securityActions = data.filter((r) => ['users', 'roles', 'settings', 'audit'].some((k) => r.action?.includes(k) || r.entity_type?.includes(k))).length;

  const headers = ['Time', 'Actor', 'Action', 'Entity', 'Summary'];
  const rows = data.map((r) => [new Date(r.created_at).toLocaleString(), isRtl ? (r.actor?.name_ar || r.actor?.name_en || 'System') : (r.actor?.name_en || r.actor?.name_ar || 'System'), r.action, r.entity_type || '', r.summary || '']);

  return (
    <MainLayout>
      <PageHeader
        title={t('adminActivity.title', { defaultValue: 'Admin Activity Summary' })}
        description={t('adminActivity.desc', { defaultValue: 'Summary of audit activity, exports, and sensitive admin actions.' })}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadCsvFile(`admin_activity_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => downloadExcelHtml(`admin_activity_${new Date().toISOString().slice(0, 10)}.xls`, [{ name: 'Admin Activity', headers, rows }])}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={printCurrentPage}>
            <Printer className="h-4 w-4" /> PDF
          </Button>
        </div>
      </PageHeader>

      <Card className="mb-6 print:hidden">
        <CardContent className="p-4 max-w-xs">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4"><Activity className="h-5 w-5 text-blue-600" /><div className="text-sm text-muted-foreground">Events</div><div className="text-2xl font-bold">{data.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><Users className="h-5 w-5 text-emerald-600" /><div className="text-sm text-muted-foreground">Actors</div><div className="text-2xl font-bold">{actorCounts.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><Download className="h-5 w-5 text-purple-600" /><div className="text-sm text-muted-foreground">Exports</div><div className="text-2xl font-bold">{exports}</div></CardContent></Card>
        <Card><CardContent className="p-4"><ShieldAlert className="h-5 w-5 text-amber-600" /><div className="text-sm text-muted-foreground">Sensitive</div><div className="text-2xl font-bold">{securityActions}</div></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Top actors</CardTitle></CardHeader><CardContent className="space-y-2">{actorCounts.slice(0, 8).map(([name, count]) => <div key={name} className="flex justify-between gap-3"><span>{name}</span><Badge variant="outline">{count}</Badge></div>)}</CardContent></Card>
        <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Top actions</CardTitle></CardHeader><CardContent className="space-y-2">{actionCounts.slice(0, 8).map(([name, count]) => <div key={name} className="flex justify-between gap-3"><span className="truncate">{name}</span><Badge variant="outline">{count}</Badge></div>)}</CardContent></Card>
        <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Entities</CardTitle></CardHeader><CardContent className="space-y-2">{entityCounts.slice(0, 8).map(([name, count]) => <div key={name} className="flex justify-between gap-3"><span>{name}</span><Badge variant="outline">{count}</Badge></div>)}</CardContent></Card>
      </div>

      <Card className="border-0 shadow-sm mt-6">
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <div className="text-muted-foreground">Loading...</div> : data.slice(0, 20).map((r) => (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{r.action}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div className="text-sm text-muted-foreground">{r.summary || r.entity_type || '—'}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
