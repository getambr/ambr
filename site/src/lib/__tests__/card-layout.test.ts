import { describe, it, expect } from 'vitest';
import { layoutCard, footerExtents, type CardSpec } from '@/lib/cards/layout';
import { measureLine, SERIF_METRICS, MONO_METRICS } from '@/lib/cards/measure';

const FORMATS = [
  { name: 'square 1080', width: 1080, height: 1080 },
  { name: 'wide 1200x630', width: 1200, height: 630 },
  { name: 'portrait 1080x1350', width: 1080, height: 1350 },
];

const COPY = {
  short: {
    eyebrow: '§ — Milestone',
    headline: 'Live on Base mainnet.',
    sub: 'Agent Mandates signed, hashed, and minted as paired cNFTs.',
    footL: '@ambr_run',
    footR: 'Agent Mandate & Binding Registry',
  },
  typical: {
    eyebrow: '§ 02 — Mechanics',
    headline: 'One contract, two readers.',
    sub: 'Human-readable legal text and machine-parsable JSON, linked by a single SHA-256 hash.',
    monoLine: 'contract_type: "delegation_of_authority" · sha256: a1b2c3…',
    footL: '@ambr_run',
    footR: 'The liability record for autonomous agents',
  },
  long: {
    eyebrow: '§ — Founder note',
    // The exact string that overflowed the old generator. 46 characters, which
    // its `length > 46` ladder rounded UP to the larger size.
    headline: 'Who is liable when an agent acts in your name?',
    sub: 'Two months designing one hash instead of two. The argument, what it protects, and why the alternative quietly moves liability onto the person least able to carry it.',
    footL: 'Ilvers Sermols · Founder',
    footR: 'ambr.run',
  },
} as const;

function spec(format: (typeof FORMATS)[number], copy: Record<string, string | undefined>): CardSpec {
  return { width: format.width, height: format.height, ...copy } as CardSpec;
}

describe('layoutCard — the regression that motivated this', () => {
  it('fits the founder card that used to overflow by ~20px', () => {
    const l = layoutCard(spec(FORMATS[1], COPY.long));
    expect(l.fits).toBe(true);
    expect(l.bodyHeight).toBeLessThanOrEqual(l.availableBody);
  });

  it('sizes the founder headline from both axes, not width alone', () => {
    const l = layoutCard(spec(FORMATS[1], COPY.long));
    // Old behaviour: 1200 * 0.072 = 86px, which did not fit in 630px of height.
    expect(l.headlineSize).toBeLessThan(86);
    // Geometric mean of 1200x630 is ~869, so the ceiling is ~69px.
    expect(l.headlineSize).toBeLessThanOrEqual(Math.ceil(Math.sqrt(1200 * 630) * 0.08));
  });

  it('does not shrink a square card just because the wide one needed it', () => {
    const wide = layoutCard(spec(FORMATS[1], COPY.typical));
    const square = layoutCard(spec(FORMATS[0], COPY.typical));
    expect(square.headlineSize).toBeGreaterThan(wide.headlineSize);
  });
});

describe('layoutCard — every format x copy combination', () => {
  for (const format of FORMATS) {
    for (const [label, copy] of Object.entries(COPY)) {
      it(`${format.name} / ${label} copy fits its band`, () => {
        const l = layoutCard(spec(format, copy));
        expect(l.fits).toBe(true);
        expect(l.bodyHeight).toBeLessThanOrEqual(l.availableBody);
        expect(l.bodyTop).toBeGreaterThanOrEqual(l.bodyAreaTop);
      });

      it(`${format.name} / ${label} anchors the block to the lower edge`, () => {
        const l = layoutCard(spec(format, copy));
        // The whole composition: text weight sits low, void above is deliberate.
        expect(l.bodyTop + l.bodyHeight).toBe(l.bodyAreaBottom);
      });

      it(`${format.name} / ${label} keeps every line inside the measure`, () => {
        const l = layoutCard(spec(format, copy));
        for (const line of l.headlineLines) {
          const w = measureLine(line, {
            metrics: SERIF_METRICS,
            fontSize: l.headlineSize,
            lineHeight: 1.08,
          });
          expect(w).toBeLessThanOrEqual(l.contentWidth);
        }
        for (const line of l.subLines) {
          const w = measureLine(line, { metrics: SERIF_METRICS, fontSize: l.subSize, lineHeight: 1.4 });
          expect(w).toBeLessThanOrEqual(l.contentWidth);
        }
      });

      it(`${format.name} / ${label} keeps the footer clear of the frame`, () => {
        const l = layoutCard(spec(format, copy));
        const c = copy as { footL: string; footR: string };
        const { left, right } = footerExtents(l, c.footL, c.footR);
        // Footer sits between the padding on both sides and must not collide
        // in the middle.
        expect(left + right).toBeLessThanOrEqual(l.contentWidth);
        expect(l.footerTop + l.footerSize).toBeLessThanOrEqual(l.height - l.pad + 1);
      });

      it(`${format.name} / ${label} keeps corner ticks outside the content box`, () => {
        const l = layoutCard(spec(format, copy));
        // The old generator placed ticks at pad-12, only 12px clear of the
        // content — which is how the bottom-left tick ended up sitting on top
        // of the founder card's overflowing sub-heading.
        expect(l.tickInset + l.tickSize).toBeLessThan(l.pad);
      });
    }
  }
});

describe('layoutCard — degenerate input', () => {
  it('absorbs a long headline by stepping down rather than clipping', () => {
    // 120 words genuinely fits once the loop shrinks the face — worth pinning,
    // because it proves the fit loop is doing the work rather than the copy
    // happening to be short.
    const l = layoutCard({
      width: 1200,
      height: 630,
      headline: 'word '.repeat(120).trim(),
      footL: 'a',
      footR: 'b',
    });
    expect(l.fits).toBe(true);
    expect(l.bodyHeight).toBeLessThanOrEqual(l.availableBody);
    const big = layoutCard({ width: 1200, height: 630, headline: 'Short.', footL: 'a', footR: 'b' });
    expect(l.headlineSize).toBeLessThan(big.headlineSize);
  });

  it('reports fits:false rather than silently clipping when nothing works', () => {
    const l = layoutCard({
      width: 1200,
      height: 630,
      headline: 'word '.repeat(900).trim(),
      footL: 'a',
      footR: 'b',
    });
    // Past the smallest step the layout must SAY it failed — the contact-sheet
    // assertions rely on this to catch a card that would ship clipped.
    expect(l.fits).toBe(false);
    expect(l.bodyHeight).toBeGreaterThan(l.availableBody);
    expect(l.headlineLines.length).toBeGreaterThan(0);
  });

  it('handles a headline with no spaces without looping forever', () => {
    const l = layoutCard({
      width: 1080,
      height: 1080,
      headline: 'a'.repeat(200),
      footL: 'a',
      footR: 'b',
    });
    expect(l.headlineLines).toHaveLength(1);
  });

  it('drops the eyebrow and mono line from the budget when absent', () => {
    const withExtras = layoutCard({ ...COPY.typical, width: 1080, height: 1080 } as CardSpec);
    const bare = layoutCard({
      width: 1080,
      height: 1080,
      headline: COPY.typical.headline,
      sub: COPY.typical.sub,
      footL: 'a',
      footR: 'b',
    });
    expect(bare.bodyHeight).toBeLessThan(withExtras.bodyHeight);
  });
});

describe('measureLine', () => {
  it('accounts for letter-spacing, which the eyebrow uses at 0.28em', () => {
    const base = { metrics: MONO_METRICS, fontSize: 20, lineHeight: 1 };
    const plain = measureLine('MECHANICS', base);
    const tracked = measureLine('MECHANICS', { ...base, letterSpacing: 0.28 });
    expect(tracked).toBeGreaterThan(plain);
    expect(tracked - plain).toBeCloseTo(0.28 * 20 * 9, 5);
  });

  it('measures a monospace string as exactly n x advance', () => {
    const w = measureLine('abcd', { metrics: MONO_METRICS, fontSize: 100, lineHeight: 1 });
    expect(w).toBeCloseTo(4 * 0.6 * 100, 5);
  });

  it('measures proportional text proportionally', () => {
    const style = { metrics: SERIF_METRICS, fontSize: 100, lineHeight: 1 };
    expect(measureLine('iiii', style)).toBeLessThan(measureLine('mmmm', style));
  });
});
