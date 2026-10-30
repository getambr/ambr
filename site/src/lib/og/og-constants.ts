/**
 * Brand tokens for generated images (OG cards at /api/og, social cards at
 * /api/card).
 *
 * These mirror the `@theme` block in src/app/globals.css. They have to be
 * duplicated because Satori never sees the stylesheet — it only knows the
 * values handed to it — but they must not DRIFT. Before this file was
 * completed it held five of the palette's colours and the OG route inlined
 * #e8d9bb and #9a7d52 as literals because they were missing here.
 */
export const OG = {
  width: 1200,
  height: 630,

  // Brand colors — keep in sync with @theme in globals.css
  bg: '#0a0a0a',
  surface: '#111111',
  accent: '#c6a87c',        // --color-amber
  accentLight: '#e8d9bb',   // --color-amber-light
  accentDark: '#9a7d52',    // --color-amber-dark
  textPrimary: '#f4f4f0',   // --color-text-primary
  textSecondary: '#999999', // --color-text-secondary
  taupe: '#aba59a',         // --color-taupe
  border: '#2E2E2E',
  /** Hairline rules on dark grounds — softer than `border`. */
  hairline: '#2a2620',

  // Default content
  siteName: 'Ambr',
  tagline: 'Agent Mandate & Binding Registry',
  defaultDomain: 'ambr.run',
} as const;

/** Font family names as registered with Satori. Only weight 400 exists for both. */
export const OG_FONTS = {
  serif: 'Instrument Serif',
  mono: 'JetBrains Mono',
} as const;
