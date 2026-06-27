import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Trophy, Medal, Award, Route, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DriverStats {
  id: string;
  name: string;
  tripsCompleted: number;
  totalDistance: number;
}

interface DriverLeaderboardProps {
  drivers: DriverStats[];
  loading?: boolean;
}

const rankIcons = [
  { icon: Trophy, color: 'text-amber-500' },
  { icon: Medal, color: 'text-gray-400' },
  { icon: Award, color: 'text-amber-700' },
];

export function DriverLeaderboard({ drivers, loading }: DriverLeaderboardProps) {
  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Top Drivers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-8 h-8 bg-muted rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (drivers.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Top Drivers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No driver data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          Top Drivers
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {drivers.map((driver, index) => {
            const RankIcon = rankIcons[index]?.icon;
            const rankColor = rankIcons[index]?.color;
            const initials = driver.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <div
                key={driver.id}
                className={cn(
                  'flex items-center gap-4 p-3 rounded-xl transition-colors',
                  index === 0 && 'bg-amber-50 dark:bg-amber-950/20',
                  index === 1 && 'bg-gray-50 dark:bg-gray-800/20',
                  index === 2 && 'bg-orange-50 dark:bg-orange-950/20'
                )}
              >
                <div className="flex items-center justify-center w-8">
                  {RankIcon ? (
                    <RankIcon className={cn('w-5 h-5', rankColor)} />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">
                      #{index + 1}
                    </span>
                  )}
                </div>
                
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{driver.name}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Route className="w-3 h-3" />
                      {driver.tripsCompleted} trips
                    </span>
                    <span className="flex items-center gap-1">
                      <Gauge className="w-3 h-3" />
                      {driver.totalDistance.toLocaleString()} km
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
