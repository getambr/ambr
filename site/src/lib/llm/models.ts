/**
 * LLM model selection for Ambr surfaces.
 *
 * Contract generation has stricter requirements (tool use reliability,
 * legal-text quality) than general Q&A. Different surfaces route to
 * different models — and now different providers — based on the
 * LLM_PROVIDER env var.
 */

import { getActiveProvider } from './providers';
import type { ProviderName } from './providers/types';

// Contract generator (POST /api/v1/contracts) — high-stakes, legal output.
// Provider-aware as of 2026-05-19: Anthropic Haiku stayed the default through
// v1, but a 36-hour Anthropic credit outage that silently broke ALL contract
// deploys forced us to route this surface through the same LLM_PROVIDER toggle
// as chat. Kimi K2.6 takes over when LLM_PROVIDER=moonshot. The `kimi-k2.6`
// model handles the `create_contract` tool fine because it's the only tool
// passed (router downgrades force-specific tool_choice to 'auto' on Moonshot).
const CONTRACT_MODELS: Record<ProviderName, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  moonshot: 'kimi-k2.6',
};

export function getContractModel(): string {
  return CONTRACT_MODELS[getActiveProvider()];
}

// Backward-compat: the legacy `CONTRACT_GENERATION_MODEL` constant is still
// imported from a couple of older call sites. Resolves at import time to the
// provider-active value. Prefer `getContractModel()` for live switchability.
export const CONTRACT_GENERATION_MODEL = CONTRACT_MODELS.anthropic;

// Provider-aware chat model IDs. Verified strings from each provider's docs.
const MODELS: Record<ProviderName, { deploy: string; ask: string }> = {
  anthropic: {
    // Sonnet 5 for deploy — the Ambr Agent's classifier/deploy model. Misclassification
    // → wrong template → wrong legal effect, so the Sonnet tier is worth the cost vs Haiku
    // for classification reliability. (Sonnet 5 defaults to ADAPTIVE thinking when the
    // `thinking` field is omitted — unlike 4.6, which ran thinking-off — so the Anthropic
    // adapter sends `thinking: { type: 'disabled' }` for Sonnet-5-class models to keep the
    // interactive classifier snappy. The template-lock handles first-turn misclassification.)
    deploy: 'claude-sonnet-5',
    // Haiku 4.5 for ask: volume-constrained surface, no deployment authority.
    ask: 'claude-haiku-4-5-20251001',
  },
  moonshot: {
    // Kimi K2.6 for both modes. ~4–8x cheaper than Sonnet per turn
    // (counting cache hits on the stable system prompt) and OpenAI-compatible
    // tool-use. Verified model ID 'kimi-k2.6' from platform.kimi.ai docs.
    deploy: 'kimi-k2.6',
    ask: 'kimi-k2.6',
  },
};

export function getChatDeployModel(): string {
  return MODELS[getActiveProvider()].deploy;
}

export function getChatAskModel(): string {
  return MODELS[getActiveProvider()].ask;
}

// Backward-compat exports — the chat route still references these by name.
// They resolve at import time, so they reflect the LLM_PROVIDER active at
// server boot. Since Next.js serverless functions are short-lived this is
// effectively per-deploy: changing the env var requires a redeploy OR you
// can use the getters above for live-switchable behaviour. The route uses
// the getters for clarity.
export const CHAT_DEPLOY_MODEL = MODELS.anthropic.deploy;
export const CHAT_ASK_MODEL = MODELS.anthropic.ask;
