/**
 * Anchored-editorial card layout.
 *
 * Replaces a generator whose every dimension derived from WIDTH alone
 * (`headSize = w * 0.072`). On a square that accidentally worked; on the
 * 1200x630 founder card the type came out ~1.9x too large for the height
 * available and overflowed its body box by ~20px, so the sub-heading collided
 * with the bottom hairline and a corner tick. The same fault inverted on the
 * squares: the body only centred in whatever space was left over, leaving
 * ~240px of dead field above and below. One cause, both symptoms — there was
 * no composition, only leftover space.
 *
 * Two changes fix that class of bug rather than the instance:
 *   1. Size from a basis that respects BOTH axes — the geometric mean.
 *      1080x1080 -> 1080; 1200x630 -> 869, which alone takes the founder
 *      headline from 86px to 62px.
 *   2. Measure and fit, rather than guess from character count. The loop steps
 *      a modular scale down until the composed block genuinely fits.
 *
 * The composition anchors the text block to the lower third with an open field
 * above, so the void is deliberate and reads like the deck's title slides.
 */

import { SERIF_METRICS, MONO_METRICS, measureBlock, measureLine, type TextStyle } from './measure';

export interface CardSpec {
  width: number;
  height: number;
  eyebrow?: string;
  headline: string;
  sub?: string;
  /** Optional metadata line, set in mono. */
  monoLine?: string;
  footL: string;
  footR: string;
}

/* ─── proportions, all relative to the basis ─── */
const R = {
  pad: 0.075,
  mark: 0.042,
  wordmark: 0.030,
  eyebrow: 0.017,
  mono: 0.0155,
  footer: 0.0145,
  gapHeaderRule: 0.05,
  /** Between the last body line and the footer rule. Without this the anchored
   *  block sits flush against the hairline — descenders on the sub-heading and
   *  the mono metadata line both ended up touching it. */
  gapBodyRule: 0.042,
  gapRuleFooter: 0.03,
  gapEyebrow: 0.020,
  gapSub: 0.022,
  gapMono: 0.024,
  tick: 0.0065,
  /** Corner ticks sit this far inside the frame — comfortably outside the
   *  content box, which is what stopped them colliding with text. */
  tickInset: 0.033,
} as const;

/** Sub-heading tracks the headline so the hierarchy ratio stays fixed as the
 *  fit loop shrinks things. */
const SUB_RATIO = 0.38;
const LH = { headline: 1.08, sub: 1.4, eyebrow: 1, mono: 1, footer: 1 } as const;

/** Sub-heading measures narrower than the headline — long lines of a 1.4
 *  line-height serif get hard to track at full width. */
const SUB_MEASURE = 0.86;

const HEADLINE_MAX = 0.080;
const HEADLINE_MIN = 0.028;
const STEP = 1.05;

export interface CardLayout {
  width: number;
  height: number;
  basis: number;
  pad: number;
  markSize: number;
  wordmarkSize: number;
  eyebrowSize: number;
  headlineSize: number;
  subSize: number;
  monoSize: number;
  footerSize: number;
  tickSize: number;
  tickInset: number;
  gapHeaderRule: number;
  gapBodyRule: number;
  gapRuleFooter: number;
  gapEyebrow: number;
  gapSub: number;
  gapMono: number;
  headlineLines: string[];
  subLines: string[];
  contentWidth: number;
  /** Vertical space between the two hairlines. */
  availableBody: number;
  bodyHeight: number;
  /** Where the anchored block starts, measured from the top of the card. */
  bodyTop: number;
  bodyAreaTop: number;
  bodyAreaBottom: number;
  footerTop: number;
  /** False when even the smallest step overflows — the contact-sheet
   *  assertions treat this as a failure rather than shipping a clipped card. */
  fits: boolean;
}

export function layoutCard(spec: CardSpec): CardLayout {
  const { width, height } = spec;
  // Geometric mean: equal to the side on a square, and pulled down by the
  // short axis on a landscape card, which is exactly the correction needed.
  const basis = Math.sqrt(width * height);

  const pad = Math.round(basis * R.pad);
  const markSize = Math.round(basis * R.mark);
  const wordmarkSize = Math.round(basis * R.wordmark);
  const eyebrowSize = Math.round(basis * R.eyebrow);
  const monoSize = Math.round(basis * R.mono);
  const footerSize = Math.round(basis * R.footer);
  const gapHeaderRule = Math.round(basis * R.gapHeaderRule);
  const gapBodyRule = Math.round(basis * R.gapBodyRule);
  const gapRuleFooter = Math.round(basis * R.gapRuleFooter);
  const gapEyebrow = Math.round(basis * R.gapEyebrow);
  const gapSub = Math.round(basis * R.gapSub);
  const gapMono = Math.round(basis * R.gapMono);

  const contentWidth = width - pad * 2;
  const headerHeight = Math.max(markSize, Math.round(wordmarkSize * 1.2));
  const footerHeight = Math.round(footerSize * LH.footer);

  // Everything that is NOT the body block, so the body's budget is computed
  // rather than hoped for.
  const bodyAreaTop = pad + headerHeight + gapHeaderRule + 1;
  const footerTop = height - pad - footerHeight;
  const bodyAreaBottom = footerTop - gapRuleFooter - 1 - gapBodyRule;
  const availableBody = bodyAreaBottom - bodyAreaTop;

  const eyebrowHeight = spec.eyebrow ? Math.round(eyebrowSize * LH.eyebrow) + gapEyebrow : 0;
  const monoHeight = spec.monoLine ? Math.round(monoSize * LH.mono) + gapMono : 0;

  const compose = (headlineSize: number) => {
    const subSize = Math.round(headlineSize * SUB_RATIO);
    const headStyle: TextStyle = {
      metrics: SERIF_METRICS,
      fontSize: headlineSize,
      lineHeight: LH.headline,
    };
    const head = measureBlock(spec.headline, headStyle, contentWidth);

    let subLines: string[] = [];
    let subHeight = 0;
    if (spec.sub) {
      const subStyle: TextStyle = { metrics: SERIF_METRICS, fontSize: subSize, lineHeight: LH.sub };
      const measured = measureBlock(spec.sub, subStyle, contentWidth * SUB_MEASURE);
      subLines = measured.lines;
      subHeight = measured.height + gapSub;
    }

    return {
      headlineSize,
      subSize,
      headlineLines: head.lines,
      subLines,
      bodyHeight: eyebrowHeight + head.height + subHeight + monoHeight,
    };
  };

  // Descending scan. Height is monotonic in font size — a smaller face fits
  // more characters per line AND makes each line shorter — so the first size
  // that fits is the largest one that does.
  const max = basis * HEADLINE_MAX;
  const min = basis * HEADLINE_MIN;
  let chosen = compose(Math.round(min));
  let fits = false;

  for (let size = max; size >= min; size /= STEP) {
    const candidate = compose(Math.round(size));
    if (candidate.bodyHeight <= availableBody) {
      chosen = candidate;
      fits = true;
      break;
    }
  }

  return {
    width,
    height,
    basis,
    pad,
    markSize,
    wordmarkSize,
    eyebrowSize,
    headlineSize: chosen.headlineSize,
    subSize: chosen.subSize,
    monoSize,
    footerSize,
    tickSize: Math.round(basis * R.tick),
    tickInset: Math.round(basis * R.tickInset),
    gapHeaderRule,
    gapBodyRule,
    gapRuleFooter,
    gapEyebrow,
    gapSub,
    gapMono,
    headlineLines: chosen.headlineLines,
    subLines: chosen.subLines,
    contentWidth,
    availableBody,
    bodyHeight: chosen.bodyHeight,
    // Anchored: the block sits at the BOTTOM of its area, so the open field
    // lands above it. `justifyContent: flex-end` in the renderer mirrors this.
    bodyTop: bodyAreaBottom - chosen.bodyHeight,
    bodyAreaTop,
    bodyAreaBottom,
    footerTop,
    fits,
  };
}

/** Widest rendered line of the footer pair — used by the collision assertions. */
export function footerExtents(layout: CardLayout, footL: string, footR: string) {
  const style: TextStyle = { metrics: MONO_METRICS, fontSize: layout.footerSize, lineHeight: LH.footer };
  return { left: measureLine(footL, style), right: measureLine(footR, style) };
}
