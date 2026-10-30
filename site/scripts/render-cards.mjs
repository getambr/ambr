/**
 * Renders the full card matrix and composes a contact sheet.
 *
 *   npm run build && npx next start -p 4402
 *   node scripts/render-cards.mjs            # -> .card-preview/index.html
 *
 * 3 templates x 3 formats x 3 copy lengths = 27 cards. The point is not the
 * happy path — it is that short, typical and overlong copy all have to survive
 * every aspect ratio. The founder card shipped broken precisely because only
 * one combination was ever looked at.
 *
 * Geometry assertions live in src/lib/__tests__/card-layout.test.ts, which runs
 * against the same layoutCard() this renders through. This script is the visual
 * half: it proves what the numbers claim.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.CARD_OUT || join(ROOT, '.card-preview');
const BASE = process.env.CARD_BASE || 'http://127.0.0.1:4402';

const TEMPLATES = ['mechanics', 'milestone', 'founder'];
const FORMATS = ['square', 'wide', 'portrait'];

/** Same headline across a row so the format comparison is honest. */
const COPY = {
  short: {
    headline: 'Live on Base mainnet.',
    sub: 'Signed, hashed, minted.',
  },
  typical: {
    headline: 'One contract, two readers.',
    sub: 'Human-readable legal text and machine-parsable JSON, linked by a single SHA-256 hash.',
    mono: 'contract_type: "delegation_of_authority" · sha256: a1b2c3…',
  },
  long: {
    headline: 'Who is liable when an agent acts in your name?',
    sub: 'Two months designing one hash instead of two. The argument, what it protects, and why the alternative quietly moves liability onto the person least able to carry it.',
  },
};

const q = (o) =>
  Object.entries(o)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

mkdirSync(OUT, { recursive: true });

const cards = [];
for (const template of TEMPLATES) {
  for (const format of FORMATS) {
    for (const [length, copy] of Object.entries(COPY)) {
      cards.push({ template, format, length, copy });
    }
  }
}

console.log(`rendering ${cards.length} cards from ${BASE} …`);
let failures = 0;

for (const c of cards) {
  const name = `${c.template}-${c.format}-${c.length}.png`;
  const url = `${BASE}/api/card?${q({ template: c.template, format: c.format, ...c.copy })}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  FAIL ${name}: HTTP ${res.status}`);
    failures++;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // A PNG under ~4KB from this pipeline means an essentially blank card.
  if (buf.length < 4000) {
    console.error(`  FAIL ${name}: suspiciously small (${buf.length}B) — likely blank`);
    failures++;
  }
  writeFileSync(join(OUT, name), buf);
  c.file = name;
  c.bytes = buf.length;
}

if (failures) {
  console.error(`\n${failures} card(s) failed to render.`);
  process.exit(1);
}

/* ─── contact sheet ─── */
const b64 = (f) => `data:image/png;base64,${readFileSync(join(OUT, f)).toString('base64')}`;

const groups = TEMPLATES.map((t) => ({
  template: t,
  rows: FORMATS.map((f) => ({
    format: f,
    items: Object.keys(COPY).map((len) => cards.find((c) => c.template === t && c.format === f && c.length === len)),
  })),
}));

const html = `<title>Ambr card system — contact sheet</title>
<style>
  :root{--bg:#0a0a0a;--brass:#c6a87c;--text:#f4f4f0;--taupe:#a39b8c;--muted:#6f675b;--hair:#2a2620;
    --mono:ui-monospace,'Cascadia Code','JetBrains Mono',Menlo,Consolas,monospace;
    --sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);-webkit-font-smoothing:antialiased}
  .wrap{max-width:1180px;margin:0 auto;padding:56px 24px 96px}
  .edge{height:3px;background:linear-gradient(90deg,transparent,var(--brass),transparent);opacity:.55;margin-bottom:48px}
  .eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--brass)}
  h1{font-weight:400;font-size:clamp(30px,5vw,46px);line-height:1.05;margin:18px 0 0;letter-spacing:-.01em}
  .lede{color:var(--taupe);font-size:17px;max-width:62ch;margin:18px 0 0}
  h2{font-family:var(--mono);font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--brass);
    margin:56px 0 4px;padding-top:20px;border-top:1px solid var(--hair)}
  .fmt{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:22px 0 10px}
  .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
  figure{margin:0}
  figure img{display:block;width:100%;height:auto;border:1px solid var(--hair);background:#000}
  figcaption{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:7px}
  .foot{margin-top:64px;padding-top:16px;border-top:1px solid var(--hair);display:flex;justify-content:space-between;
    flex-wrap:wrap;gap:10px;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="wrap">
  <div class="edge"></div>
  <div class="eyebrow">§ — Card system · regression sheet</div>
  <h1>Every template, every format, every copy length.</h1>
  <p class="lede">${cards.length} cards from one layout engine. The founder card shipped broken because only
  one combination was ever looked at — short, typical and overlong copy now have to survive all three aspect
  ratios before anything ships. Type size is measured against real font advance widths and fitted, not guessed
  from character count.</p>
${groups
  .map(
    (g) => `  <h2>${g.template}</h2>
${g.rows
  .map(
    (r) => `  <div class="fmt">${r.format}</div>
  <div class="row">
${r.items
  .map(
    (c) => `    <figure><img src="${b64(c.file)}" alt="${g.template} ${r.format} ${c.length}" loading="lazy"/>
      <figcaption>${c.length} copy · ${(c.bytes / 1024).toFixed(0)}KB</figcaption></figure>`,
  )
  .join('\n')}
  </div>`,
  )
  .join('\n')}`,
  )
  .join('\n')}
  <div class="foot"><span>Ambr — code-driven, deterministic, token-locked</span><span>${cards.length} cards · 0 failures</span></div>
</div>`;

writeFileSync(join(OUT, 'index.html'), html);
console.log(`\n✓ ${cards.length} cards rendered, 0 failures`);
console.log(`  ${join(OUT, 'index.html')} (${(Buffer.byteLength(html) / 1024).toFixed(0)}KB)`);
