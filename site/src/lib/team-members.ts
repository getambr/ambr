// Team roster: the mapping between an opaque member id and a real address.
//
// Server-only. Never import into a 'use client' component — that would put the
// real addresses in a public JS chunk on getamber.dev.
//
// WHY IDS AT ALL: the dashboard's email widget keys its alias maps and its
// assignment UI by person. It only ever needs to say "this one", not "this one's
// address". Opaque ids ('ilvers', 'dainis', 'bruno') carry the same meaning to the
// UI and disclose nothing if the bundle is fetched by a stranger.
//
// The translation lives in the ops proxy, not here and not in Apps Script.
// Assignments are persisted by Apps Script keyed by email, and assignment fires
// a notification to that address. Rather than changing that contract — which
// would need an Apps Script edit AND a migration of every stored assignment —
// the proxy converts ids→emails on the way in and emails→ids on the way out.
// Apps Script keeps seeing exactly what it always saw. Nothing to migrate.
//
// Required env: TEAM_MEMBER_MAP — "id:email,id:email,…"
//   e.g.  TEAM_MEMBER_MAP=alice:alice@example.com,bob:bob@example.com

export interface TeamMemberRecord {
  id: string;
  email: string;
}

function loadRoster(): TeamMemberRecord[] {
  const raw = process.env.TEAM_MEMBER_MAP;
  if (!raw) return [];
  return raw
    .split(',')
    .map((pair) => {
      const idx = pair.indexOf(':');
      if (idx < 1) return null;
      const id = pair.slice(0, idx).trim();
      const email = pair.slice(idx + 1).trim().toLowerCase();
      if (!id || !email) return null;
      return { id, email };
    })
    .filter((r): r is TeamMemberRecord => r !== null);
}

/** Real address → opaque id. Returns null for anyone not on the roster. */
export function emailToMemberId(email?: string | null): string | null {
  if (!email) return null;
  const target = email.toLowerCase();
  return loadRoster().find((m) => m.email === target)?.id ?? null;
}

/**
 * Opaque id → real address.
 *
 * Returns null for an unknown id rather than echoing the input back. If a
 * caller passed something unrecognised we must NOT forward it to Apps Script as
 * though it were an address — that would let a crafted assignee string address a
 * notification at an arbitrary recipient. Unknown ids are dropped upstream.
 */
export function memberIdToEmail(id?: string | null): string | null {
  if (!id) return null;
  return loadRoster().find((m) => m.id === id)?.email ?? null;
}

/**
 * Translate a list of ids to addresses, silently dropping unknowns.
 * Used by the ops proxy on the assign_email path.
 */
export function memberIdsToEmails(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((v) => (typeof v === 'string' ? memberIdToEmail(v) : null))
    .filter((e): e is string => e !== null);
}

/**
 * Translate stored addresses back to ids for the client, dropping anyone no
 * longer on the roster. A departed colleague's address must not reappear in the
 * browser just because an old assignment still references it.
 */
export function emailsToMemberIds(emails: unknown): string[] {
  if (!Array.isArray(emails)) return [];
  return emails
    .map((v) => (typeof v === 'string' ? emailToMemberId(v) : null))
    .filter((id): id is string => id !== null);
}
