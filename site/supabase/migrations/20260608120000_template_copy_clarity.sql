-- Clarify the public /templates descriptions so D1 (two-sided), P2 (one-sided)
-- and C1 (commerce, not delegation) are distinguishable at a glance.
-- Display-only copy on templates.description — no schema/logic change.

UPDATE public.templates SET description =
  'Two-sided delegation: you and your AI agent each sign, so the agent holds its own on-chain proof it may act for you — useful when it must show that authority to a third party. Covers action categories, spending caps and revocation. Structured with reference to UETA s. 14 (US) and eIDAS Art. 25 (EU).'
WHERE slug = 'd1-general-auth';

UPDATE public.templates SET description =
  'A commercial agreement to buy and use an API: the buyer''s agent and the API provider agree pricing, rate limits, SLA and payment (x402). This is API commerce — not a delegation of authority.'
WHERE slug = 'c1-api-access';

UPDATE public.templates SET description =
  'One-sided power of attorney: you sign once and it activates immediately — the fastest way to authorize your own AI agent, with no second signature to chase. A single cNFT mints to you as proof. Optional spending caps.'
WHERE slug = 'p2-power-of-attorney';
