import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { KPICard } from '@/components/ui/kpi-card';
import { ProgressCircle } from '@/components/ui/progress-circle';
import { RecentTripsCard } from '@/components/dashboard/RecentTripsCard';
import { QuickActionsCard } from '@/components/dashboard/QuickActionsCard';
import { FleetStatusChart } from '@/components/dashboard/FleetStatusChart';
import { TripsTrendChart } from '@/components/dashboard/TripsTrendChart';
import { DriverLeaderboard } from '@/components/dashboard/DriverLeaderboard';
import { FuelEfficiencyCard, fuelLevelToNumeric } from '@/components/dashboard/FuelEfficiencyCard';
import { 
  Car, 
  Route, 
  ClipboardCheck, 
  AlertTriangle,
  Gauge,
  CheckCircle2
} from 'lucide-react';
import { startOfWeek, format, addDays, subMonths } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/lib/formatters';

interface DashboardStats {
  totalVehicles: number;
  activeVehicles: number;
  activeTrips: number;
  pendingApprovals: number;
  anomalies: number;
  closedTripsToday: number;
  totalDistanceMonth: number;
  tripsThisMonth: number;
  fleetUtilization: number;
  lastMonthDistance: number;
  lastMonthTrips: number;
  serviceDueSoon: number;
  insuranceExpiringSoon: number;
  registrationExpiringSoon: number;
}

interface RecentTrip {
  id: string;
  trip_no: string;
  status: string;
  destination_text: string;
  requested_at: string;
  vehicle: { vehicle_code: string } | null;
}

interface WeeklyTripData {
  date: string;
  trips: number;
  distance: number;
}

interface FleetStatusData {
  name: string;
  value: number;
  color: string;
}

interface DriverStats {
  id: string;
  name: string;
  tripsCompleted: number;
  totalDistance: number;
}

interface FuelStats {
  totalTripsWithFuelData: number;
  avgFuelConsumption: number;
  lastMonthAvg: number;
}

export default function DashboardPage() {
  const { profile, hasPermission, hasAnyPermission } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats>({
    totalVehicles: 0,
    activeVehicles: 0,
    activeTrips: 0,
    pendingApprovals: 0,
    anomalies: 0,
    closedTripsToday: 0,
    totalDistanceMonth: 0,
    tripsThisMonth: 0,
    fleetUtilization: 0,
    lastMonthDistance: 0,
    lastMonthTrips: 0,
    serviceDueSoon: 0,
    insuranceExpiringSoon: 0,
    registrationExpiringSoon: 0,
  });
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyTripData[]>([]);
  const [fleetStatus, setFleetStatus] = useState<FleetStatusData[]>([]);
  const [topDrivers, setTopDrivers] = useState<DriverStats[]>([]);
  const [fuelStats, setFuelStats] = useState<FuelStats>({
    totalTripsWithFuelData: 0,
    avgFuelConsumption: 0,
    lastMonthAvg: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!profile) return;

      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfLastMonth = subMonths(startOfMonth, 1);
      const endOfLastMonth = new Date(startOfMonth.getTime() - 1);
      const weekStart = startOfWeek(today, { weekStartsOn: 0 });

      // Fetch all stats in parallel
      const [
        vehiclesRes,
        activeVehiclesRes,
        fleetKpisRes,
        activeTripsRes,
        pendingRes,
        anomaliesRes,
        closedTodayRes,
        monthTripsRes,
        lastMonthTripsRes,
        vehicleStatusRes,
        driverStatsRes,
        fuelDataRes,
        lastMonthFuelRes,
      ] = await Promise.all([
        hasPermission('vehicles.read')
          ? supabase.from('vehicles').select('id', { count: 'exact', head: true })
          : Promise.resolve({ count: 0 }),
        hasPermission('vehicles.read')
          ? supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('status', 'Active')
          : Promise.resolve({ count: 0 }),
        hasPermission('vehicles.read')
          ? supabase.rpc('get_fleet_kpis')
          : Promise.resolve({ data: { service_due_soon: 0, insurance_expiring_soon: 0, registration_expiring_soon: 0 } }),
        supabase.from('trips').select('id', { count: 'exact', head: true })
          .in('status', ['Active', 'Approved']),
        hasAnyPermission(['trips.approve', 'trips.reject'])
          ? supabase.from('trips').select('id', { count: 'exact', head: true }).eq('status', 'PendingApproval')
          : Promise.resolve({ count: 0 }),
        hasPermission('trips.read_all')
          ? supabase.from('trips').select('id', { count: 'exact', head: true }).eq('anomaly_flag', true)
          : Promise.resolve({ count: 0 }),
        supabase.from('trips').select('id', { count: 'exact', head: true })
          .eq('status', 'Closed')
          .gte('closed_at', today.toISOString().split('T')[0]),
        supabase.from('trips').select('id, distance_km', { count: 'exact' })
          .gte('requested_at', startOfMonth.toISOString()),
        supabase.from('trips').select('id, distance_km', { count: 'exact' })
          .gte('requested_at', startOfLastMonth.toISOString())
          .lt('requested_at', startOfMonth.toISOString()),
        hasPermission('vehicles.read')
          ? supabase.from('vehicles').select('status')
          : Promise.resolve({ data: [] }),
        // Top drivers query
        hasPermission('trips.read_all')
          ? supabase.from('trips')
              .select('driver_user_id, distance_km, driver:profiles!trips_driver_user_id_fkey(id, name_en)')
              .eq('status', 'Closed')
              .gte('closed_at', startOfMonth.toISOString())
          : Promise.resolve({ data: [] }),
        // Fuel data for this month
        supabase.from('trips')
          .select('start_fuel_level, end_fuel_level, distance_km')
          .eq('status', 'Closed')
          .not('start_fuel_level', 'is', null)
          .not('end_fuel_level', 'is', null)
          .not('distance_km', 'is', null)
          .gte('closed_at', startOfMonth.toISOString()),
        // Fuel data for last month
        supabase.from('trips')
          .select('start_fuel_level, end_fuel_level, distance_km')
          .eq('status', 'Closed')
          .not('start_fuel_level', 'is', null)
          .not('end_fuel_level', 'is', null)
          .not('distance_km', 'is', null)
          .gte('closed_at', startOfLastMonth.toISOString())
          .lt('closed_at', startOfMonth.toISOString()),
      ]);

      // Calculate total distance this month
      const monthTripsData = monthTripsRes.data || [];
      const totalDistanceMonth = monthTripsData.reduce((sum: number, t: { distance_km: number | null }) => 
        sum + (t.distance_km || 0), 0);

      // Calculate last month distance
      const lastMonthTripsData = lastMonthTripsRes.data || [];
      const lastMonthDistance = lastMonthTripsData.reduce((sum: number, t: { distance_km: number | null }) => 
        sum + (t.distance_km || 0), 0);

      // Calculate fleet utilization
      const totalVehicles = vehiclesRes.count || 0;
      const activeVehicles = activeVehiclesRes.count || 0;
      const fleetUtilization = totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0;

      // Process fleet status for pie chart
      const statusData = vehicleStatusRes.data || [];
      const statusCounts: Record<string, number> = {};
      statusData.forEach((v: { status: string }) => {
        statusCounts[v.status] = (statusCounts[v.status] || 0) + 1;
      });

      const fleetStatusData: FleetStatusData[] = [
        { name: 'Active', value: statusCounts['Active'] || 0, color: 'hsl(173, 80%, 40%)' },
        { name: 'Maintenance', value: statusCounts['Maintenance'] || 0, color: 'hsl(38, 92%, 50%)' },
        { name: 'Out of Service', value: statusCounts['OutOfService'] || 0, color: 'hsl(0, 84%, 60%)' },
      ].filter(item => item.value > 0);

      setFleetStatus(fleetStatusData);

      // Process driver stats for leaderboard
      const driverData = driverStatsRes.data || [];
      const driverMap = new Map<string, { name: string; trips: number; distance: number }>();
      
      driverData.forEach((trip: { driver_user_id: string; distance_km: number | null; driver: { id: string; name_en: string } | null }) => {
        if (trip.driver) {
          const existing = driverMap.get(trip.driver_user_id) || { name: trip.driver.name_en, trips: 0, distance: 0 };
          existing.trips += 1;
          existing.distance += trip.distance_km || 0;
          driverMap.set(trip.driver_user_id, existing);
        }
      });

      const sortedDrivers: DriverStats[] = Array.from(driverMap.entries())
        .map(([id, data]) => ({
          id,
          name: data.name,
          tripsCompleted: data.trips,
          totalDistance: Math.round(data.distance),
        }))
        .sort((a, b) => b.tripsCompleted - a.tripsCompleted || b.totalDistance - a.totalDistance)
        .slice(0, 5);

      setTopDrivers(sortedDrivers);

      // Calculate fuel efficiency
      const fuelData = fuelDataRes.data || [];
      let totalFuelConsumption = 0;
      let validFuelTrips = 0;

      fuelData.forEach((trip: { start_fuel_level: string | null; end_fuel_level: string | null; distance_km: number | null }) => {
        const startLevel = fuelLevelToNumeric(trip.start_fuel_level);
        const endLevel = fuelLevelToNumeric(trip.end_fuel_level);
        const distance = trip.distance_km;

        if (startLevel !== null && endLevel !== null && distance && distance > 0) {
          const consumed = startLevel - endLevel;
          if (consumed >= 0) {
            // Calculate percentage of tank used per 100km
            const consumptionPer100km = (consumed * 100) / distance * 100;
            totalFuelConsumption += consumptionPer100km;
            validFuelTrips++;
          }
        }
      });

      // Calculate last month's fuel efficiency for comparison
      const lastMonthFuelData = lastMonthFuelRes.data || [];
      let lastMonthTotalConsumption = 0;
      let lastMonthValidTrips = 0;

      lastMonthFuelData.forEach((trip: { start_fuel_level: string | null; end_fuel_level: string | null; distance_km: number | null }) => {
        const startLevel = fuelLevelToNumeric(trip.start_fuel_level);
        const endLevel = fuelLevelToNumeric(trip.end_fuel_level);
        const distance = trip.distance_km;

        if (startLevel !== null && endLevel !== null && distance && distance > 0) {
          const consumed = startLevel - endLevel;
          if (consumed >= 0) {
            const consumptionPer100km = (consumed * 100) / distance * 100;
            lastMonthTotalConsumption += consumptionPer100km;
            lastMonthValidTrips++;
          }
        }
      });

      const avgFuelConsumption = validFuelTrips > 0 ? totalFuelConsumption / validFuelTrips : 0;
      const lastMonthAvg = lastMonthValidTrips > 0 ? lastMonthTotalConsumption / lastMonthValidTrips : 0;

      setFuelStats({
        totalTripsWithFuelData: validFuelTrips,
        avgFuelConsumption,
        lastMonthAvg,
      });

      setStats({
        totalVehicles,
        activeVehicles,
        activeTrips: activeTripsRes.count || 0,
        pendingApprovals: pendingRes.count || 0,
        anomalies: anomaliesRes.count || 0,
        closedTripsToday: closedTodayRes.count || 0,
        totalDistanceMonth: Math.round(totalDistanceMonth),
        tripsThisMonth: monthTripsRes.count || 0,
        fleetUtilization,
        lastMonthDistance: Math.round(lastMonthDistance),
        lastMonthTrips: lastMonthTripsRes.count || 0,
        serviceDueSoon: (fleetKpisRes as any)?.data?.service_due_soon ?? 0,
        insuranceExpiringSoon: (fleetKpisRes as any)?.data?.insurance_expiring_soon ?? 0,
        registrationExpiringSoon: (fleetKpisRes as any)?.data?.registration_expiring_soon ?? 0,
      });

      // Fetch weekly trip data
      const weeklyTripsData: WeeklyTripData[] = [];
      for (let i = 0; i < 7; i++) {
        const day = addDays(weekStart, i);
        const dayStr = format(day, 'yyyy-MM-dd');
        const { count } = await supabase
          .from('trips')
          .select('id', { count: 'exact', head: true })
          .gte('requested_at', dayStr)
          .lt('requested_at', format(addDays(day, 1), 'yyyy-MM-dd'));
        
        weeklyTripsData.push({
          date: format(day, 'EEE'),
          trips: count || 0,
          distance: 0,
        });
      }
      setWeeklyData(weeklyTripsData);

      // Fetch recent trips
      const tripsQuery = supabase
        .from('trips')
        .select('id, trip_no, status, destination_text, requested_at, vehicle:vehicles(vehicle_code)')
        .order('requested_at', { ascending: false })
        .limit(5);

      if (!hasPermission('trips.read_all')) {
        tripsQuery.eq('driver_user_id', profile.id);
      }

      const { data: trips } = await tripsQuery;
      if (trips) {
        setRecentTrips(trips as unknown as RecentTrip[]);
      }

      setLoading(false);
    };

    fetchDashboardData();
  }, [profile, hasPermission, hasAnyPermission]);

  const canCreateTrip = hasPermission('trips.create');
  const canViewApprovals = hasAnyPermission(['trips.approve', 'trips.reject']);
  const canViewVehicles = hasPermission('vehicles.read');

  // Calculate real trends
  const distanceTrend = stats.lastMonthDistance > 0
    ? Math.round(((stats.totalDistanceMonth - stats.lastMonthDistance) / stats.lastMonthDistance) * 100)
    : 0;
  
  const tripsTrend = stats.lastMonthTrips > 0
    ? Math.round(((stats.tripsThisMonth - stats.lastMonthTrips) / stats.lastMonthTrips) * 100)
    : 0;

  const fuelTrend = fuelStats.lastMonthAvg > 0 && fuelStats.avgFuelConsumption > 0
    ? ((fuelStats.avgFuelConsumption - fuelStats.lastMonthAvg) / fuelStats.lastMonthAvg) * 100
    : 0;

  return (
    <MainLayout>
      <PageHeader 
        title={t('dashboard.welcomeBack', { name: profile?.name_en || t('common.user') })}
        description={t('dashboard.overviewToday')}
      />

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {canViewVehicles && (
          <KPICard
            title={t('dashboard.fleetUtilization')}
            value={`${stats.fleetUtilization}%`}
            subtitle={t('dashboard.activeOfTotal', { active: stats.activeVehicles, total: stats.totalVehicles })}
            icon={Car}
            accentColor="info"
          >
            <ProgressCircle 
              value={stats.fleetUtilization} 
              size="sm" 
              color="info"
              showValue={false}
            />
          </KPICard>
        )}
        
        <KPICard
          title={t('dashboard.activeTrips')}
          value={stats.activeTrips}
          subtitle={t('dashboard.currentlyOnRoad')}
          icon={Route}
          accentColor="success"
        />
        
        {canViewApprovals && (
          <KPICard
            title={t('dashboard.pendingApprovals')}
            value={stats.pendingApprovals}
            subtitle={t('dashboard.awaitingReview')}
            icon={ClipboardCheck}
            accentColor={stats.pendingApprovals > 5 ? 'warning' : 'primary'}
          />
        )}
        
        {hasPermission('trips.read_all') && (
          <KPICard
            title={t('dashboard.anomalies')}
            value={stats.anomalies}
            subtitle={t('dashboard.flaggedTrips')}
            icon={AlertTriangle}
            accentColor={stats.anomalies > 0 ? 'error' : 'success'}
          />
        )}
      </div>

      {/* Secondary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title={t('dashboard.distanceThisMonth')}
          value={`${formatNumber(stats.totalDistanceMonth)} ${t('trips.km')}`}
          subtitle={t('dashboard.tripsCompleted', { count: stats.tripsThisMonth })}
          icon={Gauge}
          trend={stats.lastMonthDistance > 0 ? {
            value: distanceTrend,
            label: t('dashboard.vsLastMonth'),
            direction: distanceTrend > 0 ? 'up' : distanceTrend < 0 ? 'down' : 'neutral',
          } : undefined}
          accentColor="primary"
        />
        
        <KPICard
          title={t('dashboard.tripsToday')}
          value={stats.closedTripsToday}
          subtitle={t('dashboard.completedToday')}
          icon={CheckCircle2}
          accentColor="success"
        />
        
        <KPICard
          title={t('dashboard.monthlyTrips')}
          value={stats.tripsThisMonth}
          subtitle={t('dashboard.thisMonth')}
          trend={stats.lastMonthTrips > 0 ? {
            value: tripsTrend,
            label: t('dashboard.vsLastMonth'),
            direction: tripsTrend > 0 ? 'up' : tripsTrend < 0 ? 'down' : 'neutral',
          } : undefined}
          accentColor="info"
        />

        <KPICard
          title={t('dashboard.lastMonthDistance')}
          value={`${formatNumber(stats.lastMonthDistance)} ${t('trips.km')}`}
          subtitle={t('dashboard.tripsCount', { count: stats.lastMonthTrips })}
          icon={Gauge}
          accentColor="primary"
        />
      </div>

      {/* Compliance KPI Cards */}
      {canViewVehicles && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <KPICard
            title={t('dashboard.serviceDueSoon')}
            value={stats.serviceDueSoon}
            subtitle={t('dashboard.vehiclesWithinServiceWindow')}
            icon={AlertTriangle}
            accentColor={stats.serviceDueSoon > 0 ? 'warning' : 'success'}
          />
          <KPICard
            title={t('dashboard.insuranceExpiring')}
            value={stats.insuranceExpiringSoon}
            subtitle={t('dashboard.within30Days')}
            icon={AlertTriangle}
            accentColor={stats.insuranceExpiringSoon > 0 ? 'warning' : 'success'}
          />
          <KPICard
            title={t('dashboard.registrationExpiring')}
            value={stats.registrationExpiringSoon}
            subtitle={t('dashboard.within30Days')}
            icon={AlertTriangle}
            accentColor={stats.registrationExpiringSoon > 0 ? 'warning' : 'success'}
          />
        </div>
      )}

      {/* Charts and Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <TripsTrendChart data={weeklyData} />
        </div>
        <FleetStatusChart data={fleetStatus} />
      </div>

      {/* Driver Leaderboard and Fuel Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <DriverLeaderboard drivers={topDrivers} loading={loading} />
        <FuelEfficiencyCard
          totalTripsWithFuelData={fuelStats.totalTripsWithFuelData}
          avgFuelConsumption={fuelStats.avgFuelConsumption}
          efficiencyTrend={fuelStats.lastMonthAvg > 0 ? {
            value: fuelTrend,
            direction: fuelTrend > 0 ? 'up' : fuelTrend < 0 ? 'down' : 'neutral',
          } : undefined}
          loading={loading}
        />
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTripsCard trips={recentTrips} loading={loading} />
        <QuickActionsCard 
          canCreateTrip={canCreateTrip}
          canViewApprovals={canViewApprovals}
          canViewVehicles={canViewVehicles}
          pendingApprovals={stats.pendingApprovals}
        />
      </div>
    </MainLayout>
  );
}
