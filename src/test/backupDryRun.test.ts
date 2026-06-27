import { describe, expect, it } from 'vitest';
import { validateFleetBackupDryRun } from '@/lib/backupDryRun';

const emptyBackup = {
  meta: { version: 'fleet_backup_v2', exported_at: '2026-06-27T00:00:00Z' },
  departments: [],
  vehicle_types: [],
  destinations: [],
  vehicles: [],
  trips: [],
  maintenance: [],
  notifications: [],
  audit_events: [],
  app_settings: [],
};

describe('validateFleetBackupDryRun', () => {
  it('accepts a valid Fleet backup structure', () => {
    const result = validateFleetBackupDryRun(emptyBackup);
    expect(result.ok).toBe(true);
    expect(result.version).toBe('fleet_backup_v2');
    expect(result.tables).toHaveLength(9);
  });

  it('rejects missing required tables', () => {
    const broken = { ...emptyBackup } as Record<string, unknown>;
    delete broken.vehicles;
    const result = validateFleetBackupDryRun(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('vehicles');
  });

  it('rejects unsupported versions', () => {
    const result = validateFleetBackupDryRun({ ...emptyBackup, meta: { version: 'old' } });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Unsupported backup version');
  });
});
