import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ClipboardCheck, Car, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface QuickAction {
  title: string;
  description: string;
  icon: typeof Plus;
  href: string;
  color: string;
  iconColor: string;
}

interface QuickActionsCardProps {
  canCreateTrip: boolean;
  canViewApprovals: boolean;
  canViewVehicles: boolean;
  pendingApprovals: number;
}

export function QuickActionsCard({ 
  canCreateTrip, 
  canViewApprovals, 
  canViewVehicles, 
  pendingApprovals 
}: QuickActionsCardProps) {
  const { t } = useTranslation();
  const actions: (QuickAction | null)[] = [
    canCreateTrip ? {
      title: t('trips.newTrip'),
      description: t('dashboard.startNewTrip'),
      icon: Plus,
      href: '/trips/new',
      color: 'bg-gradient-to-br from-primary to-accent',
      iconColor: 'text-white',
    } : null,
    canViewApprovals && pendingApprovals > 0 ? {
      title: t('nav.approvals'),
      description: t('dashboard.pendingCount', { count: pendingApprovals }),
      icon: ClipboardCheck,
      href: '/approvals',
      color: 'bg-gradient-to-br from-amber-500 to-orange-500',
      iconColor: 'text-white',
    } : null,
    canViewVehicles ? {
      title: t('nav.vehicles'),
      description: t('dashboard.manageFleet'),
      icon: Car,
      href: '/vehicles',
      color: 'bg-gradient-to-br from-blue-500 to-cyan-500',
      iconColor: 'text-white',
    } : null,
    {
      title: t('nav.reports'),
      description: t('dashboard.viewAnalytics'),
      icon: FileText,
      href: '/reports',
      color: 'bg-gradient-to-br from-emerald-500 to-teal-500',
      iconColor: 'text-white',
    },
  ].filter(Boolean);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{t('dashboard.quickActions')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => action && (
            <Link key={action.title} to={action.href}>
              <div className="group p-4 rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-200 bg-card">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', action.color)}>
                  <action.icon className={cn('w-5 h-5', action.iconColor)} />
                </div>
                <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{action.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
