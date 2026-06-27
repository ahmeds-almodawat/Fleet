import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { useTranslation } from 'react-i18next';
import { Route, ArrowRight } from 'lucide-react';

interface RecentTrip {
  id: string;
  trip_no: string;
  status: string;
  destination_text: string;
  requested_at: string;
  vehicle: { vehicle_code: string } | null;
}

interface RecentTripsCardProps {
  trips: RecentTrip[];
  loading: boolean;
}

export function RecentTripsCard({ trips, loading }: RecentTripsCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">{t('dashboard.recentTrips')}</CardTitle>
        <Link to="/trips">
          <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
            {t('dashboard.viewAll')} <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : trips.length > 0 ? (
          <div className="space-y-2">
            {trips.map((trip) => (
              <Link 
                key={trip.id} 
                to={`/trips/${trip.id}`}
                className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Route className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground">{trip.trip_no}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">{trip.destination_text}</p>
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={trip.status} />
                  <p className="text-xs text-muted-foreground mt-1">
                    {trip.vehicle?.vehicle_code}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Route className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t('dashboard.noTripsYet')}</p>
            <p className="text-sm">{t('dashboard.startFirstTrip')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
