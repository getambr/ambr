'use client';

/**
 * HeroTeardown: the home hero. The headline and copy paint at once (the H1 is never animated, so
 * the LCP stays instant); beside them one Agent Mandate assembles itself through its six states and
 * comes apart into its layers on a click, or as you scroll out of the hero.
 * The scene is a framework-free engine (lib/teardown) loaded after first paint; this shell owns the
 * layout, the state rail and the fallbacks. Reduced motion shows the finished mandate, still.
 */
import { useEffect, useRef, useState } from 'react';
import type { TeardownEngine } from '@/lib/teardown/TeardownEngine';
import { STATES } from '@/lib/teardown/mandateArt';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Without WebGL: the finished mandate as plain markup. */
function StillMandate() {
  return (
    <div className="ht-still" aria-hidden="true">
      <div className="flex items-start justify-between" style={{ ...mono, fontSize: 10, color: '#8a8170' }}>
        <span>AMB-0142 · example</span>
        <span style={{ color: '#34D399', border: '1px solid #34D399', padding: '3px 7px' }}>Executed</span>
      </div>
      <div className="mt-4" style={{ ...serif, fontSize: 30, lineHeight: 1, color: '#f4f4f0' }}>Agent Mandate</div>
      <ol className="mt-4 space-y-1.5" style={{ fontSize: 10, lineHeight: 1.4, color: '#d8d2c6' }}>
        <li>1 · The Principal authorizes the Agent to buy cloud compute in the Principal&apos;s name.</li>
        <li>2 · Each purchase stays inside the spend cap set in the schedule.</li>
        <li>3 · Only the counterparties listed in the schedule may be paid.</li>
      </ol>
      <div className="mt-4 border p-2" style={{ ...mono, fontSize: 9, color: '#8a8170', borderColor: 'rgba(198,168,124,0.5)' }}>
        Schedule · scope · spend cap · counterparties · expires
      </div>
      <div className="mt-auto pt-4" style={{ ...mono, fontSize: 9, color: '#c6a87c' }}>SHA-256 anchored on Base</div>
    </div>
  );
}

export default function HeroTeardown() {
  const rootRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLOListElement>(null);
  const engineRef = useRef<TeardownEngine | null>(null);
  const [still, setStill] = useState(false);
  const [apart, setApart] = useState(false);
  // After the load choreography, strip the finished CSS animations so their GPU layers are released
  // (kept-forwards composited layers render faint edge seams at fractional DPR).
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 2600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!webglAvailable()) {
      setStill(true);
      return;
    }
    let disposed = false;
    let engine: TeardownEngine | null = null;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compact = window.matchMedia('(max-width: 1179px)').matches;
    const css = getComputedStyle(document.body);
    const family = (v: string, fallback: string) => `${css.getPropertyValue(v).trim() || fallback}`;
    const fonts = {
      serif: family('--font-instrument-serif', 'Georgia, serif'),
      sans: family('--font-inter', 'system-ui, sans-serif'),
      mono: family('--font-jetbrains-mono', 'monospace'),
    };

    const onState = (idx: number, t: number) => {
      const items = railRef.current?.children;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const li = items[i] as HTMLElement;
        const btn = li.firstElementChild as HTMLElement | null;
        if (!btn) continue;
        if (i === idx) btn.setAttribute('aria-current', 'step');
        else btn.removeAttribute('aria-current');
        li.style.setProperty('--p', String(Math.max(0, Math.min(1, t - i))));
      }
    };

    (async () => {
      try {
        await Promise.all([
          document.fonts.load(`76px ${fonts.serif}`),
          document.fonts.load(`400 21px ${fonts.sans}`),
          document.fonts.load(`400 15px ${fonts.mono}`),
          document.fonts.load(`500 15px ${fonts.mono}`),
        ]);
      } catch {
        /* the canvas falls back to the stack */
      }
      const { TeardownEngine } = await import('@/lib/teardown/TeardownEngine');
      if (disposed) return;
      try {
        engine = new TeardownEngine(host, { fonts, reduced, compact, onState, onApart: setApart });
      } catch {
        setStill(true);
        return;
      }
      engineRef.current = engine;
      engine.start();
      // dev only: lets a screenshot check freeze any state (window.__teardown.freeze(t, ex))
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __teardown?: TeardownEngine }).__teardown = engine;
    })();

    const onScroll = () => {
      const el = rootRef.current;
      if (!el || !engine || compact) return;
      engine.setScroll(window.scrollY / Math.max(1, el.offsetHeight));
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      disposed = true;
      window.removeEventListener('scroll', onScroll);
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <section ref={rootRef} className={`ht-root relative min-h-screen overflow-hidden${settled ? ' ht-done' : ''}`} style={{ background: '#0a0a0a' }}>
      <style>{`
        .ht-root { color: #f4f4f0; }
        /* the stage: a square on the right, the mandate centred in it */
        .ht-stage { position:absolute; right:6%; top:50%; transform:translateY(-50%);
          height:min(80vh,660px); aspect-ratio:1/1; z-index:0; pointer-events:auto; }
        .ht-front { position:relative; z-index:1; }
        .ht-canvas { position:absolute; inset:0; }
        .ht-hit { position:absolute; left:22%; right:22%; top:12%; bottom:12%; z-index:1; cursor:pointer;
          background:transparent; border:0; padding:0; }
        .ht-hit:focus-visible { outline:1px solid rgba(198,168,124,0.7); outline-offset:6px; }
        .ht-still { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:52%; aspect-ratio:3/4;
          display:flex; flex-direction:column; padding:7%; background:#14120f; border:1px solid rgba(198,168,124,0.6); }
        /* exploded-view labels, placed by the engine */
        .ht-lbls { position:absolute; inset:0; pointer-events:none; z-index:2; }
        .ht-lbl { position:absolute; left:0; top:0; opacity:0; padding-left:14px; white-space:nowrap;
          font:400 11px/1.3 var(--font-jetbrains-mono), monospace; color:#e8d9bb; }
        .ht-lbl::before { content:''; position:absolute; left:0; top:50%; width:10px; height:1px; background:#c6a87c; }
        .ht-lbl em { display:block; font-style:normal; font-size:10px; color:#8a8170; }
        /* the state rail: an index down the stage's right edge */
        .ht-rail { position:absolute; right:0; top:50%; transform:translateY(-50%); z-index:3;
          display:flex; flex-direction:column; gap:2px; list-style:none; margin:0; padding:0; }
        .ht-rail li { position:relative; --p:0; }
        .ht-rail button { display:block; width:100%; text-align:right; padding:6px 14px 6px 0; background:transparent; border:0;
          font:400 11px/1.2 var(--font-jetbrains-mono), monospace; letter-spacing:0.04em; color:#6f675b; cursor:pointer;
          transition:color .3s ease; }
        .ht-rail button:hover, .ht-rail button[aria-current="step"] { color:#e8d9bb; }
        .ht-rail li::after { content:''; position:absolute; right:0; top:6px; bottom:6px; width:1px; background:rgba(198,168,124,0.18); }
        .ht-rail li::before { content:''; position:absolute; right:0; top:6px; width:1px; height:calc((100% - 12px) * var(--p));
          background:#c6a87c; z-index:1; }
        .ht-rail .ht-apart { margin-top:10px; color:#c6a87c; }
        .ht-rail .ht-apart[aria-pressed="true"] { color:#e8d9bb; }
        .ht-rail button:focus-visible { outline:1px solid rgba(198,168,124,0.7); outline-offset:2px; }
        .ht-rule { height:1px; background:linear-gradient(to right, transparent, rgba(198,168,124,0.45) 8%, rgba(198,168,124,0.4) 42%, transparent 58%); }
        .ht-head { font-size:clamp(3.4rem,9.8vw,10.5rem); line-height:0.84; letter-spacing:-0.035em; }
        .ht-ink { background:linear-gradient(108deg,#8a6f48 0%,#e8d9bb 34%,#c6a87c 58%,#e8d9bb 80%,#9a7d52 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; padding-bottom:0.3em; margin-bottom:-0.3em; }
        .ht-bracket { position:absolute; width:22px; height:22px; border-color:rgba(198,168,124,0.5); z-index:3; }
        .ht-cta { position:relative; overflow:hidden; }
        .ht-cta > span { position:relative; z-index:1; transition:color .45s ease; }
        .ht-cta::after { content:''; position:absolute; inset:0; background:#c6a87c; transform:translateX(-101%); transition:transform .45s cubic-bezier(.7,0,.2,1); }
        .ht-cta:hover::after { transform:translateX(0); }
        .ht-cta:hover > span { color:#0a0a0a; }
        /* load choreography (CSS: starts at first paint, no hydration wait; the H1 is never animated) */
        .ht-stage { opacity:0; animation:ht-stagein 1.6s cubic-bezier(.22,.61,.21,1) .1s forwards; }
        @keyframes ht-stagein { to { opacity:1; } }
        .ht-rule { transform:scaleX(0); animation:ht-rulein .9s cubic-bezier(.65,0,.3,1) .15s forwards; }
        .ht-in { opacity:0; transform:translateY(10px); animation:ht-rise .6s cubic-bezier(.2,.6,.2,1) forwards; }
        .ht-in-0 { animation-delay:.05s } .ht-in-1 { animation-delay:.16s } .ht-in-2 { animation-delay:.3s }
        .ht-in-3 { animation-delay:.44s } .ht-in-4 { animation-delay:.56s } .ht-in-5 { animation-delay:.68s } .ht-in-6 { animation-delay:.8s }
        @keyframes ht-rulein { to { transform:scaleX(1) } }
        @keyframes ht-rise { to { opacity:1; transform:none } }
        .ht-done .ht-in { animation:none; opacity:1; transform:none; }
        .ht-done .ht-rule { animation:none; transform:scaleX(1); }
        .ht-done .ht-stage { animation:none; opacity:1; }
        /* below 1180px: the mandate sits in the flow, right under the buttons */
        @media (max-width: 1179px) {
          .ht-stage { position:relative; right:auto; top:auto; transform:none; width:min(88vw, 600px); height:auto; margin:0 auto 8px; }
          .ht-rail { display:none; }
          .ht-hit { left:18%; right:18%; top:8%; bottom:8%; }
          .ht-rule { background:linear-gradient(to right, transparent, rgba(198,168,124,0.45), transparent); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ht-stage, .ht-rule, .ht-in { animation:none; }
          .ht-stage { opacity:1 } .ht-rule { transform:none } .ht-in { opacity:1; transform:none }
          .ht-rail button { transition:none; }
        }
      `}</style>

      <span className="ht-bracket" style={{ top: 22, left: 22, borderTop: '1px solid', borderLeft: '1px solid' }} aria-hidden="true" />
      <span className="ht-bracket" style={{ top: 22, right: 22, borderTop: '1px solid', borderRight: '1px solid' }} aria-hidden="true" />
      <span className="ht-bracket" style={{ bottom: 22, left: 22, borderBottom: '1px solid', borderLeft: '1px solid' }} aria-hidden="true" />
      <span className="ht-bracket" style={{ bottom: 22, right: 22, borderBottom: '1px solid', borderRight: '1px solid' }} aria-hidden="true" />

      <div className="ht-content pointer-events-none relative z-10 flex min-h-screen flex-col px-6 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col">
          <div className="ht-in ht-in-0 ht-front flex items-center justify-between pt-10 pb-6 text-[11px] uppercase" style={{ ...mono, color: '#9a8e78', letterSpacing: '0.22em' }}>
            <span className="hidden sm:inline">Ambr — Agent Mandate &amp; Binding Registry</span>
            <span className="hidden sm:block" style={{ color: '#c6a87c' }}>Est. on Base L2 · MMXXVI</span>
          </div>
          <div className="ht-rule" aria-hidden="true" />

          <div className="flex flex-1 items-center py-10">
            <div className="ht-front max-w-[820px]">
              <p className="ht-in ht-in-1 mb-7 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>
                № 001 — The accountability record for autonomous agents
              </p>
              <h1 className="ht-head" style={serif}>
                <span className="block">Your AI is</span>
                <span className="block">about to act</span>
                <span className="ht-ink block">in your name.</span>
              </h1>
              <div className="ht-in ht-in-2 mt-10 max-w-md">
                <p className="text-[15px] leading-relaxed" style={{ color: '#cfc8ba' }}>
                  Every act leaves a fossil. An <span style={{ color: '#f4f4f0' }}>Agent Mandate</span> records
                  who authorized it, in what scope, under which law. Readable as
                  prose, executable as code, revocable on record.
                </p>
              </div>
              <div className="ht-in ht-in-3 pointer-events-auto mt-9 flex flex-wrap items-center gap-7">
                <a href="/activate" className="ht-cta inline-flex items-center border px-8 py-3.5 text-[12px] uppercase" style={{ ...mono, letterSpacing: '0.18em', color: '#c6a87c', borderColor: 'rgba(198,168,124,0.7)', background: 'rgba(10,10,10,0.3)' }}>
                  <span>Get an API key →</span>
                </a>
                <a href="https://getamber.dev/reader" className="text-[12px] uppercase" style={{ ...mono, color: '#9a9183', letterSpacing: '0.16em' }}>
                  Verify a live contract
                </a>
              </div>
            </div>
          </div>

          <div className="ht-stage">
            <div ref={hostRef} className="ht-canvas" aria-hidden="true">
              {still && <StillMandate />}
            </div>
            {!still && (
              <button
                type="button"
                className="ht-hit"
                aria-pressed={apart}
                aria-label={apart ? 'Put the mandate back together' : 'Take the mandate apart into its layers'}
                onClick={() => engineRef.current?.toggleApart()}
              />
            )}
            {!still && (
              <ol ref={railRef} className="ht-rail" aria-label="States of a mandate">
                {STATES.map((s, i) => (
                  <li key={s}>
                    <button type="button" onClick={() => engineRef.current?.goto(i)}>{s}</button>
                  </li>
                ))}
                <li style={{ ['--p' as string]: 0 }}>
                  <button type="button" className="ht-apart" aria-pressed={apart} onClick={() => engineRef.current?.toggleApart()}>
                    {apart ? 'Put it back together' : 'Take it apart'}
                  </button>
                </li>
              </ol>
            )}
          </div>

          <div className="ht-rule" aria-hidden="true" />
          <div className="ht-front grid grid-cols-1 gap-px pb-10 pt-7 sm:grid-cols-3">
            {[
              ['01', 'Authorize', 'Scopes · governing law · time windows'],
              ['02', 'Act', 'A mandate both sides can trust'],
              ['03', 'Prove', 'Revocable, with the full history on record'],
            ].map(([n, t, d], i) => (
              <div key={n} className={`ht-in ht-in-${4 + i} flex items-baseline gap-4 ${i === 0 ? '' : 'sm:pl-8'}`}>
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
