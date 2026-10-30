/**
 * Card templates — the fixed parts of each register, so a post only has to
 * supply what actually varies.
 *
 * Three registers, deliberately different altitudes:
 *   mechanics — product mechanic, technical, carries a metadata line
 *   milestone — a shipping beat, one bold statement, minimal support
 *   founder   — first person, a question rather than a claim, bylined
 */

import { OG } from '@/lib/og/og-constants';

export type TemplateName = 'mechanics' | 'milestone' | 'founder';

export interface TemplateDefaults {
  eyebrow: string;
  footL: string;
  footR: string;
  /** Founder cards read as a person speaking, so the left footer is a byline
   *  and takes the accent colour rather than the muted one. */
  bylineFooter: boolean;
}

export const TEMPLATES: Record<TemplateName, TemplateDefaults> = {
  mechanics: {
    eyebrow: '§ — Mechanics',
    footL: '@ambr_run',
    footR: 'The liability record for autonomous agents',
    bylineFooter: false,
  },
  milestone: {
    eyebrow: '§ — Milestone',
    footL: '@ambr_run',
    footR: OG.tagline,
    bylineFooter: false,
  },
  founder: {
    eyebrow: '§ — Founder note',
    footL: 'Ilvers Sermols · Founder',
    footR: OG.defaultDomain,
    bylineFooter: true,
  },
};

export const FORMATS = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1350 },
} as const;

export type FormatName = keyof typeof FORMATS;

export function isTemplateName(v: string | null): v is TemplateName {
  return v === 'mechanics' || v === 'milestone' || v === 'founder';
}

export function isFormatName(v: string | null): v is FormatName {
  return v === 'square' || v === 'wide' || v === 'portrait';
}
