import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';

describe('bilingual coverage', () => {
  it('has Arabic values for every English translation key', () => {
    const en = i18n.getResourceBundle('en', 'translation') as Record<string, string>;
    const ar = i18n.getResourceBundle('ar', 'translation') as Record<string, string>;
    const missing = Object.keys(en).filter((key) => !(key in ar) || !String(ar[key] ?? '').trim());
    expect(missing).toEqual([]);
  });

  it('localizes the main soft-production pages added in recent updates', () => {
    const ar = i18n.getResourceBundle('ar', 'translation') as Record<string, string>;
    const required = [
      'driverWizard.title',
      'vehicleDocs.title',
      'maintenance.calendar.title',
      'reports.exportCenter.title',
      'adminActivity.title',
      'health.title',
      'dashboard.quickActions',
      'vehicles.backToVehicles',
      'users.addUser',
      'backup.dryRunTitle',
    ];

    for (const key of required) {
      expect(String(ar[key] ?? '')).toMatch(/[\u0600-\u06FF]/);
    }
  });
});
