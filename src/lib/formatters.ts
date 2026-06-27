import { isRtl, locale } from './i18n-helpers';

export type NumberFormatOpts = Intl.NumberFormatOptions & {
  /** Force Latin digits (123) even when Arabic UI is enabled. */
  forceLatin?: boolean;
  /** Use Arabic-Indic digits (١٢٣) when Arabic UI is enabled. Default: true. */
  arabicDigits?: boolean;
};

function numberLocale(opts: NumberFormatOpts = {}): string {
  if (opts.forceLatin) return 'en-US';
  if (isRtl()) {
    // Default: Arabic UI uses Arabic-Indic digits for display.
    if (opts.arabicDigits !== false) return 'ar-SA-u-nu-arab';
    return 'ar-SA';
  }
  return locale();
}

/**
 * Formats a number for display.
 * - Arabic UI: defaults to Arabic-Indic digits (١٢٣) for read-only display.
 * - Use opts.forceLatin for identifiers/URLs/keys where Latin digits are required.
 */
export function formatNumber(value: number | string | null | undefined, opts?: NumberFormatOpts): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const { forceLatin, arabicDigits, ...nfOpts } = opts || {};
  return new Intl.NumberFormat(numberLocale({ forceLatin, arabicDigits }), nfOpts).format(n);
}

export function formatCurrency(value: number | string | null | undefined, currency: string = 'SAR', opts?: NumberFormatOpts): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const { forceLatin, arabicDigits, ...nfOpts } = opts || {};
  return new Intl.NumberFormat(numberLocale({ forceLatin, arabicDigits }), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    ...(nfOpts || {}),
  }).format(n);
}

/** For IDs/plates/codes: keep as-is (use with className="ltr" in RTL UIs). */
export function formatIdentifier(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale(), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...(opts || {}),
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale(), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(opts || {}),
  }).format(d);
}
