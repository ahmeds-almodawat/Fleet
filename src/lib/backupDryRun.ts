export type BackupDryRunTable = {
  key: string;
  label: string;
  count: number;
  ok: boolean;
  detail?: string;
};

export type BackupDryRunResult = {
  ok: boolean;
  version: string;
  exportedAt: string | null;
  totalRows: number;
  tables: BackupDryRunTable[];
  warnings: string[];
  errors: string[];
};

const REQUIRED_TABLES: Array<{ key: string; label: string }> = [
  { key: 'departments', label: 'Departments' },
  { key: 'vehicle_types', label: 'Vehicle Types' },
  { key: 'destinations', label: 'Destinations' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'trips', label: 'Trips' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'audit_events', label: 'Audit Events' },
  { key: 'app_settings', label: 'App Settings' },
];

const ACCEPTED_VERSIONS = new Set(['fleet_backup_v2']);

function getObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function validateFleetBackupDryRun(input: unknown): BackupDryRunResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const root = getObject(input);

  if (!root) {
    return {
      ok: false,
      version: 'unknown',
      exportedAt: null,
      totalRows: 0,
      tables: [],
      warnings: [],
      errors: ['Backup file must be a JSON object.'],
    };
  }

  const meta = getObject(root.meta);
  const version = typeof meta?.version === 'string' ? meta.version : 'unknown';
  const exportedAt = typeof meta?.exported_at === 'string' ? meta.exported_at : null;

  if (!meta) errors.push('Missing backup meta block.');
  if (!ACCEPTED_VERSIONS.has(version)) {
    errors.push(`Unsupported backup version: ${version}. Expected fleet_backup_v2.`);
  }
  if (!exportedAt) warnings.push('Backup exported_at timestamp is missing.');

  const tables = REQUIRED_TABLES.map(({ key, label }) => {
    const value = root[key];
    const ok = Array.isArray(value);
    const count = ok ? value.length : 0;
    return {
      key,
      label,
      count,
      ok,
      detail: ok ? `${count} rows detected.` : `Missing or invalid ${key} array.`,
    };
  });

  for (const table of tables) {
    if (!table.ok) errors.push(table.detail || `Invalid table ${table.key}.`);
  }

  const totalRows = tables.reduce((sum, table) => sum + table.count, 0);
  if (totalRows === 0 && errors.length === 0) {
    warnings.push('Backup structure is valid but contains 0 rows.');
  }

  return {
    ok: errors.length === 0,
    version,
    exportedAt,
    totalRows,
    tables,
    warnings,
    errors,
  };
}
