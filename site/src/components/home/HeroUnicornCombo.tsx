'use client';

/**
 * HeroUnicornCombo — REVIEW build: Unicorn Studio scene as the full-bleed ambient ring,
 * with OUR element socketed into the ring's hollow centre. Swap the centre with ?center=:
 *   ?center=mark    → genesis brass-particle mark (lib/genesis)
 *   ?center=engine  → our shader core (ShaderOrb)
 *   (none)          → ring only
 * Non-destructive: /hero-unicorn; /preview-bold untouched until we choose.
 */
import { useEffect, useRef, useState } from 'react';
import GenesisHero from '@/components/home/GenesisHero';
import ShaderOrb from '@/components/home/ShaderOrb';

const SDK_URL = 'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.6/dist/unicornStudio.umd.js';
const PROJECT_ID = 'ZXQPWCjyf3uhjhsyriBt';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

type UnicornGlobal = { addScene: (opts: Record<string, unknown>) => Promise<{ destroy?: () => void }> };

function loadUnicorn(): Promise<UnicornGlobal> {
  const w = window as unknown as { UnicornStudio?: UnicornGlobal };
  if (w.UnicornStudio?.addScene) return Promise.resolve(w.UnicornStudio);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-unicorn]');
    if (existing) {
      existing.addEventListener('load', () => resolve((window as unknown as { UnicornStudio: UnicornGlobal }).UnicornStudio));
      existing.addEventListener('error', () => reject(new Error('unicorn sdk failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL; s.async = true; s.setAttribute('data-unicorn', '');
    s.onload = () => resolve((window as unknown as { UnicornStudio: UnicornGlobal }).UnicornStudio);
    s.onerror = () => reject(new Error('unicorn sdk failed'));
    document.head.appendChild(s);
  });
}

/** The Ambr mark (canonical vector from brand/ambr-mark.svg + lib/genesis DROPLET_D),
 *  engraved into the ring's hollow on load: droplet outline draws in, the constellation
 *  lines + inclusion nodes follow, then the brand spark blooms at center.
 *  Pure SVG + CSS (no WebGL contention with the Unicorn scene). */
function SealMark() {
  const droplet =
    'M51 12 C39 20 31 38 29 52 C27 71 39 86 50 86 C62 86 72 71 71 53 C70 38 64 21 51 12 Z';
  const spark =
    'M50 43 C50.9 50 52.7 51.7 60 52.5 C52.7 53.3 50.9 55 50 62 C49.1 55 47.3 53.3 40 52.5 C47.3 51.7 49.1 50 50 43 Z';
  return (
    <svg className="hu-seal" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="hu-seal-g" x1="24" y1="12" x2="76" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9a7d52" />
          <stop offset=".5" stopColor="#c6a87c" />
          <stop offset="1" stopColor="#8a6f48" />
        </linearGradient>
      </defs>
      {/* bloom filters with explicit oversized regions (region-edge clipping = seams) */}
      <filter id="hu-seal-b1" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.4" /></filter>
      <filter id="hu-seal-b2" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" /></filter>
      <filter id="hu-seal-b3" x="-140%" y="-140%" width="380%" height="380%"><feGaussianBlur stdDeviation="9" /></filter>
      {/* chamber wash — the ignited mark lights its hollow (blurred solid, not a gradient: gradients band on near-black) */}
      <ellipse className="hu-seal-wash" cx="50" cy="50" rx="27" ry="30" fill="#c6a87c" filter="url(#hu-seal-b3)" />
      {/* radiant bloom — fades up AFTER the engrave completes (the ignite) */}
      <g className="hu-seal-ignite">
        <path d={droplet} stroke="#e8d9bb" strokeWidth="3.2" filter="url(#hu-seal-b2)" />
        <g filter="url(#hu-seal-b1)">
          <path d={droplet} stroke="#e8d9bb" strokeWidth="1.5" />
          <circle cx="40" cy="39" r="2.6" fill="#e8d9bb" />
          <circle cx="62" cy="45" r="2.2" fill="#e8d9bb" />
          <circle cx="56" cy="65" r="2.1" fill="#e8d9bb" />
          <path d={spark} fill="#fff6e6" />
        </g>
      </g>
      {/* crisp engraved core on top */}
      <path className="hu-seal-path" d={droplet} stroke="url(#hu-seal-g)" strokeWidth="2" strokeLinejoin="round" pathLength={100} />
      <g className="hu-seal-lines" stroke="#c6a87c" strokeWidth="0.9" opacity="0.6">
        <line x1="50" y1="52" x2="40" y2="39" pathLength={100} />
        <line x1="50" y1="52" x2="62" y2="45" pathLength={100} />
        <line x1="50" y1="52" x2="56" y2="65" pathLength={100} />
      </g>
      <g className="hu-seal-nodes" fill="#e8d9bb">
        <circle cx="40" cy="39" r="1.9" />
        <circle cx="62" cy="45" r="1.6" />
        <circle cx="56" cy="65" r="1.5" />
      </g>
      <path className="hu-seal-spark" d={spark} fill="#fff8ec" />
    </svg>
  );
}

/** Energy stream: particles detach from the ring's inner edge and flow into the mark.
 *  Deterministic (index-derived) so renders are reproducible; golden-angle spread. */
const ENERGY = Array.from({ length: 14 }, (_, i) => ({
  i,
  a: Math.round((i * 137.5) % 360),
  r: 0.55 + ((i * 37) % 50) / 100,
  c: i % 3 === 0 ? '#e8d9bb' : '#c6a87c',
  delay: +(1.6 + i * 0.29).toFixed(2),
  dur: +(2.6 + ((i * 41) % 100) / 100).toFixed(2),
}));

export default function HeroUnicornCombo() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState<'none' | 'mark' | 'engine' | 'seal'>('seal');
  // After the load choreography completes, mark the section settled so the CSS can
  // strip the finished animations and release their GPU layers (see .hu-done).
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('center');
    if (c === 'mark' || c === 'engine' || c === 'none' || c === 'seal') setCenter(c);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 3600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    let disposed = false;
    let scene: { destroy?: () => void } | null = null;
    loadUnicorn()
      // production mode = optimized/flattened CDN render; ?update bust avoids the stale-cache trap (bump on each re-publish)
      .then((US) => US.addScene({ element: el, projectId: `${PROJECT_ID}?update=5`, dpi: 2, scale: 1, fps: 60, lazyLoad: false, production: true }))
      .then((s) => { if (disposed) s.destroy?.(); else { scene = s; (window as unknown as { __uscene?: unknown }).__uscene = s; } })
      .catch(() => {});
    return () => { disposed = true; scene?.destroy?.(); };
  }, []);

  return (
    <section className={`hu-root relative min-h-screen overflow-hidden${settled ? ' hu-done' : ''}`} style={{ background: '#0a0a0a' }}>
      <style>{`
        .hu-root { color: #f4f4f0; }
        /* one stage at the scene's authored 1080x1080 SQUARE aspect — ring + mark scale together, anchored right */
        .hu-stage { position:absolute; right:9%; top:50%; transform:translateY(-50%);
          height:min(82vh,640px); aspect-ratio:1/1; z-index:0; pointer-events:none; }
        /* tight reveal: show ONLY the ring, thin fade right at its outer edge, everything beyond hidden */
        .hu-scene { position:absolute; inset:0;
          -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 0%, #000 54%, rgba(0,0,0,0.5) 57%, transparent 60%);
          mask-image: radial-gradient(circle at 50% 50%, #000 0%, #000 54%, rgba(0,0,0,0.5) 57%, transparent 60%); }
        /* mark locked to the ring's hollow centre WITHIN the stage (tune left/top to the ring) */
        .hu-center { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
          width:37%; aspect-ratio:1; z-index:1; pointer-events:none; }
        /* The veil curtain is RETIRED on >=640px: it existed to hide the scene's background
           bleed, but the scene background is now transparent and the mask clips everything.
           Dark gradient overlays band visibly at fractional DPR - they WERE the "lines".
           Mobile re-enables a single light top scrim in its media block below. */
        .hu-veil { position:absolute; inset:0; z-index:2; pointer-events:none; background:none; }
        /* the hairline rule belongs to the TEXT COLUMN — it fades out before the ring zone
           so it never crosses the graphic (was full-width; read as a stray line under the ring) */
        .hu-rule { height:1px; background:linear-gradient(to right, transparent, rgba(198,168,124,0.45) 8%, rgba(198,168,124,0.4) 42%, transparent 58%); }
        .hu-head { font-size:clamp(3.4rem,9.8vw,10.5rem); line-height:0.84; letter-spacing:-0.035em; }
        .hu-ink { background:linear-gradient(108deg,#8a6f48 0%,#e8d9bb 34%,#c6a87c 58%,#e8d9bb 80%,#9a7d52 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; padding-bottom:0.3em; margin-bottom:-0.3em; }
        .hu-bracket { position:absolute; width:22px; height:22px; border-color:rgba(198,168,124,0.5); z-index:3; }
        .hu-cta { position:relative; overflow:hidden; }
        .hu-cta > span { position:relative; z-index:1; transition:color .45s ease; }
        .hu-cta::after { content:''; position:absolute; inset:0; background:#c6a87c; transform:translateX(-101%); transition:transform .45s cubic-bezier(.7,0,.2,1); }
        .hu-cta:hover::after { transform:translateX(0); }
        .hu-cta:hover > span { color:#0a0a0a; }
        /* ---- load choreography (CSS-driven: starts at first paint, no hydration wait; H1 is never animated — LCP stays instant) ---- */
        .hu-stage { opacity:0; animation:hu-stagein 1.9s cubic-bezier(.22,.61,.21,1) .1s forwards; }
        @keyframes hu-stagein {
          0% { opacity:0; transform:translateY(-50%) scale(.955); }
          100% { opacity:1; transform:translateY(-50%) scale(1); }
        }
        .hu-rule { transform:scaleX(0); animation:hu-rulein .9s cubic-bezier(.65,0,.3,1) .15s forwards; }
        .hu-in { opacity:0; transform:translateY(10px); animation:hu-rise .6s cubic-bezier(.2,.6,.2,1) forwards; }
        .hu-in-0 { animation-delay:.05s } .hu-in-1 { animation-delay:.16s } .hu-in-2 { animation-delay:.3s }
        .hu-in-3 { animation-delay:.44s } .hu-in-4 { animation-delay:.56s } .hu-in-5 { animation-delay:.68s } .hu-in-6 { animation-delay:.8s }
        @keyframes hu-fade { to { opacity:1 } }
        @keyframes hu-rulein { to { transform:scaleX(1) } }
        @keyframes hu-rise { to { opacity:1; transform:none } }
        /* ---- the Ambr mark, engraved in: outline draws, constellation follows, spark blooms ---- */
        .hu-seal { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); height:80%; aspect-ratio:1/1; }
        .hu-seal-path { stroke-dasharray:100; stroke-dashoffset:100; animation:hu-draw 1.2s cubic-bezier(.65,0,.3,1) .4s forwards; }
        .hu-seal-lines line { stroke-dasharray:100; stroke-dashoffset:100; animation:hu-draw .5s cubic-bezier(.65,0,.3,1) forwards; }
        .hu-seal-lines line:nth-child(1) { animation-delay:1.45s } .hu-seal-lines line:nth-child(2) { animation-delay:1.52s } .hu-seal-lines line:nth-child(3) { animation-delay:1.6s }
        .hu-seal-nodes circle { opacity:0; animation:hu-fade .35s ease-out forwards; }
        .hu-seal-nodes circle:nth-child(1) { animation-delay:1.8s } .hu-seal-nodes circle:nth-child(2) { animation-delay:1.92s } .hu-seal-nodes circle:nth-child(3) { animation-delay:2.04s }
        .hu-seal-spark { opacity:0; transform:scale(.6); transform-box:fill-box; transform-origin:center; animation:hu-bloom .7s cubic-bezier(.2,.7,.25,1.15) 2s forwards; }
        /* energy stream: ring feeds the mark — particles flow inward on golden-angle radials,
           first arrivals land as the ignite fires; sparse perpetual trickle after */
        .hu-energy { position:absolute; left:50%; top:50%; width:54%; aspect-ratio:1/1;
          transform:translate(-50%,-50%); z-index:1; pointer-events:none; }
        .hu-energy-p { opacity:0; transform-box:view-box; transform-origin:50% 50%;
          transform:rotate(var(--a)) translateX(47px);
          animation-name:hu-flow; animation-timing-function:cubic-bezier(.45,.05,.55,.95);
          animation-iteration-count:infinite; }
        @keyframes hu-flow {
          0% { transform:rotate(var(--a)) translateX(47px); opacity:0 }
          12% { opacity:.75 }
          70% { opacity:.5 }
          100% { transform:rotate(var(--a)) translateX(5px); opacity:0 }
        }
        /* the IGNITE: radiant bloom + chamber wash fade up after the engrave, then breathe */
        .hu-seal-wash { opacity:0; animation:hu-washin 2.6s ease-out 2.4s forwards; }
        .hu-seal-ignite { opacity:0;
          animation:hu-ignite 1.6s ease-out 2.4s forwards, hu-breath 7s ease-in-out 5.2s infinite alternate; }
        @keyframes hu-draw { to { stroke-dashoffset:0 } }
        @keyframes hu-bloom { to { opacity:1; transform:scale(1) } }
        @keyframes hu-washin { to { opacity:.12 } }
        @keyframes hu-ignite { to { opacity:.75 } }
        @keyframes hu-breath { from { opacity:.6 } to { opacity:.85 } }
        /* ---- post-load settle: strip finished animations so their GPU layers are released.
           Kept-forwards composited layers render faint 1px edge seams at fractional DPR (Windows 125/150%). ---- */
        .hu-done .hu-in { animation:none; opacity:1; transform:none; }
        .hu-done .hu-rule { animation:none; transform:scaleX(1); }
        .hu-done .hu-stage { animation:none; opacity:1; transform:translateY(-50%); }
        .hu-done .hu-seal-path, .hu-done .hu-seal-lines line { animation:none; stroke-dashoffset:0; }
        .hu-done .hu-seal-nodes circle { animation:none; opacity:1; }
        .hu-done .hu-seal-spark { animation:none; opacity:1; transform:scale(1); }
        .hu-done .hu-seal-wash { animation:none; opacity:.12; } /* ignite keeps breathing by design */
        /* ---- mobile (<640px): the scene's own MOBILE variant is a portrait, left-anchored half-ring
           that composes itself — let it fill the viewport, drop the desktop mask/curtain geometry,
           keep only a bottom scrim for text legibility. Seal hidden (the hollow sits at the edge). ---- */
        /* ---- tablet (640-1023px): full ring does not fit beside the text column —
           mirror the mobile idea and let the ring arc in from the RIGHT edge. ---- */
        @media (min-width: 768px) and (max-width: 1023px) {
          /* hollow + mark stay VISIBLE: ring sits lower-right, slightly smaller, its right
             side trims off-screen instead of the logo (per design call 2026-07-03) */
          .hu-stage { right:-24vw; top:56%; height:min(70vh,560px); }
        }
        @media (max-width: 767px) {
          /* proper mobile hero: content ends one ring-band above the section bottom;
             the FULL ring + seal sit centered in the freed band as the closing moment */
          .hu-content { padding-bottom:96vw; }
          .hu-stage { left:50%; right:auto; top:auto; bottom:2vw; width:88vw; height:auto; aspect-ratio:1/1;
            transform:translateX(-50%); animation:hu-fade 1.9s cubic-bezier(.22,.61,.21,1) .1s forwards; }
          .hu-done .hu-stage { animation:none; opacity:1; transform:translateX(-50%); }
          .hu-veil { background:linear-gradient(180deg, rgba(10,10,10,0.35) 0%, rgba(10,10,10,0.1) 14%, rgba(10,10,10,0) 28%); }
          /* mobile rules can span full width again — nothing crosses the ring band */
          .hu-rule { background:linear-gradient(to right, transparent, rgba(198,168,124,0.45), transparent); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hu-stage, .hu-rule, .hu-in, .hu-seal-path, .hu-seal-lines line, .hu-seal-nodes circle, .hu-seal-spark, .hu-seal-wash, .hu-seal-ignite { animation:none; }
          .hu-stage { opacity:1 } .hu-rule { transform:none } .hu-in { opacity:1; transform:none }
          .hu-seal-path, .hu-seal-lines line { stroke-dashoffset:0 }
          .hu-seal-nodes circle { opacity:1 } .hu-seal-spark { opacity:1; transform:none }
          .hu-seal-wash { opacity:.12 } .hu-seal-ignite { opacity:.75 }
          .hu-energy { display:none }
        }
      `}</style>

      <div className="hu-stage" aria-hidden="true">
        <div ref={sceneRef} className="hu-scene" />
        <svg className="hu-energy" viewBox="0 0 100 100" aria-hidden="true">
          {ENERGY.map((p) => (
            <circle
              key={p.i}
              className="hu-energy-p"
              cx="50"
              cy="50"
              r={p.r}
              fill={p.c}
              style={{ ['--a' as string]: `${p.a}deg`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
            />
          ))}
        </svg>
        <div className="hu-center">
          {center === 'seal' && <SealMark />}
          {center === 'mark' && <GenesisHero className="absolute inset-0 h-full w-full" />}
          {center === 'engine' && <ShaderOrb className="absolute inset-0 h-full w-full" />}
        </div>
      </div>
      <div className="hu-veil" aria-hidden="true" />

      <span className="hu-bracket" style={{ top: 22, left: 22, borderTop: '1px solid', borderLeft: '1px solid' }} aria-hidden="true" />
      <span className="hu-bracket" style={{ top: 22, right: 22, borderTop: '1px solid', borderRight: '1px solid' }} aria-hidden="true" />
      <span className="hu-bracket" style={{ bottom: 22, left: 22, borderBottom: '1px solid', borderLeft: '1px solid' }} aria-hidden="true" />
      <span className="hu-bracket" style={{ bottom: 22, right: 22, borderBottom: '1px solid', borderRight: '1px solid' }} aria-hidden="true" />

      <div className="hu-content relative z-10 flex min-h-screen flex-col px-6 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col">
        <div className="hu-in hu-in-0 flex items-center justify-between pt-10 pb-6 text-[11px] uppercase" style={{ ...mono, color: '#9a8e78', letterSpacing: '0.22em' }}>
          <span className="hidden sm:inline">Ambr — Agent Mandate &amp; Binding Registry</span>
          <span className="hidden sm:block" style={{ color: '#c6a87c' }}>Est. on Base L2 · MMXXVI</span>
        </div>
        <div className="hu-rule" aria-hidden="true" />

        <div className="flex flex-1 items-center py-10">
          <div className="max-w-[820px]">
            <p className="hu-in hu-in-1 mb-7 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>
              № 001 — The accountability record for autonomous agents
            </p>
            <h1 className="hu-head" style={serif}>
              <span className="block">Your AI is</span>
              <span className="block">about to act</span>
              <span className="hu-ink block">in your name.</span>
            </h1>
            <div className="hu-in hu-in-2 mt-10 max-w-md">
              <p className="text-[15px] leading-relaxed" style={{ color: '#cfc8ba' }}>
                Every act leaves a fossil. An <span style={{ color: '#f4f4f0' }}>Agent Mandate</span> records
                who authorized it, in what scope, under which law. Readable as
                prose, executable as code, revocable on record.
              </p>
            </div>
            <div className="hu-in hu-in-3 mt-9 flex flex-wrap items-center gap-7">
              <a href="/activate" className="hu-cta inline-flex items-center border px-8 py-3.5 text-[12px] uppercase" style={{ ...mono, letterSpacing: '0.18em', color: '#c6a87c', borderColor: 'rgba(198,168,124,0.7)', background: 'rgba(10,10,10,0.3)' }}>
                <span>Get an API key →</span>
              </a>
              <a href="https://getamber.dev/reader" className="text-[12px] uppercase" style={{ ...mono, color: '#9a9183', letterSpacing: '0.16em' }}>
                Verify a live contract
              </a>
            </div>
          </div>
        </div>

        <div className="hu-rule" aria-hidden="true" />
        <div className="grid grid-cols-1 gap-px pb-10 pt-7 sm:grid-cols-3">
          {[
            ['01', 'Authorize', 'Scopes · governing law · time windows'],
            ['02', 'Act', 'A mandate both sides can trust'],
            ['03', 'Prove', 'Revocable, with the full history on record'],
          ].map(([n, t, d], i) => (
            <div key={n} className={`hu-in hu-in-${4 + i} flex items-baseline gap-4 ${i === 0 ? '' : 'sm:pl-8'}`}>
              <span style={{ ...serif, fontSize: 30, color: '#c6a87c', opacity: 0.55 }}>{n}</span>
              <div>
                <div style={{ ...serif, fontSize: 22, color: '#f4f4f0' }}>{t}</div>
                <div className="mt-1 text-[11px] uppercase" style={{ ...mono, color: '#9a9183', letterSpacing: '0.14em' }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </section>
  );
}
