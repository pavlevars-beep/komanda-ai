/**
 * Zatvorena lista revizionih događaja.
 *
 * Slobodan tekst kao naziv akcije čini revizioni trag nepretraživim posle
 * šest meseci: isti događaj se pojavi kao "user login", "login" i
 * "auth.login". Tip ovde sprečava upravo to.
 */
export const AUDIT_ACTIONS = [
  // Autentikacija
  'auth.signed_in',
  'auth.sign_in_failed',
  'auth.signed_out',

  // Pristup podacima
  'workspace.opened',
  'financial_data.viewed',
  'report.viewed',
  'report.generated',
  'data.exported',

  // AI
  'ai.question_asked',
  'ai.tool_called',
  'ai.tool_denied',
  'ai.organization_mismatch',

  // Integracije
  'integration.created',
  'integration.updated',
  'integration.deleted',
  'integration.tested',
  'integration.credentials_rotated',
  'integration.capability_enabled',
  'integration.capability_disabled',

  // Akcije
  'approval.requested',
  'approval.approved',
  'approval.rejected',
  'approval.edited',
  'action.executed',
  'action.execution_failed',

  // Administracija
  'organization.created',
  'organization.updated',
  'branding.updated',
  'user.invited',
  'user.role_changed',
  'user.permission_overridden',
  'user.membership_revoked',

  // Pristup osoblja
  'staff.access_session_started',
  'staff.access_session_ended',
  'staff.access_session_ended_by_client',
  'staff.assignment_granted',
  'staff.assignment_revoked',

  // Bezbednost
  'security.permission_denied',
  'security.rate_limited',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]
