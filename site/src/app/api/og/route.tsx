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
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Logo + brand name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${OG.accent}, #a08860)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: OG.bg,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: 'Instrument Serif',
              fontSize: '24px',
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
              fontSize: '18px',
              color: OG.textSecondary,
              lineHeight: 1.5,
              maxWidth: '800px',
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
