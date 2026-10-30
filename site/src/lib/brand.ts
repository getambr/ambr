/**
 * Centralized brand constants — single source of truth for all brand strings.
 * Change the name here and it propagates everywhere.
 */

export const BRAND = {
  name: 'Ambr',
  tagline: 'The liability record for autonomous agents',
  shortTagline: 'Agent Mandate & Binding Registry',
  legalDisclaimer: 'Ambr is the Agent Mandate & Binding Registry — infrastructure, not a law firm. Generated contracts are not legal advice.',
  copyright: (year: number) => `\u00A9 ${year} Ambr. All rights reserved.`,
  domains: {
    marketing: 'https://ambr.run',
    platform: 'https://getamber.dev',
  },
  social: {
    twitter: 'https://x.com/ambr_run',
    github: 'https://github.com/getambr/ambr',
    // Discord removed 2026-09-10: the invite is dead. Both HjvJFfjr and getambr
    // return {"message":"Unknown Invite","code":10006}. A dead invite 301s to a
    // Discord marketing page that returns 200, so a naive link checker passes it
    // and every visitor who clicks lands on an advert. Restore only with a live
    // invite - and note it was published in JSON-LD sameAs, so a wrong value here
    // is asserted to crawlers as an official account.
  },
  emails: {
    privacy: 'privacy@ambr.run',
    legal: 'hello@ambr.run',
    support: 'hello@ambr.run',
  },
} as const;
