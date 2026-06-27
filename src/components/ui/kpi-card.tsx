import { cn } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label?: string;
    direction?: 'up' | 'down' | 'neutral';
  };
  accentColor?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
  children?: React.ReactNode;
}

const accentColorMap = {
  primary: 'border-l-primary',
  success: 'border-l-status-success',
  warning: 'border-l-status-warning',
  error: 'border-l-status-error',
  info: 'border-l-status-info',
};

const iconBgMap = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-100 text-emerald-600',
  warning: 'bg-amber-100 text-amber-600',
  error: 'bg-rose-100 text-rose-600',
  info: 'bg-blue-100 text-blue-600',
};

const trendColorMap = {
  up: 'text-status-success bg-emerald-50',
  down: 'text-status-error bg-rose-50',
  neutral: 'text-muted-foreground bg-muted',
};

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accentColor = 'primary',
  className,
  children,
}: KPICardProps) {
  const TrendIcon = trend?.direction === 'up' 
    ? TrendingUp 
    : trend?.direction === 'down' 
      ? TrendingDown 
      : Minus;

  return (
    <div className={cn('kpi-card', accentColorMap[accentColor], className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold mt-2 text-foreground">{value}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-2 mt-3">
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                trendColorMap[trend.direction || 'neutral']
              )}>
                <TrendIcon className="w-3 h-3" />
                {trend.value > 0 ? '+' : ''}{trend.value}%
              </span>
              {trend.label && (
                <span className="text-xs text-muted-foreground">{trend.label}</span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
            iconBgMap[accentColor]
          )}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
