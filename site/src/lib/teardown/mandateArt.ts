/**
 * Canvas artwork for the hero mandate. Every layer is drawn in the same 768x1024 frame, so when the
 * layers sit stacked they read as one finished document, and when they come apart each plate carries
 * only its own part. Drawing is deterministic (no Math.random) so any frame can be reproduced.
 */

export type Fonts = { serif: string; sans: string; mono: string };

export const ART_W = 768;
export const ART_H = 1024;
const PAD = 64;

export const STATES = ['Drafted', 'Terms written', 'Signed', 'Hashed', 'Anchored on Base', 'Executed'] as const;

/** A fixed example fingerprint (the sample mandate is not a real contract). */
export const HASH = (() => {
  let s = 0x2f6b1c3d;
  let o = '';
  for (let i = 0; i < 64; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    o += (s >>> 28).toString(16);
  }
  return o;
})();

const CLAUSES = [
  "The Principal authorizes the Agent to buy cloud compute in the Principal's name.",
  'Each purchase stays inside the spend cap set in the schedule.',
  'Only the counterparties listed in the schedule may be paid.',
  'The mandate expires 90 days after signing. The Principal can revoke it at any time, on record.',
  'Governing law and venue are named in the schedule.',
];

const TERMS: [string, string][] = [
  ['scope', 'compute.purchase'],
  ['spend cap', 'per month, set by Principal'],
  ['counterparties', '3 listed providers'],
  ['expires', '90 days after signing'],
];

type Line = { text: string; font: string; color: string; x: number; y: number };
type Pt = [number, number];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function signature(x0: number, y0: number, w: number, seed: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160;
    pts.push([
      x0 + w * t + 14 * Math.sin(t * 22 + seed),
      y0 - 16 * Math.sin(t * 13 + seed * 2) * Math.sin(t * 3.1 + 0.4) - 8 * Math.cos(t * 31 + seed),
    ]);
  }
  return pts;
}

// vertical rhythm of the lower half: schedule, signatures, then the fingerprint above the frame
const SIG_Y = 838;
const SIG_LINE = 860;
const HASH_RULE = 908;
const HASH_Y = 940;

const SIG_A = signature(PAD + 8, SIG_Y, 230, 1.3);
const SIG_B = signature(ART_W / 2 + 24, SIG_Y, 210, 4.1);

export class MandateArt {
  private lines: Line[] | null = null;
  /** Top of the schedule box: a fixed gap below the last clause, set by layout(). */
  private scheduleY = 568;
  private ground: HTMLCanvasElement | null = null;

  constructor(private f: Fonts) {}

  /** The sheet itself: ground, frame, meta line, status chip, and the clauses written up to `write`. */
  paper(ctx: CanvasRenderingContext2D, write: number, statusIdx: number) {
    ctx.clearRect(0, 0, ART_W, ART_H);
    ctx.drawImage(this.sheet(), 0, 0);
    ctx.textBaseline = 'alphabetic';
    ctx.font = `400 15px ${this.f.mono}`;
    ctx.fillStyle = '#8a8170';
    ctx.fillText('AMB-0142 · example', PAD, 96);

    if (statusIdx >= 0) {
      const label = statusIdx === 0 ? 'Drafting' : STATES[statusIdx];
      const live = statusIdx === 5;
      ctx.font = `500 15px ${this.f.mono}`;
      const tw = ctx.measureText(label).width;
      const x = ART_W - PAD - tw - 28;
      ctx.strokeStyle = live ? '#34D399' : 'rgba(198,168,124,0.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, 72, tw + 28, 34);
      ctx.fillStyle = live ? '#34D399' : '#c6a87c';
      ctx.fillText(label, x + 14, 95);
    }

    const lines = this.layout(ctx);
    const total = lines.reduce((a, l) => a + l.text.length, 0);
    let budget = Math.floor(write * total);
    for (const l of lines) {
      if (budget <= 0) break;
      const t = l.text.slice(0, budget);
      budget -= l.text.length;
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(t, l.x, l.y);
      if (budget < 0 && write < 1) {
        // the writing caret sits after the last character written
        ctx.fillStyle = '#c6a87c';
        ctx.fillRect(l.x + ctx.measureText(t).width + 3, l.y - 20, 2, 24);
      }
    }
  }

  /** The schedule plate. */
  terms(ctx: CanvasRenderingContext2D, p: number) {
    ctx.clearRect(0, 0, ART_W, ART_H);
    this.layout(ctx);
    const y0 = this.scheduleY;
    // even inner padding: 34 to the header baseline, 26 under the last row
    ctx.globalAlpha = clamp01(p * 2);
    ctx.strokeStyle = 'rgba(198,168,124,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(PAD, y0, ART_W - PAD * 2, 184);
    ctx.font = `400 15px ${this.f.mono}`;
    ctx.fillStyle = '#c6a87c';
    ctx.fillText('Schedule', PAD + 20, y0 + 34);
    TERMS.forEach(([k, v], i) => {
      const y = y0 + 68 + i * 30;
      ctx.globalAlpha = clamp01(p * 4 - i);
      ctx.fillStyle = '#8a8170';
      ctx.fillText(k, PAD + 20, y);
      ctx.fillStyle = '#e8d9bb';
      ctx.fillText(v, PAD + 220, y);
    });
    ctx.globalAlpha = 1;
  }

  /** The signatures plate: principal first, then the agent. */
  sigs(ctx: CanvasRenderingContext2D, p: number) {
    ctx.clearRect(0, 0, ART_W, ART_H);
    const rows: [Pt[], number, string, number][] = [
      [SIG_A, PAD, 'Principal', clamp01(p * 2)],
      [SIG_B, ART_W / 2 + 16, 'Agent · 0x8f3…c21', clamp01(p * 2 - 1)],
    ];
    for (const [pts, x, label, q] of rows) {
      ctx.strokeStyle = 'rgba(198,168,124,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, SIG_LINE);
      ctx.lineTo(x + 270, SIG_LINE);
      ctx.stroke();
      ctx.font = `400 14px ${this.f.mono}`;
      ctx.fillStyle = '#8a8170';
      ctx.fillText(label, x, SIG_LINE + 24);
      const n = Math.floor(q * pts.length);
      if (n < 2) continue;
      ctx.strokeStyle = '#e8d9bb';
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }

  /** The fingerprint plate: characters settle left to right; the rest cycle with `frame`. */
  hash(ctx: CanvasRenderingContext2D, p: number, frame: number) {
    ctx.clearRect(0, 0, ART_W, ART_H);
    ctx.globalAlpha = clamp01(p * 3);
    ctx.strokeStyle = 'rgba(198,168,124,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, HASH_RULE);
    ctx.lineTo(ART_W - PAD, HASH_RULE);
    ctx.stroke();
    ctx.font = `400 13px ${this.f.mono}`;
    ctx.fillStyle = '#8a8170';
    ctx.fillText('SHA-256', PAD, HASH_Y);
    const settle = Math.floor(p * 64);
    let h = '';
    for (let i = 0; i < 64; i++) h += i < settle ? HASH[i] : '0123456789abcdef'[(i * 7 + frame * 3) % 16];
    ctx.fillStyle = p >= 1 ? '#e8d9bb' : '#c6a87c';
    ctx.fillText(h.slice(0, 32), PAD + 92, HASH_Y);
    ctx.fillText(h.slice(32), PAD + 92, HASH_Y + 20);
    ctx.globalAlpha = 1;
  }

  private sheet() {
    if (this.ground) return this.ground;
    const c = document.createElement('canvas');
    c.width = ART_W;
    c.height = ART_H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#14120f';
    ctx.fillRect(0, 0, ART_W, ART_H);
    // faint paper grain, seeded so it never changes between frames
    let s = 7;
    ctx.fillStyle = 'rgba(232,217,187,0.025)';
    for (let i = 0; i < 1400; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const x = s % ART_W;
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      ctx.fillRect(x, s % ART_H, 2, 2);
    }
    ctx.strokeStyle = 'rgba(198,168,124,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, ART_W - 32, ART_H - 32);
    ctx.strokeStyle = 'rgba(198,168,124,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(28, 28, ART_W - 56, ART_H - 56);
    this.ground = c;
    return c;
  }

  private layout(ctx: CanvasRenderingContext2D) {
    if (this.lines) return this.lines;
    const body = `400 21px ${this.f.sans}`;
    const out: Line[] = [
      { text: 'Agent Mandate', font: `76px ${this.f.serif}`, color: '#f4f4f0', x: PAD, y: 182 },
      { text: 'Between the Principal and the Agent named below.', font: body, color: '#a59c8c', x: PAD, y: 222 },
    ];
    let y = 282;
    ctx.font = body;
    const maxW = ART_W - PAD * 2 - 40;
    CLAUSES.forEach((clause, i) => {
      const rows: string[] = [];
      let line = '';
      for (const w of clause.split(' ')) {
        const t = line ? `${line} ${w}` : w;
        if (ctx.measureText(t).width > maxW && line) {
          rows.push(line);
          line = w;
        } else line = t;
      }
      rows.push(line);
      out.push({ text: String(i + 1), font: `400 17px ${this.f.mono}`, color: '#9a7d52', x: PAD, y });
      for (const r of rows) {
        out.push({ text: r, font: body, color: '#d8d2c6', x: PAD + 40, y });
        y += 30;
      }
      y += 12;
    });
    // y now sits one row and one gap below the last baseline
    this.scheduleY = y - 42 + 28;
    this.lines = out;
    return out;
  }
}
