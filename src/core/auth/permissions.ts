/**
 * Permisije kao zatvoren skup.
 *
 * Vrednosti moraju da odgovaraju tabeli `permissions` u bazi; migracija
 * …_catalog.sql je izvor istine, a ova lista postoji da bi promašen
 * naziv bio greška u kompajliranju umesto tiho odbijenog pristupa.
 */

export const PERMISSIONS = [
  'view_financial_data',
  'view_sales',
  'view_customers',
  'view_inventory',
  'view_documents',
  'export_data',
  'ask_ai',
  'run_reports',
  'approve_actions',
  'execute_actions',
  'manage_integrations',
  'manage_users',
  'manage_branding',
  'manage_alerts',
  'manage_reports',
  'view_audit_log',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value)
}

export const STAFF_ROLES = ['super_admin', 'consultant', 'support'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]
