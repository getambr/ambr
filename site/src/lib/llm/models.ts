/**
 * LLM model selection for Ambr surfaces.
 *
 * Contract generation has stricter requirements (tool use reliability,
 * legal-text quality) than general Q&A. Different surfaces route to
 * different models behind the same ANTHROPIC_API_KEY.
 */

// Contract generator (POST /api/v1/contracts) — high-stakes, legal output.
// Stays on Haiku 4.5 for v1 since the template system prompt does most of the
// legal work and Haiku reliably emits structured tool-call output.
export const CONTRACT_GENERATION_MODEL = 'claude-haiku-4-5-20251001';

// Deploy chat (POST /api/v1/chat mode=deploy) — high-stakes classification.
// Sonnet 4.6 because misclassification → wrong template → wrong legal effect.
// Worth ~5x the per-turn cost vs Haiku given the contract revenue per session.
export const CHAT_DEPLOY_MODEL = 'claude-sonnet-4-6';

// Ask chat (POST /api/v1/chat mode=ask) — low-stakes general Q&A.
// Haiku 4.5 because the volume here is the constraint (we promise "5 AI msgs/day"
// free, "unlimited" paid) and there's no deployment authority on this path.
export const CHAT_ASK_MODEL = 'claude-haiku-4-5-20251001';
