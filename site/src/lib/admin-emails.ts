// Founders with access to Team admin features (Calendar, Email Triage).
// Server-side authorization for /api/ops/* and the admin API routes.
//
// Server-only. Do NOT import this into a 'use client' component.
//
// Do not go back to exporting a hardcoded array to the client: a client
// component that imports it bundles the real addresses into a public JS chunk
// served to every visitor of getamber.dev, no login required. That bundle has
// more reach than the repo itself.
//
// The client never needs the list. It only needs a boolean, so the server
// sends `user.is_admin` (see /api/v1/dashboard) and the browser learns
// nothing about who else is an admin.
//
// Required env: ADMIN_EMAILS — comma-separated, e.g. "a@x.com,b@y.com".
// Set in Vercel for production. Absent locally is fine; see the fail-closed note.

function loadAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Fails closed. A missing or empty ADMIN_EMAILS yields an empty list, so
 * isAdmin() returns false for everyone and admin surfaces simply disappear.
 *
 * That is the deliberate direction to fail: a deploy that forgets the variable
 * locks the founders out of the team tools, which is visible and annoying and
 * gets fixed in minutes. The opposite default would silently grant /api/ops/*
 * — which proxies mail and calendar — to any authenticated key holder. Never
 * "default to allow" here, however tempting during a debugging session.
 */
export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  const admins = loadAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.toLowerCase());
}

/**
 * Subset of admins who see the technical health widget; the others get business
 * metrics instead. This existed as a hardcoded `email !== '<a personal address>'`
 * comparison in the dashboard component — which is how a personal address ended
 * up in a public JS chunk. A named capability keeps the person out of the code.
 *
 * Required env: TECH_ADMIN_EMAILS — comma-separated. Same fail-closed rule:
 * unset means nobody sees the widget, which is a cosmetic loss, whereas
 * defaulting to "everyone" would put infrastructure detail in front of whoever
 * happens to hold an admin seat next.
 */
export function isTechAdmin(email?: string | null): boolean {
  if (!email) return false;
  if (!isAdmin(email)) return false;
  const raw = process.env.TECH_ADMIN_EMAILS;
  if (!raw) return false;
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
