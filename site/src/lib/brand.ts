/**
 * Centralized brand constants — single source of truth for all brand strings.
 * Change the name here and it propagates everywhere.
 */

export const BRAND = {
  name: 'Ambr',
  tagline: 'The Legal Framework for AI Agents Acting in the Real World',
  shortTagline: 'The Agreement Layer for the AI Agent Economy',
  legalDisclaimer: 'Ambr is contract infrastructure, not a law firm. Generated contracts are not legal advice.',
  copyright: (year: number) => `\u00A9 ${year} Ambr. All rights reserved.`,
  domains: {
    marketing: 'https://ambr.run',
    platform: 'https://getamber.dev',
  },
  social: {
    twitter: 'https://x.com/ambr_run',
    github: 'https://github.com/getambr/ambr',
    discord: 'https://discord.gg/HjvJFfjr',
  },
  emails: {
    privacy: 'privacy@ambr.run',
    legal: 'hello@ambr.run',
    support: 'hello@ambr.run',
  },
} as const;
