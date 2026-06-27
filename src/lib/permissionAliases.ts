export const permissionAliases: Record<string, string[]> = {
  "vehicles.read_all": ["vehicles.read", "fleet.read_all"],
  "vehicles.read_all_departments": ["vehicles.read_all", "vehicles.read", "fleet.read_all"],
  "vehicles.read_department": ["vehicles.read"],
  "users.read_all": ["users.read"],
  "users.read_department": ["users.read"],
  "trips.read_department": ["trips.read_all", "trips.read_own", "fleet.read_all"],
  "maintenance.read": ["vehicles.read"],
  "maintenance.read_all": ["maintenance.read", "vehicles.read", "fleet.read_all"],
  "maintenance.read_department": ["maintenance.read", "vehicles.read"],
  "maintenance.manage": ["maintenance.create", "maintenance.edit", "vehicles.edit"],
  "fleet.manage": ["vehicles.create", "vehicles.edit", "vehicle_types.edit"],
  "fleet.read_all": ["vehicles.read", "trips.read_all"],
  "reports.view": ["reports.read"],
  "reports.read_all": ["reports.read"],
  "reports.export": ["reports.export_csv"],
  "audit.export": ["reports.export_csv"],
  "alerts.read": ["alerts.odometer_anomaly", "reports.read"],
  "destinations.read": ["settings.manage", "vehicles.read"],
  "roles.manage": ["roles.create", "roles.edit", "roles.delete"],
};

export function permissionSetHas(permissionSet: Set<string>, permission: string): boolean {
  if (permissionSet.has(permission)) return true;
  const aliases = permissionAliases[permission] ?? [];
  return aliases.some((alias) => permissionSet.has(alias));
}

export function hasAnyPermissionInSet(permissionSet: Set<string>, permissions: string[]): boolean {
  return permissions.some((permission) => permissionSetHas(permissionSet, permission));
}
