import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

type TripStatus = 'Draft' | 'PendingApproval' | 'Approved' | 'Active' | 'Rejected' | 'Closed' | 'Reviewed' | 'Cancelled' | 'Reopened';

interface StatusBadgeProps {
  status: TripStatus | string;
  className?: string;
}

const statusConfig: Record<string, { fallbackLabel: string; className: string }> = {
  Draft: { fallbackLabel: 'Draft', className: 'status-badge-draft' },
  PendingApproval: { fallbackLabel: 'Pending Approval', className: 'status-badge-pending' },
  Approved: { fallbackLabel: 'Approved', className: 'status-badge-approved' },
  Active: { fallbackLabel: 'Active', className: 'status-badge-active' },
  Rejected: { fallbackLabel: 'Rejected', className: 'status-badge-rejected' },
  Closed: { fallbackLabel: 'Closed', className: 'status-badge-closed' },
  Reviewed: { fallbackLabel: 'Reviewed', className: 'bg-purple-100 text-purple-800' },
  Cancelled: { fallbackLabel: 'Cancelled', className: 'bg-gray-100 text-gray-800' },
  Reopened: { fallbackLabel: 'Reopened', className: 'bg-orange-100 text-orange-800' },
  // Vehicle statuses
  Maintenance: { fallbackLabel: 'Maintenance', className: 'status-badge-pending' },
  OutOfService: { fallbackLabel: 'Out of Service', className: 'status-badge-rejected' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  const config = statusConfig[status] || { fallbackLabel: String(status), className: 'status-badge-draft' };
  const label = t(`status.${String(status)}`, { defaultValue: config.fallbackLabel });
  
  return (
    <span className={cn('status-badge', config.className, className)}>
      {label}
    </span>
  );
}