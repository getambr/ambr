/**
 * Renders /investors/brief to a PDF via headless Chrome.
 *
 *   node scripts/render-brief.mjs            # against http://127.0.0.1:3000
 *   node scripts/render-brief.mjs 4400       # against another port
 *
 * The page is behind the investor gate, so this signs its own short-lived
 * cookie from INVESTOR_COOKIE_SECRET — the same HMAC construction as
 * src/lib/investor-auth.ts signCookie(). It never needs the password, which
 * means the render stays fully automatable.
 *
 * Three traps are solved below and each is commented where it bites:
 *   1. spawn, not spawnSync — the proxy shares this process.
 *   2. --user-data-dir — or an already-running Chrome swallows the launch.
 *   3. NO --virtual-time-budget — that is the DECK's fix, not this page's.
 *
 * Known defects, not yet fixed:
 *   · Output is 3 pages; it is supposed to be 1. The page content overflows.
 *   · JetBrainsMono does not embed — mono labels fall back to Times. Instrument
 *     Serif embeds fine, so this is specific to the mono face, not the pipeline.
 *     Do not ship the PDF until both are resolved.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = process.argv[2] || '3000';
const OUT = resolve(ROOT, 'private-assets', 'investor-brief.pdf');

function envValue(key) {
  for (const file of ['.env.local', '.env']) {
    const p = resolve(ROOT, file);
    if (!existsSync(p)) continue;
    const line = readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return process.env[key] || '';
}

const secret = envValue('INVESTOR_COOKIE_SECRET');
if (!secret) {
  console.error('INVESTOR_COOKIE_SECRET not found in .env.local — the gate cannot be opened.');
  process.exit(1);
}

// Mirrors signCookie() in src/lib/investor-auth.ts: `${issuedAt}.${hmac(issuedAt)}`
const issuedAt = Date.now();
const sig = createHmac('sha256', secret).update(String(issuedAt), 'utf8').digest('hex');
const cookie = `ambr_investor_auth=${issuedAt}.${sig}`;

if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}`);
  process.exit(1);
}
mkdirSync(dirname(OUT), { recursive: true });

// Getting the cookie into Chrome, the short version of a long detour:
//   · Chrome has no flag for request headers or cookies.
//   · A `data:` bootstrap fails — data: URLs have an opaque origin, so
//     document.cookie cannot set a cookie for 127.0.0.1.
//   · Saving the fetched HTML to a file and printing that ALSO fails, subtly:
//     the CSS loads (page looks right) but @font-face is CORS-restricted even
//     when stylesheets are not, so a file:// document silently gets
//     Times New Roman. That is the trap this script exists to prevent.
// So: a throwaway loopback proxy that injects the cookie. Chrome loads
// everything from one http origin, fonts included, and CORS never applies.
const upstream = `http://127.0.0.1:${PORT}`;
const proxy = createServer(async (req, res) => {
  try {
    const r = await fetch(upstream + req.url, {
      headers: { cookie, 'accept-encoding': 'identity' },
      redirect: 'manual',
    });
    const body = Buffer.from(await r.arrayBuffer());
    const headers = {};
    r.headers.forEach((v, k) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) headers[k] = v;
    });
    res.writeHead(r.status, headers);
    res.end(body);
  } catch (e) {
    res.writeHead(502).end(String(e));
  }
});
await new Promise((ok) => proxy.listen(0, '127.0.0.1', ok));
const proxyPort = proxy.address().port;
const target = `http://127.0.0.1:${proxyPort}/investors/brief`;

// Fail loudly if the gate rejected us, rather than printing a login form.
const probe = await fetch(target);
const probeHtml = await probe.text();
if (!probeHtml.includes('Investor Brief')) {
  console.error('got the gate, not the brief — the signed cookie was rejected.');
  console.error('check INVESTOR_COOKIE_SECRET matches the running server.');
  proxy.close();
  process.exit(1);
}

console.log(`rendering ${target}`);
// spawn, NOT spawnSync. The proxy above runs in this same process, and
// spawnSync blocks Node's event loop — so the server that Chrome is waiting on
// cannot answer a single request, and Chrome sits until it is killed. The
// symptom is an inscrutable "chrome failed" with no PDF, while Chrome renders
// any other URL perfectly.
const res = await new Promise((done) => {
  const child = spawn(CHROME, [
    '--headless=new',
    // Load-bearing. Without an isolated profile, launching chrome.exe while
    // another Chrome is already open (BrowserClaw, or just a normal window)
    // hands the URL to the running instance and exits immediately — exit code
    // looks like a failure, no PDF is written, and nothing explains why.
    `--user-data-dir=${resolve(ROOT, '.chrome-render-profile')}`,
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    // Chrome otherwise spends ~60s on GCM/component/extension chatter that has
    // nothing to do with rendering, and floods stderr with DEPRECATED_ENDPOINT.
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-component-update',
    '--no-first-run',
    '--no-default-browser-check',
    // NO --virtual-time-budget here, deliberately. That flag is in the deck's
    // recipe because the deck @imports from the Google Fonts CDN and genuinely
    // races the network. This page uses next/font, which self-hosts to
    // /_next/static/media — same-origin through the proxy, so there is no race
    // to wait out. Worse, virtual time only advances once the page fully
    // quiesces, which a live Next.js app never quite does, so the flag makes
    // Chrome sit until the timeout instead of printing. Plain --print-to-pdf
    // prints on the load event, which is what we want.
    // --run-all-compositor-stages-before-draw is omitted for the same reason.
    '--no-pdf-header-footer',
    '--default-background-color=0a0a0aff',
    `--print-to-pdf=${OUT}`,
    target,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const kill = setTimeout(() => child.kill('SIGKILL'), 90_000);
  child.on('exit', (code) => { clearTimeout(kill); done({ status: code, stderr: err }); });
});
proxy.close();

if (res.status !== 0) {
  console.error('chrome failed:', res.stderr?.slice(0, 400));
  process.exit(1);
}
if (!existsSync(OUT)) {
  console.error('no PDF produced');
  process.exit(1);
}
// An almost-empty PDF means the page never rendered — a different failure from
// font substitution, and worth naming separately so the next person is not sent
// chasing the webfont race for nothing.
if (statSync(OUT).size < 20_000) {
  console.error(`PDF is only ${statSync(OUT).size} B — the page did not render.`);
  console.error('This is NOT font substitution. Check the server is up and the cookie was accepted.');
  process.exit(1);
}

// Verify rather than assume: a broken render is a valid PDF that merely looks
// wrong, so check the embedded font table, not the exit code.
const bytes = statSync(OUT).size;
const raw = readFileSync(OUT, 'latin1');
const hasSerif = raw.includes('InstrumentSerif');
const hasMono = raw.includes('JetBrainsMono');

console.log(`  wrote ${OUT}  (${(bytes / 1024).toFixed(0)} KB)`);
console.log(`  InstrumentSerif embedded : ${hasSerif ? 'yes' : 'NO'}`);
console.log(`  JetBrainsMono embedded   : ${hasMono ? 'yes' : 'NO'}`);

if (!hasSerif) {
  console.error('\nFONT SUBSTITUTION — Chrome printed before the webfonts loaded.');
  console.error('The PDF is off-brand. Raise --virtual-time-budget and re-run.');
  process.exit(1);
}
console.log('  ok');
