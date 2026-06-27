import { describe, expect, it } from 'vitest';
import { routePermissions } from '@/App';

describe('route permission groups', () => {
  it('protects admin health with system permissions', () => {
    expect(routePermissions.health).toContain('system.health.view');
  });

  it('keeps driver trip wizard reachable by trip creators', () => {
    expect(routePermissions.trips).toContain('trips.create');
    expect(routePermissions.trips).toContain('trips.read_own');
  });

  it('protects export center with report export aliases', () => {
    expect(routePermissions.reportsExport).toContain('reports.export');
    expect(routePermissions.reportsExport).toContain('reports.export_csv');
  });
});
