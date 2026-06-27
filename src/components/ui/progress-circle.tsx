import { cn } from '@/lib/utils';

interface ProgressCircleProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  strokeWidth?: number;
  className?: string;
  showValue?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
}

const sizeMap = {
  sm: { radius: 20, fontSize: 'text-xs' },
  md: { radius: 30, fontSize: 'text-sm' },
  lg: { radius: 40, fontSize: 'text-lg' },
};

const colorMap = {
  primary: 'stroke-primary',
  success: 'stroke-status-success',
  warning: 'stroke-status-warning',
  error: 'stroke-status-error',
  info: 'stroke-status-info',
};

export function ProgressCircle({
  value,
  max = 100,
  size = 'md',
  strokeWidth = 6,
  className,
  showValue = true,
  color = 'primary',
}: ProgressCircleProps) {
  const { radius, fontSize } = sizeMap[size];
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn('progress-ring', className)}>
      <svg
        height={radius * 2}
        width={radius * 2}
      >
        {/* Background circle */}
        <circle
          className="stroke-muted"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        {/* Progress circle */}
        <circle
          className={cn(colorMap[color], 'transition-all duration-500 ease-out')}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      {showValue && (
        <span className={cn('absolute font-semibold text-foreground', fontSize)}>
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}
