import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { 
  DollarSign, 
  Download, 
  Printer,
  Car, 
  Wrench,
  TrendingUp,
  Calendar,
  Filter
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { AccessDenied } from '@/components/ui/access-denied';

interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  maintenance_type_id: string | null;
  custom_type_name: string | null;
  completed_date: string | null;
  cost: number | null;
  vehicle: { vehicle_code: string; plate_no: string } | null;
  maintenance_type: { name: string } | null;
}

interface Vehicle {
  id: string;
  vehicle_code: string;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(173, 80%, 40%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
];

export default function MaintenanceCostReportPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || '').startsWith('ar');
  const { hasPermission } = useAuth();
  const canView = hasPermission('reports.view') || hasPermission('reports.read') || hasPermission('reports.read_all');
  const canExport = hasPermission('reports.export_csv') || (hasPermission('reports.view') && hasPermission('reports.export'));
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('all');
  const [startDate, setStartDate] = useState(() => 
    format(subMonths(new Date(), 12), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(() => 
    format(new Date(), 'yyyy-MM-dd')
  );

  useEffect(() => {
    if (canView) fetchData();
  }, [startDate, endDate, selectedVehicle]);

  const fetchData = async () => {
    setLoading(true);
    
    let query = supabase
      .from('vehicle_maintenance')
      .select('*, vehicle:vehicles(vehicle_code, plate_no), maintenance_type:maintenance_types(name)')
      .eq('status', 'Completed')
      .not('cost', 'is', null)
      .gte('completed_date', startDate)
      .lte('completed_date', endDate)
      .order('completed_date', { ascending: false });
    
    if (selectedVehicle !== 'all') {
      query = query.eq('vehicle_id', selectedVehicle);
    }

    const [recordsRes, vehiclesRes] = await Promise.all([
      query,
      supabase.from('vehicles').select('id, vehicle_code').order('vehicle_code'),
    ]);

    if (recordsRes.data) setRecords(recordsRes.data as MaintenanceRecord[]);
    if (vehiclesRes.data) setVehicles(vehiclesRes.data);
    setLoading(false);
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgCost = records.length > 0 ? totalCost / records.length : 0;
    const uniqueVehicles = new Set(records.map(r => r.vehicle_id)).size;
    
    return { totalCost, avgCost, totalServices: records.length, uniqueVehicles };
  }, [records]);

  // Cost by vehicle
  const costByVehicle = useMemo(() => {
    const vehicleCosts: Record<string, { name: string; cost: number; count: number }> = {};
    
    records.forEach(r => {
      const vehicleCode = r.vehicle?.vehicle_code || 'Unknown';
      if (!vehicleCosts[vehicleCode]) {
        vehicleCosts[vehicleCode] = { name: vehicleCode, cost: 0, count: 0 };
      }
      vehicleCosts[vehicleCode].cost += r.cost || 0;
      vehicleCosts[vehicleCode].count += 1;
    });
    
    return Object.values(vehicleCosts)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);
  }, [records]);

  // Cost by maintenance type
  const costByType = useMemo(() => {
    const typeCosts: Record<string, { name: string; value: number; count: number }> = {};
    
    records.forEach(r => {
      const typeName = r.maintenance_type?.name || r.custom_type_name || 'Other';
      if (!typeCosts[typeName]) {
        typeCosts[typeName] = { name: typeName, value: 0, count: 0 };
      }
      typeCosts[typeName].value += r.cost || 0;
      typeCosts[typeName].count += 1;
    });
    
    return Object.values(typeCosts).sort((a, b) => b.value - a.value);
  }, [records]);

  // Cost over time (monthly)
  const costOverTime = useMemo(() => {
    const monthlyData: Record<string, { month: string; cost: number; count: number }> = {};
    
    records.forEach(r => {
      if (r.completed_date) {
        const monthKey = format(new Date(r.completed_date), 'yyyy-MM');
        const monthLabel = format(new Date(r.completed_date), 'MMM yyyy');
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { month: monthLabel, cost: 0, count: 0 };
        }
        monthlyData[monthKey].cost += r.cost || 0;
        monthlyData[monthKey].count += 1;
      }
    });
    
    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => data);
  }, [records]);

  const exportCSV = () => {
    if (!canExport) {
      toast.error(t('common.noAccess'));
      return;
    }
    const headers = ['Date', 'Vehicle', 'Service Type', 'Cost'];
    const rows = records.map(r => [
      r.completed_date || '',
      r.vehicle?.vehicle_code || '',
      `"${String(r.maintenance_type?.name || r.custom_type_name || '').replace(/"/g, '""')}"`,
      r.cost?.toString() || '0',
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    // UTF-8 BOM so Arabic opens correctly in Excel
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maintenance-costs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!canExport) {
      toast.error(t('common.noAccess'));
      return;
    }
    window.print();
  };

  if (!canView) {
    return (
      <MainLayout>
        <PageHeader title={t('reports.maintenanceCosts.title')} description={t('reports.maintenanceCosts.desc')} />
        <AccessDenied titleKey="studio.noAccessTitle" descKey="common.noAccess" />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader 
        title={t('reports.maintenanceCosts.title')}
        description={t('reports.maintenanceCosts.desc')}
      >
        {canExport && (
          <div className={cn('flex gap-2', isRtl && 'flex-row-reverse')}>
            <Button onClick={exportCSV} variant="outline" className={cn('gap-2', isRtl && 'flex-row-reverse')}>
              <Download className="w-4 h-4" />
              {t('reports.export.csv')}
            </Button>
            <Button onClick={exportPDF} variant="outline" className={cn('gap-2', isRtl && 'flex-row-reverse')}>
              <Printer className="w-4 h-4" />
              {t('reports.export.pdf')}
            </Button>
          </div>
        )}
      </PageHeader>

      {/* Filters */}
      <Card className="border-0 shadow-sm mb-6 print:hidden">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="mb-2 block">{t('maintenanceCost.filters.vehicle')}</Label>
              <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                <SelectTrigger className={cn(isRtl && 'text-right')}>
                  <SelectValue placeholder={t('maintenanceCost.filters.allVehicles')} />
                </SelectTrigger>
                <SelectContent align={isRtl ? 'end' : 'start'}>
                  <SelectItem value="all">{t('maintenanceCost.filters.allVehicles')}</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.vehicle_code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="mb-2 block">{t('maintenanceCost.filters.startDate')}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="min-w-[160px]">
              <Label className="mb-2 block">{t('maintenanceCost.filters.endDate')}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalCost)}</p>
                <p className="text-sm text-muted-foreground">{t('maintenanceCost.kpi.totalCost')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-status-info/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-status-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.avgCost)}</p>
                <p className="text-sm text-muted-foreground">{t('maintenanceCost.kpi.avgCost')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-status-success/10 flex items-center justify-center">
                <Wrench className="w-6 h-6 text-status-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatNumber(stats.totalServices)}</p>
                <p className="text-sm text-muted-foreground">{t('maintenanceCost.kpi.totalServices')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-status-warning/10 flex items-center justify-center">
                <Car className="w-6 h-6 text-status-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatNumber(stats.uniqueVehicles)}</p>
                <p className="text-sm text-muted-foreground">{t('maintenanceCost.kpi.vehiclesServiced')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Cost Over Time */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {t('maintenanceCost.charts.costOverTime')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {costOverTime.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={costOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatNumber(v)} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value: number) => [formatCurrency(value), t('maintenanceCost.labels.cost')]}
                    />
                    <Line
                      type="monotone"
                      dataKey="cost"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                {t('maintenanceCost.empty.noData')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost by Type (Pie) */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              {t('maintenanceCost.charts.costByType')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {costByType.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {costByType.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                {t('maintenanceCost.empty.noData')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost by Vehicle (Bar) */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Car className="w-5 h-5" />
            {t('maintenanceCost.charts.topVehicles')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {costByVehicle.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costByVehicle} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => formatNumber(v)} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                    formatter={(value: number) => [formatCurrency(value), t('maintenanceCost.labels.cost')]}
                  />
                  <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              {t('maintenanceCost.empty.noData')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t('maintenanceCost.table.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t('maintenanceCost.table.empty')}
            </div>
          ) : (
            <Table className={cn(isRtl && 'text-right')}>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(isRtl && 'text-right')}>{t('maintenanceCost.table.date')}</TableHead>
                  <TableHead className={cn(isRtl && 'text-right')}>{t('maintenanceCost.table.vehicle')}</TableHead>
                  <TableHead className={cn(isRtl && 'text-right')}>{t('maintenanceCost.table.type')}</TableHead>
                  <TableHead className={cn(isRtl ? 'text-left' : 'text-right')}>{t('maintenanceCost.table.cost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.slice(0, 20).map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {record.completed_date && formatDate(record.completed_date)}
                    </TableCell>
                    <TableCell className={cn("font-medium", isRtl && "ltr")}> 
                      {record.vehicle?.vehicle_code}
                    </TableCell>
                    <TableCell>
                      {record.maintenance_type?.name || record.custom_type_name}
                    </TableCell>
                    <TableCell className={cn(isRtl ? 'text-left' : 'text-right', 'font-medium')}>
                      {formatCurrency(record.cost || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
