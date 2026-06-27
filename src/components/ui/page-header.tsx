import type { ReactNode, ElementType } from 'react';
import { cn } from '@/lib/utils';
import i18n from '@/i18n';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Backward-compatible alias used by a few pages. */
  subtitle?: string;
  /** Optional icon displayed before the title. */
  icon?: ElementType;
  /** Backward-compatible action slot used by a few pages. */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, subtitle, icon: Icon, actions, children, className }: PageHeaderProps) {
  const isRtl = (i18n.language || '').startsWith('ar');
  const helperText = description ?? subtitle;
  const actionSlot = children ?? actions;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6',
        isRtl ? 'sm:flex-row-reverse' : '',
        className
      )}
    >
      <div className={cn(isRtl ? 'text-right' : 'text-left')}>
        <div className={cn('flex items-center gap-2', isRtl ? 'flex-row-reverse justify-end' : '')}>
          {Icon && <Icon className="h-6 w-6 text-primary" aria-hidden="true" />}
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        </div>
        {helperText && (
          <p className="text-muted-foreground mt-1">{helperText}</p>
        )}
      </div>
      {actionSlot && (
        <div
          className={cn(
            'flex items-center gap-3 w-full sm:w-auto print:hidden',
            isRtl ? 'justify-start sm:justify-end' : 'justify-start'
          )}
        >
          {actionSlot}
        </div>
      )}
    </div>
  );
}
