import { cn } from '@/lib/utils';
import i18n from '@/i18n';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  const isRtl = (i18n.language || '').startsWith('ar');
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6",
        isRtl ? 'sm:flex-row-reverse' : '',
        className
      )}
    >
      <div className={cn(isRtl ? 'text-right' : 'text-left')}>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children && (
        <div
          className={cn(
            'flex items-center gap-3 w-full sm:w-auto print:hidden',
            isRtl ? 'justify-start sm:justify-end' : 'justify-start'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}