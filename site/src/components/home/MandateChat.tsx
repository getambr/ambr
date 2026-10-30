'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import Reveal from '@/components/ui/Reveal';
import ContractBackdrop from '@/components/home/ContractBackdrop';
import MandateMorph from '@/components/home/MandateMorph';
import { Send } from 'lucide-react';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

type FieldKey = 'principal' | 'agent' | 'scope' | 'pertx' | 'monthly' | 'duration';

const CHIPS = [
  { id: 'p2', label: 'P2', name: 'Authorize your own agent', price: '$0.20' },
  { id: 'd1', label: 'D1', name: 'Delegate to your agent', price: '$0.50', pick: true },
  { id: 'c3', label: 'A2A', name: 'Agent hires an agent', price: '$1.00' },
];

const TYPED: { agent: string; user: string; field: FieldKey }[] = [
  { agent: 'What should the agent be allowed to do?', user: 'Buy compute and ad-spend — nothing else.', field: 'scope' },
  { agent: "What's the agent's wallet address?", user: '0x20cEE8…db250', field: 'agent' },
  { agent: 'Per-transaction spending cap?', user: '$500', field: 'pertx' },
  { agent: 'Monthly spending limit?', user: '$5,000', field: 'monthly' },
  { agent: 'How many months should it stay valid?', user: '12 months', field: 'duration' },
];
const OPENING = 'Hi — what kind of agreement do you need?';
const FINAL = 'Looks good — ready to deploy when you are.';

const FIELDS: { key: FieldKey; label: string; value: string }[] = [
  { key: 'principal', label: 'Authorizer', value: 'You · connected wallet' },
  { key: 'agent', label: 'Agent wallet', value: '0x20cEE8…db250' },
  { key: 'scope', label: 'Scope', value: 'Compute · ad-spend' },
  { key: 'pertx', label: 'Per-tx cap', value: '$500' },
  { key: 'monthly', label: 'Monthly limit', value: '$5,000' },
  { key: 'duration', label: 'Duration', value: '12 months' },
];

const MANDATE = { contract_type: 'delegation_of_authority', agent: '0x20cEE8…db250', scope: 'compute,ad-spend', per_tx: 500, monthly: 5000, duration_months: 12 };

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Msg = { role: 'agent' | 'user'; content: string };

// agent questions type themselves in (the AI "writing back")
function AgentLine({ content, reduce }: { content: string; reduce: boolean | null }) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (reduce) { const t = setTimeout(() => setShown(content), 0); return () => clearTimeout(t); }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(content.slice(0, i));
      if (i >= content.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [content, reduce]);
  const done = shown.length >= content.length;
  return (
    <>
      {shown}
      {!done && <span style={{ color: '#c6a87c' }}>▋</span>}
    </>
  );
}

export default function MandateChat() {
  const container = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const inputAnchor = useRef<HTMLDivElement>(null);
  const deployRef = useRef<HTMLSpanElement>(null);
  const d1ChipRef = useRef<HTMLButtonElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLDivElement | null>>>({});
  const reduce = useReducedMotion();

  const [cycle, setCycle] = useState(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [chips, setChips] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverChip, setHoverChip] = useState<string | null>(null);
  const [filled, setFilled] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [hash, setHash] = useState('');
  const [ready, setReady] = useState(false);
  const [deployed, setDeployed] = useState(false);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sleep = (ms: number) => new Promise<void>((res) => timers.push(setTimeout(res, ms)));

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const all: Msg[] = [{ role: 'agent', content: OPENING }, { role: 'user', content: 'Authorize an agent.' }];
      TYPED.forEach((e) => { all.push({ role: 'agent', content: e.agent }, { role: 'user', content: e.user }); });
      all.push({ role: 'agent', content: FINAL });
      timers.push(setTimeout(() => {
        if (!alive) return;
        setMsgs(all);
        setSelected('d1');
        setFilled(Object.fromEntries(FIELDS.map((f) => [f.key, true])) as Partial<Record<FieldKey, boolean>>);
        setReady(true);
        setDeployed(true);
        sha256Hex(JSON.stringify(MANDATE)).then((h) => { if (alive) setHash(h); });
      }, 0));
      return () => { alive = false; timers.forEach(clearTimeout); };
    }

    const cur = cursor.current;
    const cursorOn = !!cur && window.matchMedia('(min-width: 1025px)').matches;
    if (cur && cursorOn) {
      gsap.set(cur, { xPercent: -50, yPercent: -50, opacity: 0, x: 80, y: 60 });
    }
    // human-like move: curved path (x/y ease at different rates), distance-based speed,
    // slightly off-centre targeting, never perfectly straight.
    const moveTo = (target: HTMLElement | null | undefined): number => {
      if (!cursorOn || !cur || !target || !container.current) return 0;
      const cr = container.current.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      const tx = tr.left - cr.left + tr.width / 2 + (Math.random() * 16 - 8);
      const ty = tr.top - cr.top + tr.height / 2 + (Math.random() * 12 - 6);
      const cx = (gsap.getProperty(cur, 'x') as number) || 0;
      const cy = (gsap.getProperty(cur, 'y') as number) || 0;
      const dist = Math.hypot(tx - cx, ty - cy);
      // capped, KNOWN travel ceiling so callers can wait for the cursor to actually arrive
      const d = Math.min(0.95, Math.max(0.55, 0.4 + dist / 1400)) + Math.random() * 0.12;
      gsap.to(cur, { x: tx, duration: d, ease: 'power2.inOut', overwrite: 'auto' });
      gsap.to(cur, { y: ty, duration: d * (1.06 + Math.random() * 0.12), ease: 'power2.inOut', overwrite: 'auto' });
      return Math.round((d * 1.18 + 0.12) * 1000);
    };
    const showCursor = () => { if (cursorOn && cur) gsap.to(cur, { opacity: 1, duration: 0.5 }); };
    const click = () => { if (cursorOn && cur) gsap.to(cur, { scale: 0.55, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.inOut' }); };
    const triggerSend = () => {
      const btn = sendRef.current;
      if (!btn) return;
      gsap.fromTo(btn, { scale: 1 }, { scale: 0.86, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.inOut' });
      const icon = btn.querySelector('svg');
      if (icon) gsap.fromTo(icon, { x: 0, y: 0, opacity: 1 }, { x: 7, y: -7, opacity: 0, duration: 0.34, ease: 'power2.in', onComplete: () => { gsap.set(icon, { x: 0, y: 0, opacity: 1 }); } });
    };
    const glowField = (el: HTMLElement | null | undefined) => {
      if (!el) return;
      gsap.fromTo(el, { boxShadow: '0 0 0 rgba(198,168,124,0)' }, { boxShadow: '0 0 14px rgba(198,168,124,0.45)', duration: 0.42, yoyo: true, repeat: 1, ease: 'power2.inOut' });
    };

    const typeUser = async (text: string) => {
      for (let i = 1; i <= text.length; i++) {
        if (!alive) return;
        setTyping(text.slice(0, i));
        // uneven, human cadence — slower, with the odd longer pause after spaces/punctuation
        const ch = text[i - 1];
        const base = 52 + Math.random() * 46;
        await sleep(ch === ' ' || ch === ',' || ch === '.' ? base + 70 + Math.random() * 90 : base);
      }
      await sleep(360);
    };

    const play = async () => {
      while (alive) {
        setCycle((c) => c + 1);
        setMsgs([]); setTyping(null); setReading(false); setChips(false); setSelected(null); setHoverChip(null); setFilled({}); setHash(''); setReady(false); setDeployed(false);
        if (cur) gsap.set(cur, { opacity: 0, scale: 1 });
        await sleep(750);

        // 1) opening + selection
        setMsgs([{ role: 'agent', content: OPENING }]);
        await sleep(950);
        if (!alive) return;
        setChips(true);
        await sleep(700);
        showCursor();
        await sleep(560);
        moveTo(d1ChipRef.current);
        await sleep(1250);            // ARRIVE: clear the travel ceiling before any hover/click
        setHoverChip('d1');
        await sleep(560);             // PAUSE on hover so the highlight reads
        click();
        await sleep(420);             // let the press complete before the state flips
        setSelected('d1');
        setHoverChip(null);
        await sleep(900);             // SETTLE: hold the selected state long enough to read
        setChips(false);
        setMsgs((m) => [...m, { role: 'user', content: 'Authorize an agent — D1.' }]);
        setFilled((f) => ({ ...f, principal: true }));
        glowField(fieldRefs.current.principal);
        moveTo(fieldRefs.current.principal);
        await sleep(1150);

        // 2) typed field interview
        for (const ex of TYPED) {
          if (!alive) return;
          setMsgs((m) => [...m, { role: 'agent', content: ex.agent }]);
          await sleep(900);
          setReading(true);
          await sleep(1000);
          setReading(false);
          const mv = moveTo(inputAnchor.current);
          await sleep((mv || 1150) + 240);   // type only AFTER the cursor reaches the input
          await typeUser(ex.user);
          const sv = moveTo(sendRef.current);   // glide to the Send button
          await sleep((sv || 900) + 220);
          click();
          triggerSend();                         // send-button press + icon whoosh
          await sleep(200);
          setMsgs((m) => [...m, { role: 'user', content: ex.user }]);   // message flies up from the input
          setTyping(null);                       // input clears
          setFilled((f) => ({ ...f, [ex.field]: true }));
          glowField(fieldRefs.current[ex.field]);
          moveTo(fieldRefs.current[ex.field]);
          await sleep(1050);
        }

        // 3) finish
        setReading(true);
        await sleep(950);
        setReading(false);
        setMsgs((m) => [...m, { role: 'agent', content: FINAL }]);
        const h = await sha256Hex(JSON.stringify(MANDATE));
        if (!alive) return;
        setHash(h);
        setReady(true);
        moveTo(deployRef.current);
        await sleep(1250);            // reach the Deploy button before clicking
        click();
        await sleep(280);            // let the click read before the morph takes over
        setDeployed(true);           // deploy click -> the dual-format morph
        if (cur) gsap.to(cur, { opacity: 0, duration: 0.4 });
        await sleep(5600);
      }
    };

    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && !started) { started = true; play(); io.disconnect(); }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => { alive = false; io.disconnect(); timers.forEach(clearTimeout); };
  }, []);

  const msgT = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 240, damping: 24 };
  const fieldT = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 95, damping: 16 };

  return (
    <section className="relative px-6 py-20 sm:px-10 lg:px-16" style={{ background: '#0a0a0a', color: '#f4f4f0' }}>
      <ContractBackdrop active={ready} cycle={cycle} />
      <div className="relative z-10 mx-auto max-w-[1500px]">
        <Reveal><div style={{ height: 1, background: 'linear-gradient(to right, rgba(198,168,124,0.45), transparent)' }} /></Reveal>
        <Reveal delay={0.05}>
          <p className="mt-6 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>Built by conversation</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-4 max-w-2xl" style={{ ...serif, fontSize: 'clamp(1.85rem, 3.6vw, 3rem)', lineHeight: 1.0, letterSpacing: '-0.02em' }}>
            Describe it. The agent drafts the mandate.
          </h2>
        </Reveal>

        <Reveal delay={0.16}>
          <div ref={container} className="relative mx-auto mt-10 grid max-w-[1100px] gap-px overflow-hidden border lg:grid-cols-[1.08fr_0.92fr]" style={{ borderColor: 'rgba(198,168,124,0.3)' }}>
            <motion.div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true" style={{ background: 'radial-gradient(60% 70% at 78% 18%, rgba(198,168,124,0.10), transparent 70%)' }} animate={reduce ? {} : { opacity: [0.6, 1, 0.6] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />

            {/* scripted cursor — filled brass dot (distinct from the page's ring cursor) with a micro-tremor */}
            <style>{`@keyframes mcJit{0%{transform:translate(0,0)}25%{transform:translate(1.4px,-1px)}50%{transform:translate(-1px,1.3px)}75%{transform:translate(1px,1px)}100%{transform:translate(0,0)}}.mc-jit{animation:mcJit 1.7s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.mc-jit{animation:none}}`}</style>
            <div ref={cursor} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-30 hidden lg:block" style={{ opacity: 0 }}>
              <span className="mc-jit block" style={{ width: 12, height: 12, borderRadius: '9999px', background: '#e8d9bb', boxShadow: '0 0 14px rgba(232,217,187,0.7)' }} />
            </div>

            {/* chat */}
            <div className="relative z-10 flex flex-col border-b p-5 sm:p-6 lg:border-b-0 lg:border-r" style={{ borderColor: 'rgba(198,168,124,0.15)' }}>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[10px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.2em' }}>Ambr agent · drafting</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.16em' }}>
                  <motion.span className="h-1.5 w-1.5 rounded-full" style={{ background: '#c6a87c' }} animate={reduce ? {} : { opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} /> live
                </span>
              </div>

              <div className="flex h-[320px] flex-col justify-end gap-2.5 overflow-hidden">
                {msgs.map((m, i) => (
                  <motion.div
                    key={`${cycle}-${i}`}
                    initial={m.role === 'user' ? { opacity: 0, y: 26, scale: 0.9 } : { opacity: 0, y: 14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={msgT}
                    className={`flex shrink-0 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="max-w-[86%] px-3.5 py-2.5 text-[13.5px] leading-relaxed" style={m.role === 'user' ? { background: 'rgba(198,168,124,0.12)', border: '1px solid rgba(198,168,124,0.3)', color: '#f4f4f0' } : { background: '#161512', border: '1px solid rgba(198,168,124,0.14)', color: '#d8d2c6' }}>
                      {m.role === 'agent' ? <AgentLine content={m.content} reduce={reduce} /> : m.content}
                    </div>
                  </motion.div>
                ))}

                <AnimatePresence>
                  {chips && (
                    <motion.div key="chips" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={msgT} className="flex shrink-0 flex-wrap justify-start gap-2">
                      {CHIPS.map((c) => {
                        const active = selected === c.id;
                        const hov = hoverChip === c.id;
                        return (
                          <button
                            key={c.id}
                            ref={c.id === 'd1' ? d1ChipRef : undefined}
                            type="button"
                            tabIndex={-1}
                            className="flex flex-col items-start px-3 py-2 text-left transition-colors duration-300"
                            style={{
                              border: `1px solid ${active || hov ? '#c6a87c' : 'rgba(198,168,124,0.28)'}`,
                              background: active ? 'rgba(198,168,124,0.16)' : hov ? 'rgba(198,168,124,0.08)' : 'transparent',
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <span className="text-[10px]" style={{ ...mono, color: '#c6a87c' }}>{c.label}</span>
                              <span className="text-[9px]" style={{ ...mono, color: '#6f675b' }}>{c.price}</span>
                              {active && <span className="text-[10px]" style={{ color: '#34D399' }}>✓</span>}
                            </span>
                            <span className="mt-0.5 text-[12px]" style={{ color: active ? '#f4f4f0' : '#a39b8c' }}>{c.name}</span>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                {reading && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={msgT} className="flex shrink-0 justify-start">
                    <div className="flex items-center gap-1.5 px-3.5 py-2.5" style={{ background: '#161512', border: '1px solid rgba(198,168,124,0.14)' }}>
                      {[0, 1, 2].map((d) => (<motion.span key={d} className="h-1.5 w-1.5 rounded-full" style={{ background: '#c6a87c' }} animate={reduce ? {} : { opacity: [0.25, 1, 0.25], y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }} />))}
                      <span className="ml-1 text-[11px]" style={{ ...mono, color: '#8a8170' }}>reading…</span>
                    </div>
                  </motion.div>
                )}

              </div>

              {/* input row — the answer types IN here, then the Send button sends it */}
              <div className="mt-3 flex items-stretch gap-2">
                <div ref={inputAnchor} className="flex flex-1 items-center px-3 text-[13px]" style={{ ...mono, color: typing !== null ? '#f4f4f0' : '#4a463e', border: '1px solid rgba(198,168,124,0.14)', background: '#0c0b09', minHeight: '2.6rem' }}>
                  {typing !== null ? (
                    <span>{typing}<motion.span style={{ color: '#c6a87c' }} animate={reduce ? {} : { opacity: [1, 0] }} transition={{ duration: 0.7, repeat: Infinity }}>▋</motion.span></span>
                  ) : (
                    'reply to Ambr…'
                  )}
                </div>
                <button ref={sendRef} type="button" tabIndex={-1} aria-label="Send" className="flex items-center justify-center px-3.5 transition-colors duration-300" style={{ border: `1px solid ${typing ? '#c6a87c' : 'rgba(198,168,124,0.2)'}`, background: typing ? '#c6a87c' : 'transparent', color: typing ? '#0a0a0a' : '#6f675b' }}>
                  <Send className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>

            {/* mandate preview */}
            <div className="relative z-10 flex flex-col p-5 sm:p-6" style={{ background: '#0c0b09' }}>
              <div className="mb-5 flex items-center justify-between px-4">
                <span className="text-[10px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.2em' }}>Agent mandate · D1</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase" style={{ ...mono, color: ready ? '#34D399' : '#4a463e', letterSpacing: '0.16em' }}>
                  <motion.span className="h-1.5 w-1.5 rounded-full" style={{ background: ready ? '#34D399' : '#4a463e' }} animate={reduce || !ready ? {} : { opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
                  {ready ? 'ready' : 'drafting…'}
                </span>
              </div>

              <div className="flex-1">
                {FIELDS.map((f) => (
                  <div key={f.key} ref={(el) => { fieldRefs.current[f.key] = el; }} className="flex items-center justify-between gap-4 border-b px-4 py-3" style={{ borderColor: 'rgba(198,168,124,0.1)' }}>
                    <span className="text-[11px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.12em' }}>{f.label}</span>
                    {filled[f.key] ? (
                      <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={fieldT} className="text-right text-[12px]" style={{ ...mono, color: '#e8d9bb' }}>{f.value}</motion.span>
                    ) : (
                      <motion.span className="h-3 w-28 rounded-sm" style={{ background: 'rgba(198,168,124,0.18)' }} animate={reduce ? {} : { opacity: [0.35, 0.7, 0.35] }} transition={{ duration: 1.4, repeat: Infinity }} />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t pt-4" style={{ borderColor: 'rgba(198,168,124,0.15)' }}>
                <div className="flex items-center justify-between px-4">
                  <span className="text-[10px] uppercase" style={{ ...mono, color: '#6f675b', letterSpacing: '0.14em' }}>SHA-256</span>
                  <span className="text-[11px]" style={{ ...mono, color: ready ? '#c6a87c' : '#4a463e' }}>{hash ? hash.slice(0, 18) + '…' : '— — —'}</span>
                </div>
                <div className="mt-3.5 flex items-center justify-between px-4">
                  <span className="text-[11px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.14em' }}>D1 · delegation · $0.50</span>
                  <motion.span ref={deployRef} animate={ready && !reduce ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 0.5 }} className="px-4 py-2 text-[11px] uppercase" style={{ ...mono, letterSpacing: '0.16em', border: `1px solid ${ready ? '#c6a87c' : 'rgba(198,168,124,0.25)'}`, color: ready ? '#0a0a0a' : '#6f675b', background: ready ? '#c6a87c' : 'transparent', transition: 'background .5s, color .5s, border-color .5s' }}>
                    Deploy →
                  </motion.span>
                </div>
              </div>

              <MandateMorph active={deployed} hash={hash} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
