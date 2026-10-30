import { ImageResponse } from 'next/og';
import { OG } from '@/lib/og/og-constants';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') ?? 'Ambr Protocol';
  const label = searchParams.get('label') ?? '';
  const description = searchParams.get('description') ?? '';
  const domain = searchParams.get('domain') ?? OG.defaultDomain;

  // Load fonts
  const [instrumentSerifData, jetBrainsMonoData] = await Promise.all([
    fetch(new URL('../../../lib/og/fonts/InstrumentSerif-Regular.ttf', import.meta.url)).then(
      (res) => res.arrayBuffer()
    ),
    fetch(new URL('../../../lib/og/fonts/JetBrainsMono-Regular.ttf', import.meta.url)).then(
      (res) => res.arrayBuffer()
    ),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: OG.width,
          height: OG.height,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: OG.bg,
          padding: '60px',
          fontFamily: 'JetBrains Mono',
        }}
      >
        {/* Logo + brand name — real AmbrMark (brass shell + spark) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <svg width="40" height="40" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="amg" x1="24" y1="12" x2="76" y2="86" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#9a7d52" />
                <stop offset="0.5" stopColor="#c6a87c" />
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
            <g stroke="#c6a87c" strokeWidth={0.9} opacity={0.55}>
              <line x1="50" y1="52" x2="40" y2="39" />
              <line x1="50" y1="52" x2="62" y2="45" />
              <line x1="50" y1="52" x2="56" y2="65" />
            </g>
            <g fill="#c6a87c" opacity={0.55}>
              <circle cx="40" cy="39" r="1.9" />
              <circle cx="62" cy="45" r="1.6" />
              <circle cx="56" cy="65" r="1.5" />
            </g>
            <path
              d="M50 43 C50.9 50 52.7 51.7 60 52.5 C52.7 53.3 50.9 55 50 62 C49.1 55 47.3 53.3 40 52.5 C47.3 51.7 49.1 50 50 43 Z"
              fill="#e8d9bb"
            />
          </svg>
          <span
            style={{
              fontFamily: 'Instrument Serif',
              fontSize: '30px',
              color: OG.textPrimary,
            }}
          >
            Ambr
          </span>
        </div>

        {/* Separator */}
        <div
          style={{
            width: '100%',
            height: '1px',
            backgroundColor: OG.border,
            marginTop: '40px',
            marginBottom: '40px',
          }}
        />

        {/* Label */}
        {label && (
          <div
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: '14px',
              color: OG.accent,
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              marginBottom: '16px',
            }}
          >
            {label}
          </div>
        )}

        {/* Title */}
        <div
          style={{
            fontFamily: 'Instrument Serif',
            fontSize: title.length > 40 ? '40px' : '48px',
            color: OG.textPrimary,
            lineHeight: 1.15,
            marginBottom: '16px',
          }}
        >
          {title}
        </div>

        {/* Description */}
        {description && (
          <div
            style={{
              fontFamily: 'Instrument Serif',
              fontSize: '24px',
              color: OG.textSecondary,
              lineHeight: 1.45,
              maxWidth: '820px',
            }}
          >
            {description.length > 120 ? description.slice(0, 117) + '...' : description}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flexGrow: 1 }} />

        {/* Footer separator */}
        <div
          style={{
            width: '100%',
            height: '1px',
            backgroundColor: OG.border,
            marginBottom: '24px',
          }}
        />

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: '13px',
              color: OG.textSecondary,
            }}
          >
            {domain}
          </span>
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: '13px',
              color: OG.textSecondary,
            }}
          >
            {OG.tagline}
          </span>
        </div>
      </div>
    ),
    {
      width: OG.width,
      height: OG.height,
      fonts: [
        {
          name: 'Instrument Serif',
          data: instrumentSerifData,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'JetBrains Mono',
          data: jetBrainsMonoData,
          style: 'normal',
          weight: 400,
        },
      ],
    }
  );
}
