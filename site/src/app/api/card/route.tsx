/**
 * GET /api/card — brand-locked social cards, generated from code.
 *
 * Not an AI image model: the same Satori pipeline that renders /api/og, driven
 * by the measured layout in lib/cards/layout.ts. Deterministic templates are
 * what keep a hundred posts reading as one identity — the thing generators
 * cannot hold across a set.
 *
 * Params:
 *   template  mechanics | milestone | founder   (default mechanics)
 *   format    square | wide | portrait          (default square)
 *   headline  required
 *   sub, eyebrow, mono, footL, footR            optional overrides
 *
 * Example:
 *   /api/card?template=founder&format=wide&headline=Who%20is%20liable%3F
 */

import { ImageResponse } from 'next/og';
import { OG, OG_FONTS } from '@/lib/og/og-constants';
import { layoutCard } from '@/lib/cards/layout';
import { TEMPLATES, FORMATS, isTemplateName, isFormatName } from '@/lib/cards/templates';

export const runtime = 'edge';

const MAX_LEN = 240;

function clamp(v: string | null, fallback = ''): string {
  if (!v) return fallback;
  return v.length > MAX_LEN ? v.slice(0, MAX_LEN) : v;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const templateName = isTemplateName(searchParams.get('template'))
    ? (searchParams.get('template') as 'mechanics' | 'milestone' | 'founder')
    : 'mechanics';
  const formatName = isFormatName(searchParams.get('format'))
    ? (searchParams.get('format') as 'square' | 'wide' | 'portrait')
    : 'square';

  const t = TEMPLATES[templateName];
  const { width, height } = FORMATS[formatName];

  const headline = clamp(searchParams.get('headline'), 'One contract, two readers.');
  const sub = clamp(searchParams.get('sub'));
  const eyebrow = clamp(searchParams.get('eyebrow'), t.eyebrow);
  const monoLine = clamp(searchParams.get('mono'));
  const footL = clamp(searchParams.get('footL'), t.footL);
  const footR = clamp(searchParams.get('footR'), t.footR);

  const L = layoutCard({ width, height, eyebrow, headline, sub, monoLine, footL, footR });

  const [serifData, monoData] = await Promise.all([
    fetch(new URL('../../../lib/og/fonts/InstrumentSerif-Regular.ttf', import.meta.url)).then((r) =>
      r.arrayBuffer(),
    ),
    fetch(new URL('../../../lib/og/fonts/JetBrainsMono-Regular.ttf', import.meta.url)).then((r) =>
      r.arrayBuffer(),
    ),
  ]);

  const tick = (pos: Record<string, number | string>) => (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        width: L.tickSize,
        height: L.tickSize,
        ...pos,
      }}
    />
  );
  const B = { width: 1, style: 'solid' as const, color: OG.accent };

  return new ImageResponse(
    (
      <div
        style={{
          width,
          height,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundColor: OG.bg,
          padding: L.pad,
          fontFamily: OG_FONTS.mono,
        }}
      >
        {/* Full-bleed brass edge, echoing the deck slides */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            display: 'flex',
            width: '100%',
            height: 3,
            backgroundColor: OG.accent,
            opacity: 0.5,
          }}
        />

        {/* Corner ticks — placed off the FRAME inset, not the padding, which is
            what stopped them landing on top of the text. */}
        {tick({ top: L.tickInset, left: L.tickInset, borderTopWidth: B.width, borderTopStyle: B.style, borderTopColor: B.color, borderLeftWidth: B.width, borderLeftStyle: B.style, borderLeftColor: B.color })}
        {tick({ top: L.tickInset, right: L.tickInset, borderTopWidth: B.width, borderTopStyle: B.style, borderTopColor: B.color, borderRightWidth: B.width, borderRightStyle: B.style, borderRightColor: B.color })}
        {tick({ bottom: L.tickInset, left: L.tickInset, borderBottomWidth: B.width, borderBottomStyle: B.style, borderBottomColor: B.color, borderLeftWidth: B.width, borderLeftStyle: B.style, borderLeftColor: B.color })}
        {tick({ bottom: L.tickInset, right: L.tickInset, borderBottomWidth: B.width, borderBottomStyle: B.style, borderBottomColor: B.color, borderRightWidth: B.width, borderRightStyle: B.style, borderRightColor: B.color })}

        {/* Header lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(L.basis * 0.013) }}>
          <svg width={L.markSize} height={L.markSize} viewBox="0 0 100 100">
            <defs>
              <linearGradient id="amg" x1="24" y1="12" x2="76" y2="86" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={OG.accentDark} />
                <stop offset="0.5" stopColor={OG.accent} />
                <stop offset="1" stopColor="#8a6f48" />
              </linearGradient>
            </defs>
            <path
              d="M51 12 C39 20 31 38 29 52 C27 71 39 86 50 86 C62 86 72 71 71 53 C70 38 64 21 51 12 Z"
              fill="none"
              stroke="url(#amg)"
              strokeWidth={2.4}
              strokeLinejoin="round"
            />
            <g stroke={OG.accent} strokeWidth={0.9} opacity={0.55}>
              <line x1="50" y1="52" x2="40" y2="39" />
              <line x1="50" y1="52" x2="62" y2="45" />
              <line x1="50" y1="52" x2="56" y2="65" />
            </g>
            <g fill={OG.accent} opacity={0.55}>
              <circle cx="40" cy="39" r="1.9" />
              <circle cx="62" cy="45" r="1.6" />
              <circle cx="56" cy="65" r="1.5" />
            </g>
            <path
              d="M50 43 C50.9 50 52.7 51.7 60 52.5 C52.7 53.3 50.9 55 50 62 C49.1 55 47.3 53.3 40 52.5 C47.3 51.7 49.1 50 50 43 Z"
              fill={OG.accentLight}
            />
          </svg>
          <span style={{ display: 'flex', fontFamily: OG_FONTS.serif, fontSize: L.wordmarkSize, color: OG.textPrimary }}>
            {OG.siteName}
          </span>
        </div>

        <div style={{ display: 'flex', width: '100%', height: 1, backgroundColor: OG.hairline, marginTop: L.gapHeaderRule }} />

        {/* Body — anchored low, so the open field above is deliberate rather
            than whatever space happened to be left over. */}
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end' }}>
          {eyebrow ? (
            <div
              style={{
                display: 'flex',
                fontFamily: OG_FONTS.mono,
                fontSize: L.eyebrowSize,
                color: OG.accent,
                textTransform: 'uppercase',
                letterSpacing: '0.28em',
                marginBottom: L.gapEyebrow,
              }}
            >
              {eyebrow}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontFamily: OG_FONTS.serif,
              fontSize: L.headlineSize,
              color: OG.textPrimary,
              lineHeight: 1.08,
              letterSpacing: '-0.01em',
            }}
          >
            {L.headlineLines.map((line, i) => (
              <div key={i} style={{ display: 'flex' }}>{line}</div>
            ))}
          </div>

          {L.subLines.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontFamily: OG_FONTS.serif,
                fontSize: L.subSize,
                color: OG.taupe,
                lineHeight: 1.4,
                marginTop: L.gapSub,
              }}
            >
              {L.subLines.map((line, i) => (
                <div key={i} style={{ display: 'flex' }}>{line}</div>
              ))}
            </div>
          ) : null}

          {monoLine ? (
            <div
              style={{
                display: 'flex',
                fontFamily: OG_FONTS.mono,
                fontSize: L.monoSize,
                color: OG.textSecondary,
                marginTop: L.gapMono,
              }}
            >
              {monoLine}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 1,
            backgroundColor: OG.hairline,
            marginTop: L.gapBodyRule,
            marginBottom: L.gapRuleFooter,
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', fontFamily: OG_FONTS.mono, fontSize: L.footerSize, color: t.bylineFooter ? OG.accent : OG.textSecondary }}>
            {footL}
          </span>
          <span style={{ display: 'flex', fontFamily: OG_FONTS.mono, fontSize: L.footerSize, color: OG.textSecondary }}>
            {footR}
          </span>
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: [
        { name: OG_FONTS.serif, data: serifData, style: 'normal', weight: 400 },
        { name: OG_FONTS.mono, data: monoData, style: 'normal', weight: 400 },
      ],
    },
  );
}
