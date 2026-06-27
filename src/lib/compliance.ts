export type ComplianceStatus = 'ok' | 'expiring' | 'expired' | 'missing';

export type ComplianceReason =
  | 'insurance_missing'
  | 'insurance_expired'
  | 'insurance_expiring'
  | 'registration_missing'
  | 'registration_expired'
  | 'registration_expiring';

export interface ComplianceResult {
  status: ComplianceStatus;
  reasons: ComplianceReason[];
  // Small helper values for UI
  insuranceDaysLeft: number | null;
  registrationDaysLeft: number | null;
}

function parseYmd(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(d: Date): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Compute a simple compliance status for a vehicle based on insurance/registration end dates.
 * - expired: any end date is in the past
 * - expiring: any end date within `warnWindowDays`
 * - missing: either end date is missing
 * - ok: both present and outside warning window
 */
export function computeVehicleCompliance(
  vehicle: {
    insurance_end_date?: string | null;
    registration_end_date?: string | null;
  },
  warnWindowDays: number = 30
): ComplianceResult {
  const reasons: ComplianceReason[] = [];

  const insEnd = parseYmd(vehicle.insurance_end_date);
  const regEnd = parseYmd(vehicle.registration_end_date);

  const insDays = insEnd ? daysUntil(insEnd) : null;
  const regDays = regEnd ? daysUntil(regEnd) : null;

  // Missing
  if (!insEnd) reasons.push('insurance_missing');
  if (!regEnd) reasons.push('registration_missing');

  // Expired
  if (insDays !== null && insDays < 0) reasons.push('insurance_expired');
  if (regDays !== null && regDays < 0) reasons.push('registration_expired');

  // Expiring soon
  if (insDays !== null && insDays >= 0 && insDays <= warnWindowDays) reasons.push('insurance_expiring');
  if (regDays !== null && regDays >= 0 && regDays <= warnWindowDays) reasons.push('registration_expiring');

  let status: ComplianceStatus = 'ok';
  if (reasons.includes('insurance_expired') || reasons.includes('registration_expired')) {
    status = 'expired';
  } else if (reasons.includes('insurance_expiring') || reasons.includes('registration_expiring')) {
    status = 'expiring';
  } else if (reasons.includes('insurance_missing') || reasons.includes('registration_missing')) {
    status = 'missing';
  }

  return {
    status,
    reasons,
    insuranceDaysLeft: insDays,
    registrationDaysLeft: regDays,
  };
}
