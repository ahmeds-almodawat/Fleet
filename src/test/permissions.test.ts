import { describe, expect, it } from 'vitest';
import { hasAnyPermissionInSet, permissionSetHas } from '@/lib/permissionAliases';

describe('permission aliases', () => {
  it('allows legacy reports.view checks when the user has reports.read', () => {
    expect(permissionSetHas(new Set(['reports.read']), 'reports.view')).toBe(true);
  });

  it('allows maintenance.manage when the user has maintenance.edit', () => {
    expect(permissionSetHas(new Set(['maintenance.edit']), 'maintenance.manage')).toBe(true);
  });

  it('allows read_all route checks for fleet readers', () => {
    expect(hasAnyPermissionInSet(new Set(['vehicles.read']), ['vehicles.read_all', 'vehicles.read_department'])).toBe(true);
  });

  it('does not grant unrelated admin permissions', () => {
    expect(permissionSetHas(new Set(['trips.create']), 'settings.manage')).toBe(false);
  });
});
