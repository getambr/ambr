// What the /api/ops/[action] proxy will forward to the ops backend.
//
// The team dashboard (lib/team-api.ts) is the only caller of that proxy, so the
// proxy accepts exactly the actions it makes and, per action, exactly the query
// parameters (GET) or top-level body fields (POST) it sends. Anything else is
// refused or dropped before it reaches the backend.
//
// Server-only. Keep in step with team-api.ts: a new dashboard call is added in
// both places (a test fails if the action lists drift apart).

// Own-property lookups only, so an action named like an Object.prototype member
// ('constructor', '__proto__') is not found.
const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

// GET actions -> the query parameters the dashboard sends.
export const OPS_GET_PARAMS: Readonly<Record<string, readonly string[]>> = {
  calendar: ['days'],
  email_log: ['max', 'to_filter'],
  email_body: ['messageId'],
  gmail_unread: [],
  draft_queue: [],
  outreach: [],
  suggest_slots: ['duration', 'days'],
  sent_log: ['max'],
  get_assignments: [],
}

// POST actions -> the top-level body fields the dashboard sends. Nested values
// (attachments, assignees, draftIds) pass through as they are; only top-level
// keys are picked.
export const OPS_POST_FIELDS: Readonly<Record<string, readonly string[]>> = {
  draft_reply: ['emailId', 'instructions'],
  archive_email: ['messageId'],
  improve_draft: ['emailId', 'currentBody'],
  send_thread_reply: ['emailId', 'body'],
  send_new_email: ['to', 'subject', 'body', 'fromAlias', 'attachments'],
  generate_new_draft: ['to', 'subject', 'intent', 'fromAlias'],
  improve_compose: ['currentBody', 'subject', 'fromAlias'],
  approve_draft: ['draftId', 'editedSubject', 'editedBody'],
  update_draft: ['draftId', 'subject', 'body'],
  create_event: ['title', 'start', 'end', 'description', 'location', 'guests'],
  archive_drafts: ['draftIds'],
  assign_email: ['messageId', 'assignees'],
}

/** Query parameters allowed for a GET action, or null when it is not a GET action. */
export function allowedGetParams(action: string): readonly string[] | null {
  return has(OPS_GET_PARAMS, action) ? OPS_GET_PARAMS[action] : null
}

/** Body fields allowed for a POST action, or null when it is not a POST action. */
export function allowedPostFields(action: string): readonly string[] | null {
  return has(OPS_POST_FIELDS, action) ? OPS_POST_FIELDS[action] : null
}
