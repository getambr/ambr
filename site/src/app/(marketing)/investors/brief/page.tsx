import { Metadata } from 'next';
import { JetBrains_Mono, Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { isInvestorAuthenticated } from '@/lib/investor-auth';
import { loadInvestorFigures } from '@/lib/investor-figures';
import { BRAND } from '@/lib/brand';
import { DISPLAY, MICRO, EDITORIAL, serif, mono } from '@/lib/type';
import Eyebrow from '@/components/ui/Eyebrow';
import Hairline from '@/components/ui/Hairline';
import InvestorGate from '@/components/investors/InvestorGate';

/**
 * /investors/brief — the one-pager.
 *
 * The deck is 15 slides and /investors is a full package; this is the thing
 * neither of those is: something forwardable that reads in 90 seconds. It is
 * also the PDF source — scripts/render-brief.mjs prints this exact page, so
 * the emailed attachment and the live link cannot drift apart.
 *
 * Every figure here is loaded from the gated figures file; unverified numbers
 * are deliberately absent.
 */

/**
 * A static instance of JetBrains Mono, loaded only for this page.
 *
 * The root layout loads it without a `weight`, which yields a VARIABLE font.
 * Chrome's --print-to-pdf does not reliably embed variable fonts, so every mono
 * label would silently fall back to Times in the PDF, while Instrument Serif,
 * pinned to weight 400 in the layout and hence static, embeds fine. Pinning a weight
 * here gives a static face for the print path without touching the shared
 * layout and re-rendering every other page's fonts.
 */
const bodyPrint = Inter({
  variable: '--font-inter-print',
  subsets: ['latin'],
  weight: ['400', '500'], // static instances; the layout's Inter is variable
  display: 'block',
});

const monoPrint = JetBrains_Mono({
  variable: '--font-mono-print',
  subsets: ['latin'],
  weight: '400',
  display: 'block', // block, not swap — never print a fallback mid-swap
});

export const metadata: Metadata = {
  title: 'Investor Brief | Ambr',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InvestorBriefPage() {
  const cookieHeader = (await cookies()).toString();
  const fakeRequest = new Request('https://getamber.dev/investors/brief', {
    headers: { cookie: cookieHeader },
  });

  if (!isInvestorAuthenticated(fakeRequest)) {
    return <InvestorGate />;
  }

  const figures = await loadInvestorFigures();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main
      className={`brief-root ${monoPrint.variable} ${bodyPrint.variable}`}
      style={{
        background: EDITORIAL.bg,
        color: EDITORIAL.text,
        ...mono,
        // Point the shared mono token at the static face for this page only.
        // Eyebrow, MICRO.* and everything in @/lib/type resolve through
        // --font-jetbrains-mono, so redefining it here fixes them all at once
        // without editing a single component.
        ['--font-jetbrains-mono' as string]: 'var(--font-mono-print)',
        // Inter is variable in the layout too, and variable faces do not embed
        // in Chrome's PDF export — body copy was falling back to Times exactly
        // as the mono labels did.
        ['--font-inter' as string]: 'var(--font-inter-print)',
      }}
    >
      <style>{`
        /* A4 width, but NO fixed height and NO overflow:hidden.
           An earlier version clamped to 296mm and clipped — which does force
           one page, but silently amputates whatever does not fit, and a brief
           that quietly loses its disclaimer is worse than a brief that runs to
           two pages. Length is allowed to breathe; sections avoid breaking
           across the fold instead. */
        @page { size: 210mm 297mm; margin: 0; }
        .brief-page {
          width: 210mm;
          padding: 12mm 14mm;
          box-sizing: border-box;
          display: flex; flex-direction: column;
        }
        /* Keep a section and its heading together rather than splitting a
           stat grid or a heading from its body across a page break. */
        .brief-page > div { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          /* The app shell's own margins/padding sit outside .brief-page and
             will push past the page box on their own. Reset them for print. */
          html, body { margin: 0 !important; padding: 0 !important; background: #0a0a0a !important; }
          .brief-root { margin: 0 !important; padding: 0 !important; display: block !important; }
          /* (marketing)/layout.tsx wraps children in #main-content with pt-16
             and appends <Footer/>. That 64px push alone tips the page box over
             into a second page, and the footer adds a whole block after it. */
          #main-content { padding: 0 !important; margin: 0 !important; }
          nav, footer, header { display: none !important; }
        }
        @media screen {
          .brief-root { display: flex; justify-content: center; padding: 32px 0; }
          .brief-page { outline: 1px solid rgba(198,168,124,0.2); }
        }
      `}</style>
      <div className="brief-page">
        {/* ── Masthead ── */}
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <span style={{ ...serif, fontSize: '1.6rem', color: EDITORIAL.text }}>Ambr</span>
            <span className="text-[10px] uppercase" style={MICRO.numeral}>
              Investor Brief
            </span>
          </div>
          <span className="text-[10px] uppercase" style={MICRO.numeral}>
            Confidential · {today}
          </span>
        </div>

        <div className="mt-5"><Hairline /></div>

        {/* ── What it is ── */}
        <div className="mt-5">
          <Eyebrow>§ 01 — What it is</Eyebrow>
          <h1 className="mt-4" style={{ ...DISPLAY.section, maxWidth: '18ch' }}>
            The liability record for{' '}
            <span style={{ color: EDITORIAL.brass }}>autonomous agents.</span>
          </h1>
          <p className="mt-5 text-[13px] leading-relaxed" style={{ color: EDITORIAL.lead, maxWidth: '68ch' }}>
            Ambr is the Agent Mandate &amp; Binding Registry. It issues the authorization an AI agent
            acts under — human-readable legal text and machine-parsable JSON bound by one SHA-256
            hash, signed by both parties and minted as paired cNFTs on Base mainnet. When an agent
            acts in someone&apos;s name, the mandate says who authorized it, what it covered, and
            whether it was still valid.
          </p>
        </div>

        {/* ── Status ── */}
        <div className="mt-5">
          <Hairline />
          <div className="mt-4"><Eyebrow>§ 02 — Where it stands</Eyebrow></div>
          <div className="mt-5 grid grid-cols-4 gap-px" style={{ background: EDITORIAL.gridLine, border: `1px solid ${EDITORIAL.gridLine}` }}>
            <Stat label="Status" value="Live" note="Base mainnet, since Mar 2026" />
            {figures.brief.status.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} note={s.note} />
            ))}
            <Stat label="Initial markets" value="US · EU" note="jurisdiction-neutral by design" />
          </div>
        </div>

        {/* ── Model ── */}
        <div className="mt-5">
          <Hairline />
          <div className="mt-4"><Eyebrow>§ 03 — The model</Eyebrow></div>
          <p className="mt-4 text-[12px] leading-relaxed" style={{ color: EDITORIAL.detail, maxWidth: '70ch' }}>
            {figures.brief.modelNote}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-px" style={{ background: EDITORIAL.gridLine, border: `1px solid ${EDITORIAL.gridLine}` }}>
            {[figures.model.years.y1, figures.model.years.y2, figures.model.years.y3].map((y) => (
              <div key={y.label} className="p-5" style={{ background: EDITORIAL.inset }}>
                <span className="text-[10px] uppercase" style={MICRO.numeral}>{y.label}</span>
                <div className="mt-3" style={{ ...serif, fontSize: '1.5rem', color: EDITORIAL.text }}>{y.revenue}</div>
                <div className="mt-1 text-[11px]" style={{ color: EDITORIAL.brass }}>{y.ebitda}</div>
                <div className="mt-2 text-[11px]" style={{ color: EDITORIAL.detail }}>{y.share}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed" style={{ color: EDITORIAL.detail, maxWidth: '70ch' }}>
            {figures.model.reconciliation2028}
          </p>
        </div>

        {/* ── The ask ── */}
        <div className="mt-5">
          <Hairline />
          <div className="mt-4"><Eyebrow>§ 04 — The ask</Eyebrow></div>
          <h2 className="mt-4" style={{ ...serif, fontSize: '2.4rem', lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            <span style={{ color: EDITORIAL.brass }}>{figures.ask.round}</span> seed at{' '}
            <span style={{ color: EDITORIAL.brass }}>{figures.ask.cap}</span> cap.
          </h2>
          <p className="mt-2" style={{ ...serif, fontSize: '1.35rem', lineHeight: 1.2, color: EDITORIAL.text }}>
            Minimum cheque <span style={{ color: EDITORIAL.brass }}>{figures.ask.minCheque}</span>.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: EDITORIAL.lead, maxWidth: '70ch' }}>
            {figures.ask.subhead}
          </p>
        </div>

        {/* ── Liquidity ──
            Every figure comes from figures.liquidity; safeCaveat and lowClause
            must render with triggers. */}
        <div className="mt-5">
          <Hairline />
          <div className="mt-4"><Eyebrow>§ 05 — Liquidity</Eyebrow></div>
          <p className="mt-4 text-[13px] leading-relaxed" style={{ color: EDITORIAL.lead, maxWidth: '70ch' }}>
            Today&apos;s {figures.ask.cap} cap is{' '}
            <span style={{ color: EDITORIAL.brass }}>{figures.liquidity.capMultiple}</span> the
            model&apos;s M36 ARR of {figures.model.m36Arr} {figures.liquidity.pricingClause} A cap
            re-rating is planned for the{' '}
            {figures.liquidity.window} window, gated on three triggers, not on a date:
          </p>
          <ul className="mt-4 grid grid-cols-3 gap-4">
            {figures.liquidity.triggers.map((t) => (
              <li key={t.label} className="p-4" style={{ background: EDITORIAL.inset, border: `1px solid ${EDITORIAL.gridLine}` }}>
                <div style={{ ...serif, fontSize: '1.3rem', color: EDITORIAL.brass }}>{t.threshold}</div>
                <div className="mt-1 text-[11px]" style={{ color: EDITORIAL.text }}>{t.label}</div>
                <div className="mt-1 text-[10px]" style={{ color: EDITORIAL.detail }}>{t.model}</div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed" style={{ color: EDITORIAL.lead, maxWidth: '70ch' }}>
            {figures.liquidity.conversionLine}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            {[
              ['Exit', figures.liquidity.exitNote],
              ['Hold', figures.liquidity.holdNote],
            ].map(([label, body]) => (
              <div key={label} className="p-4" style={{ background: EDITORIAL.inset, border: `1px solid ${EDITORIAL.gridLine}` }}>
                <div className="text-[10px]" style={{ ...mono, color: EDITORIAL.brass, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{label}</div>
                <p className="mt-2 text-[11px] leading-relaxed" style={{ color: EDITORIAL.text }}>{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed" style={{ color: EDITORIAL.detail, maxWidth: '70ch' }}>
            {figures.liquidity.safeCaveat} {figures.liquidity.lowClause}{' '}
            <span style={{ color: EDITORIAL.brass }}>{figures.liquidity.footer}</span>
          </p>
        </div>

        {/* ── Team + contact ── */}
        <div className="mt-5">
          <Hairline />
          <div className="mt-6 flex items-start justify-between gap-8">
            <div>
              <Eyebrow>§ 06 — Team</Eyebrow>
              <p className="mt-4 text-[12px] leading-relaxed" style={{ color: EDITORIAL.lead, maxWidth: '46ch' }}>
                {figures.brief.team}
              </p>
              <p className="mt-2 text-[11px]" style={{ color: EDITORIAL.detail }}>
                OMRA Corp., Delaware C-Corp
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Eyebrow>Contact</Eyebrow>
              <p className="mt-4 text-[12px]" style={{ ...mono, color: EDITORIAL.brass }}>investors@ambr.run</p>
              <p className="mt-1 text-[12px]" style={{ ...mono, color: EDITORIAL.detail }}>getamber.dev</p>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="mt-5">
          <Hairline />
          <p className="mt-4 text-[10px] leading-relaxed" style={{ color: EDITORIAL.detail }}>
            {BRAND.legalDisclaimer} Forward-looking figures are modelled on the BASE scenario and are
            not a forecast of actual results. Confidential — not for distribution.
          </p>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="p-5" style={{ background: EDITORIAL.inset }}>
      <span className="text-[10px] uppercase" style={MICRO.numeral}>{label}</span>
      <div className="mt-3" style={{ ...serif, fontSize: '1.5rem', color: EDITORIAL.brass }}>{value}</div>
      <div className="mt-1 text-[10px] leading-snug" style={{ color: EDITORIAL.detail }}>{note}</div>
    </div>
  );
}
