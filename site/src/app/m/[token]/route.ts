/**
 * GET /m/<token>  —  the phone deck, no password.
 *
 * WHY THIS EXISTS. Investors read on a phone, and making someone type a
 * password into a mobile browser is where the open is lost. This gives a link
 * that opens on one tap and keeps working when it is forwarded.
 *
 * WHY IT IS NOT SIMPLY PUBLIC. The deck carries the round terms, the P&L, the
 * cash curve and the unit economics, and every page is stamped Confidential.
 * public/robots.txt deliberately allows GPTBot, ClaudeBot, PerplexityBot,
 * Google-Extended and cohere-ai across the whole site — correct for a product
 * that sells to agent builders, but it means an unguarded URL here would be an
 * open invitation to ingest the raise terms into AI answers and training sets.
 * The token is what keeps "no password" from meaning "published".
 *
 * PROPERTIES
 *   · No login, no cookie, no gate — one tap from an email on a phone.
 *   · 256 bits of entropy: not discoverable by guessing or crawling.
 *   · Revocable — rotate INVESTOR_DECK_SHARE_TOKEN and every issued link dies.
 *   · noindex/nofollow, and /m/ is disallowed in robots.txt, so an honest
 *     crawler that somehow meets the URL will not index it.
 *
 * What it is NOT: access control. Anyone holding the link can read and can
 * pass it on. It is a shareable secret, not an identity. If you need to know
 * WHO opened it, or to revoke one recipient without breaking everyone else's
 * link, this wants per-recipient tokens in a table instead of one shared value.
 *
 * The file lives in private-assets/, which is gitignored — it reaches
 * production only via outputFileTracingIncludes in next.config.ts.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { createHash, timingSafeEqual } from 'crypto';
import path from 'path';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * One row per shareable link. Separate tokens are the point: each can be
 * revoked without breaking the others, and `label` lands in the audit trail so
 * opens of one link are distinguishable from opens of another. There is no
 * identity on these links, so the label is the only attribution there will
 * ever be.
 *
 * Every file listed here needs its own outputFileTracingIncludes entry in
 * next.config.ts, or the route 404s in production while working locally.
 */
const SHARES: ReadonlyArray<{ env: string; file: string; label: string }> = [
  { env: 'INVESTOR_DECK_SHARE_TOKEN', file: 'investor-deck-mobile.pdf', label: 'general' },
];

/** Compare via fixed-length digests so timingSafeEqual cannot throw on a
 *  length mismatch, and so the comparison does not leak the token's length. */
function tokenMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // An unset or short env var must never mean "everything opens". Fail closed,
  // per share, so one misconfigured token cannot open a different recipient's
  // document. Every candidate is compared so the work does not depend on which
  // share matched.
  const match = SHARES.filter((s) => {
    const expected = process.env[s.env];
    return !!expected && expected.length >= 32 && tokenMatches(token, expected);
  })[0];

  if (!match) {
    // 404 rather than 401: a 401 confirms that something exists at this path
    // and invites retries. A wrong link should look like nothing is here.
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(path.join(process.cwd(), 'private-assets', match.file));
  } catch {
    console.error(`${match.file} not found — check outputFileTracingIncludes`);
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  // Skip HEAD. Next serves HEAD through this same GET handler, so every link
  // unfurler — Slack, WhatsApp, iMessage, Telegram — would otherwise log an
  // "open" that no human performed. Sending the link into one group chat would
  // inflate the count before anyone tapped it, which is worse than no count.
  //
  // No actor and no IP, deliberately. These are people we are pitching, and the
  // brief route sets the house rule: metadata-only for anything investor-side.
  // Do not copy the deck route's IP logging here: it is the wrong sibling to
  // follow.
  //
  // Awaited, unlike every other logAudit() call site. Unawaited, about one
  // insert in three never lands — the response returns and the instance freezes
  // before Supabase answers. Everywhere else that is an acceptable trade; here
  // the row is the ONLY evidence a shared link was opened, so a silently
  // dropped open is a metric that quietly lies. Costs one round-trip against a
  // 700 KB PDF download.
  if (request.method !== 'HEAD') {
    await logAudit({
      event_type: 'investor_deck_mobile_share_opened',
      severity: 'info',
      actor: 'deck-share-link',
      details: { size_bytes: buffer.length, share: match.label },
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // inline: opens in the phone's PDF viewer instead of downloading, which
      // is the whole point of sending it to someone on a phone.
      'Content-Disposition': 'inline; filename="ambr-pitch-deck-mobile.pdf"',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
