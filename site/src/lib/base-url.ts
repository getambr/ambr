/**
 * Normalize a base URL that came from an environment variable.
 *
 * Why this exists: `NEXT_PUBLIC_MARKETING_URL` in Vercel Production can literally hold
 * `https://ambr.run\n`, and `https://getamber.dev/.well-known/agent.json` then serves
 * malformed URLs such as `"https://ambr.run\n/llms.txt"`. The code is correct; the dirty
 * value comes from a paste into the dashboard field, and `NEXT_PUBLIC_APP_URL` can carry
 * the same paste.
 *
 * The obvious guard does not work here. That `\n` is a BACKSLASH followed by an `n` —
 * two ordinary characters, 18 bytes in a 16-character URL — not a newline. `.trim()`
 * removes whitespace and leaves this exactly as it is, so a `.trim()` alone would ship
 * and change nothing.
 *
 * So this strips both: real whitespace, and the literal escape sequences a person
 * produces by typing or pasting `\n` into a dashboard field.
 *
 * Environment variables are untrusted input. There is no validation between a text box
 * in a web dashboard and a string interpolated into a URL our customers' agents read.
 */

/** Trailing whitespace, or a literal `\n` / `\r` / `\t` written as two characters. */
const TRAILING_JUNK = /(?:\s|\\[nrt])+$/;

/**
 * @param raw      the env value, possibly undefined and possibly dirty
 * @param fallback the compiled-in default, used when raw is absent or unusable
 * @returns an absolute origin with no trailing slash
 */
export function normalizeBaseUrl(raw: string | undefined | null, fallback: string): string {
  const cleaned = (raw ?? '')
    .replace(TRAILING_JUNK, '')
    // A leading stray is rarer but costs nothing to handle, and a leading newline
    // makes the whole string fail `new URL` in a way that is hard to read in a log.
    .replace(/^(?:\s|\\[nrt])+/, '')
    .replace(/\/+$/, '');

  if (!cleaned) return fallback.replace(/\/+$/, '');

  // A value that survives cleaning but is not a URL is worse than the fallback: it
  // would be interpolated into links that silently 404 rather than failing loudly.
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback.replace(/\/+$/, '');
    }
  } catch {
    return fallback.replace(/\/+$/, '');
  }

  return cleaned;
}
