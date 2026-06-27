import i18n from '@/i18n';

export function isRtl(): boolean {
  return (i18n.language || '').toLowerCase().startsWith('ar');
}

export function locale(): string {
  return isRtl() ? 'ar-SA' : 'en-US';
}
