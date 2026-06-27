import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fuel, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface FuelEfficiencyCardProps {
  totalTripsWithFuelData: number;
  avgFuelConsumption: number; // Percentage of tank used per 100km
  efficiencyTrend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  loading?: boolean;
}

// Map fuel level strings to numeric values (0-1 scale representing tank fullness)
export function fuelLevelToNumeric(level: string | null): number | null {
  if (!level) return null;
  const mapping: Record<string, number> = {
    'Full': 1.0,
    '3/4': 0.75,
    '1/2': 0.5,
    '1/4': 0.25,
    'Empty': 0,
  };
  return mapping[level] ?? null;
}

export function FuelEfficiencyCard({
  totalTripsWithFuelData,
  avgFuelConsumption,
  efficiencyTrend,
  loading,
}: FuelEfficiencyCardProps) {
  const { t } = useTranslation();
  const TrendIcon = efficiencyTrend?.direction === 'up'
    ? TrendingUp
    : efficiencyTrend?.direction === 'down'
      ? TrendingDown
      : Minus;

  // For fuel consumption, lower is better, so "down" is good
  const trendIsPositive = efficiencyTrend?.direction === 'down';

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Fuel className="w-5 h-5 text-primary" />
            Fuel Efficiency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-24" />
            <div className="h-4 bg-muted rounded w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Fuel className="w-5 h-5 text-primary" />
          Fuel Efficiency
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalTripsWithFuelData > 0 ? (
          <div className="space-y-4">
            <div>
              <p className="text-3xl font-bold text-foreground">
                {avgFuelConsumption.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.avgTankPer100')}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {efficiencyTrend && efficiencyTrend.value !== 0 && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    trendIsPositive
                      ? 'text-status-success bg-emerald-50'
                      : 'text-status-error bg-rose-50'
                  )}
                >
                  <TrendIcon className="w-3 h-3" />
                  {Math.abs(efficiencyTrend.value).toFixed(1)}%
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {t('dashboard.basedOnTripsWithFuel', { count: totalTripsWithFuelData })}
              </span>
            </div>

            {/* Fuel gauge visualization */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{t('dashboard.efficiency')}</span>
                <span>{avgFuelConsumption < 15 ? t('dashboard.excellent') : avgFuelConsumption < 25 ? t('dashboard.good') : t('dashboard.needsAttention')}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    avgFuelConsumption < 15
                      ? 'bg-status-success'
                      : avgFuelConsumption < 25
                        ? 'bg-status-warning'
                        : 'bg-status-error'
                  )}
                  style={{ width: `${Math.min(100, (avgFuelConsumption / 40) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">{t('dashboard.noFuelData')}</p>
            <p className="text-xs mt-1">{t('dashboard.completeFuelTrips')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
