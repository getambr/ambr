#!/usr/bin/env node
/**
 * Render specific slides of the pitch HTML as 2000×1125 PNGs.
 *
 * Strategy: read the original multi-slide HTML, extract one slide at a time
 * into a fresh HTML doc that keeps the original <head> styles, write to a temp
 * file, then call Chrome headless with --screenshot. No Puppeteer needed.
 *
 * NUMBERING:
 *   As of v0.4.2 the HTML markers `<!-- ═══ SLIDE N: ... ═══ -->` are numbered
 *   CONTIGUOUSLY in document order, matching PDF page order, the deployed PNGs
 *   (private-assets/investor-slides/slide-NN.png) and /api/v1/investors/slide/[n].
 *   One number means one thing everywhere. Earlier decks left gaps where slides
 *   had been deleted (v0.4.1 ran 1,2,4,5,7,8…16 across 14 physical slides), so
 *   the marker number and the page number disagreed and `render-slides.mjs 4`
 *   would clobber the wrong PNG. If you ever delete a slide, renumber the
 *   remaining markers rather than leaving a hole.
 *
 * Usage (1-based slide numbers, same as everywhere else):
 *   node scripts/render-slides.mjs 1 3 13
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..'); // site/

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// The deck version is NOT hardcoded here, and must not be re-hardcoded.
// A literal goes silently stale: pinned at v0.3.9, a re-render would rebuild
// every PNG from a deck three versions old; pinned at v0.4.2, slides 13/14
// re-render with the pre-correction text, and the PNGs look plausible enough
// to ship. Instead derive it from investor-figures.json, which is the same
// source the download route and the /investors page already read — one bump,
// one place.
function resolveDeckHtml() {
  const figures = resolve(ROOT, 'private-data', 'investor-figures.json');
  if (existsSync(figures)) {
    const pdfName = JSON.parse(readFileSync(figures, 'utf8'))?.deck?.pdfFilename;
    if (pdfName) {
      const p = resolve(ROOT, '..', 'docs', 'internal', pdfName.replace(/\.pdf$/, '.html'));
      if (existsSync(p)) return p;
      console.error(`figures name the deck ${pdfName}, but ${p} does not exist.`);
      process.exit(1);
    }
  }
  // private-data is gitignored, so a fresh clone has no figures file. Fall back
  // to the highest version on disk rather than guessing a literal.
  const dir = resolve(ROOT, '..', 'docs', 'internal');
  const decks = readdirSync(dir).filter((f) => /^ambr-pitch-deck-v[\d.]+\.html$/.test(f)).sort();
  if (!decks.length) { console.error(`no ambr-pitch-deck-*.html in ${dir}`); process.exit(1); }
  console.error(`no investor-figures.json — falling back to newest on disk: ${decks[decks.length - 1]}`);
  return resolve(dir, decks[decks.length - 1]);
}
const HTML_PATH = resolveDeckHtml();
const OUT_DIR = resolve(ROOT, 'private-assets/investor-slides');
const VIEWPORT_W = 2000;
const VIEWPORT_H = 1125;
// Slide is 1280×720 in CSS px; the existing PNGs are 2000×1125 → 1.5625× scale.
// Chrome's --force-device-scale-factor multiplies the rendered pixel density.
const SCALE = 2000 / 1280; // 1.5625

// CLI args are SEQUENTIAL slide numbers (1-based, contiguous, matching the
// deployed slide-NN.png files and the /api/v1/investors/slide/[n] route) — see
// the NUMBERING note in the header. They are NOT the deck's marker numbers.
const targets = process.argv.slice(2).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0);
if (targets.length === 0) {
  console.error('Usage: node scripts/render-slides.mjs <slide-num> [<slide-num> ...]');
  console.error('  <slide-num> is a sequential/contiguous slide number (1..N), matching the deployed slide-NN.png files.');
  process.exit(1);
}

if (!existsSync(CHROME)) {
  console.error('Chrome not found at', CHROME);
  process.exit(1);
}
if (!existsSync(HTML_PATH)) {
  console.error('HTML not found at', HTML_PATH);
  process.exit(1);
}

const fullHtml = readFileSync(HTML_PATH, 'utf8');

// Split <head> from <body>. Keep <head> verbatim (CSS + fonts), then build a
// single-slide body for each target.
const headMatch = fullHtml.match(/<head>([\s\S]*?)<\/head>/i);
if (!headMatch) {
  console.error('Could not find <head> in HTML');
  process.exit(1);
}
const headInner = headMatch[1];

// Slides are marked by `<!-- ═══ SLIDE N: ... ═══ -->` comments. Use the comment
// as the split delimiter; each section after a marker is a <div class="slide …">
// followed by its content and a closing </div>.
//
// The captured N is the MARKER number, which is non-contiguous (gaps where slides
// were deleted). We collect markers in DOCUMENT ORDER so the array index gives us
// the sequential/contiguous slide number the deployed PNGs and the API route use:
// orderedSlides[0] → slide-01, orderedSlides[2] → slide-03 (marker 4), etc.
const slideRegex = /<!-- ═══ SLIDE (\d+):[^>]*═══ -->\s*([\s\S]*?)(?=<!-- ═══ SLIDE \d+:|<\/body>)/g;
const orderedSlides = []; // [{ marker, html }] in document order; index 0 = sequential slide 1
let m;
while ((m = slideRegex.exec(fullHtml)) !== null) {
  orderedSlides.push({ marker: parseInt(m[1], 10), html: m[2].trim() });
}

mkdirSync(OUT_DIR, { recursive: true });
const tmp = tmpdir();

for (const seq of targets) {
  // `seq` is the sequential slide number; index into the ordered marker list to
  // find the actual deck slide, then write it under the SAME sequential number so
  // it matches the deployed slide-NN.png / API route scheme.
  const slide = orderedSlides[seq - 1];
  if (!slide) {
    console.error(`Slide ${seq} out of range (deck has ${orderedSlides.length} slides) — skipping`);
    continue;
  }
  const { marker, html: slideMarkup } = slide;

  // Build a single-slide HTML doc. CSS keeps the .slide at 1280×720 in CSS px;
  // we let Chrome's --force-device-scale-factor blow it up to 2000×1125.
  // Body padding 0 so the slide aligns to the viewport corner.
  const singleHtml =
    '<!DOCTYPE html><html lang="en"><head>' + headInner +
    '<style>html,body{margin:0;padding:0;background:#0a0a0a;overflow:hidden} .slide{margin:0!important}</style>' +
    '</head><body>' + slideMarkup + '</body></html>';

  const tmpHtmlPath = join(tmp, `pitch-slide-${seq}-${Date.now()}.html`);
  writeFileSync(tmpHtmlPath, singleHtml, 'utf8');

  const outPng = join(tmp, `slide-${String(seq).padStart(2, '0')}.png`);
  // Delete any prior temp PNG so we know Chrome wrote a fresh one
  try { if (existsSync(outPng)) { /* ignore */ } } catch {}

  console.error(`[slide ${seq}] rendering marker ${marker} → ${outPng}`);
  const result = spawnSync(CHROME, [
    '--headless=new',
    // Load-bearing. Without an isolated profile, launching chrome.exe while
    // another Chrome is open hands the URL to the running instance and exits
    // immediately — no PNG, and an exit code that explains nothing.
    `--user-data-dir=${resolve(ROOT, '.chrome-render-profile')}`,
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-component-update',
    '--no-first-run',
    '--no-default-browser-check',
    `--force-device-scale-factor=${SCALE}`,
    `--window-size=1280,720`,
    // The deck @imports Instrument Serif from the Google Fonts CDN, so this
    // render genuinely races the network — unlike render-brief.mjs, which uses
    // self-hosted next/font and must NOT set this flag. 4000ms was not enough
    // on a cold cache and produced Times-substituted slides.
    `--virtual-time-budget=20000`,
    `--default-background-color=0a0a0aff`,
    `--screenshot=${outPng}`,
    `file:///${tmpHtmlPath.replace(/\\/g, '/')}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  if (result.status !== 0 || !existsSync(outPng)) {
    console.error(`[slide ${seq}] FAILED. stderr:`, result.stderr?.slice(0, 600));
    console.error(`[slide ${seq}] stdout:`, result.stdout?.slice(0, 600));
    process.exit(1);
  }

  // A near-empty PNG means Chrome shot the page before it painted. Cheap to
  // check, and it is the difference between noticing now and shipping a blank
  // slide to investors.
  const px = statSync(outPng).size;
  if (px < 20_000) {
    console.error(`[slide ${seq}] PNG is only ${px} B — the slide did not paint. Not copying.`);
    process.exit(1);
  }

  const dest = join(OUT_DIR, `slide-${String(seq).padStart(2, '0')}.png`);
  copyFileSync(outPng, dest);
  console.error(`[slide ${seq}] copied → ${dest}  (${(px / 1024).toFixed(0)} KB)`);
}

console.error('Done.');
