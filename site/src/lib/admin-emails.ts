// Founders with access to Team admin features (Calendar, Email Triage).
// Used both client-side for UI gating and server-side for /api/ops/* proxy authorization.
//
// IMPORTANT: this file must NOT import any Node-only modules so it can be safely
// imported into 'use client' components without breaking the browser bundle.

export const ADMIN_EMAILS = ['ilvers.sermols@gmail.com', 'dainis@ambr.run', 'brunokrisjanis99@gmail.com']

export function isAdmin(email?: string | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
