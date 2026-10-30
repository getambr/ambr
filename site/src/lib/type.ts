/**
 * Editorial type + colour tokens.
 *
 * These were copy-pasted, byte-identical, into five marketing pages
 * (`founders`, `how-it-works`, `use-cases`, `ecosystem`, `waitlist`) as local
 * consts. Extracted so `/templates` and `/activate` can adopt the same
 * vocabulary without becoming a sixth and seventh copy.
 *
 * Why literal hexes rather than the Tailwind tokens: the editorial pages were
 * built this way and `globals.css` only exposes a subset. `EDITORIAL.detail`
 * (#8a8170) and `EDITORIAL.inset` (#0c0b09) have no `@theme` equivalent at all.
 * Reconciling the two systems is a larger job than this pass.
 */

export const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
export const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

export const EDITORIAL = {
  /** Page ground. */
  bg: '#0a0a0a',
  /** Inset panel ground — a shade warmer than the page. */
  inset: '#0c0b09',
  text: '#f4f4f0',
  brass: '#c6a87c',
  /** Lead paragraphs, directly under a heading. */
  lead: '#a39b8c',
  /** Secondary detail, card body copy, ghost links. */
  detail: '#8a8170',
  /** Hairline grid gutters and their border. */
  gridLine: 'rgba(198,168,124,0.14)',
  /** Bordered panels (the apply form). */
  panelBorder: 'rgba(198,168,124,0.3)',
} as const;

/**
 * Fluid display scale. Sizes are `clamp()` so they track the viewport rather
 * than stepping at breakpoints — a static Tailwind scale is one of the tells
 * that separates the older platform pages from these.
 */
export const DISPLAY = {
  /** Page h1. */
  hero: { ...serif, fontSize: 'clamp(2.8rem, 6vw, 5.5rem)', lineHeight: 0.95, letterSpacing: '-0.03em' },
  /** Section h2. */
  section: { ...serif, fontSize: 'clamp(2rem, 4vw, 3.4rem)', lineHeight: 1.0, letterSpacing: '-0.02em' },
  /** Panel h2 — slightly tighter, used inside a bordered block. */
  panel: { ...serif, fontSize: 'clamp(1.9rem, 3.6vw, 3rem)', lineHeight: 1.02, letterSpacing: '-0.02em' },
  /** Closing CTA h2. */
  cta: { ...serif, fontSize: 'clamp(2.4rem, 5vw, 4rem)', lineHeight: 0.95, letterSpacing: '-0.02em' },
  /** Card h3. */
  card: { ...serif, fontSize: '1.5rem', lineHeight: 1.1, color: EDITORIAL.text },
} as const;

/** Mono micro-labels. Tracking is the signature — 0.3em on eyebrows. */
export const MICRO = {
  eyebrow: { ...mono, color: EDITORIAL.brass, letterSpacing: '0.3em' },
  /** Ghost links beside a primary button. */
  ghost: { ...mono, color: EDITORIAL.detail, letterSpacing: '0.16em' },
  /** Card numerals (01, 02, …). */
  numeral: { ...mono, color: EDITORIAL.detail, letterSpacing: '0.16em' },
} as const;

/** Section padding + measure, matching the editorial pages exactly. */
export const SECTION_PAD = 'px-6 py-24 sm:px-10 lg:px-16';
export const MEASURE = 'mx-auto max-w-[1200px]';
export const MEASURE_NARROW = 'mx-auto max-w-[1000px]';
