import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeVehicleCompliance } from '@/lib/compliance';

describe('computeVehicleCompliance', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks complete documents outside warning window as ok', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));

    const result = computeVehicleCompliance({
      insurance_end_date: '2026-08-15',
      registration_end_date: '2026-09-01',
    });

    expect(result.status).toBe('ok');
    expect(result.reasons).toEqual([]);
  });

  it('prioritizes expired over expiring and missing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));

    const result = computeVehicleCompliance({
      insurance_end_date: '2026-05-31',
      registration_end_date: '2026-06-10',
    });

    expect(result.status).toBe('expired');
    expect(result.reasons).toContain('insurance_expired');
    expect(result.reasons).toContain('registration_expiring');
  });

  it('marks missing document dates as missing', () => {
    const result = computeVehicleCompliance({
      insurance_end_date: null,
      registration_end_date: null,
    });

    expect(result.status).toBe('missing');
    expect(result.reasons).toEqual(['insurance_missing', 'registration_missing']);
  });
});
