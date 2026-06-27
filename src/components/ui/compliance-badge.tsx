import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ComplianceResult } from '@/lib/compliance';

export function ComplianceBadge({ result, className }: { result: ComplianceResult; className?: string }) {
  const { t } = useTranslation();

  const labelKey =
    result.status === 'ok'
      ? 'vehicles.compliance.ok'
      : result.status === 'expired'
        ? 'vehicles.compliance.expired'
        : result.status === 'expiring'
          ? 'vehicles.compliance.expiring'
          : 'vehicles.compliance.missing';

  const base = 'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium border';

  const cls =
    result.status === 'ok'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : result.status === 'expired'
        ? 'bg-red-50 text-red-700 border-red-200'
        : result.status === 'expiring'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-slate-50 text-slate-700 border-slate-200';

  // Simple tooltip text (kept short)
  const tooltip = result.reasons
    .map((r) => t(`vehicles.compliance.reason.${r}`))
    .filter(Boolean)
    .join(' • ');

  return (
    <span className={cn(base, cls, className)} title={tooltip || undefined}>
      {t(labelKey)}
    </span>
  );
}
