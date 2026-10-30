import { resolveTemplate } from './infer-template';
import { normalizeLimitParams } from './optional-limits';
import { applyStatedWallets } from './wallet-intent';

/**
 * The deterministic part of a classify turn: which template is locked and what
 * the merged parameters are. Kept apart from the route so it can be tested
 * without a model.
 *
 * Rules kept here:
 *   - a locked template is never replaced, and a model-supplied template that is
 *     not a real one is ignored;
 *   - fields set by a UI control are never overwritten by the model;
 *   - below the confidence floor the model's parameters are ignored;
 *   - a wallet the user typed with an explicit label (never one the model wrote)
 *     fills an empty own-wallet or agent-wallet field even when the model did
 *     not extract it, and a later statement corrects an earlier one;
 *   - spending caps are numbers or absent.
 */
export function mergeClassifiedTurn(input: {
  messages: { role: 'user' | 'assistant'; content: string; fromModel?: boolean }[];
  templateSoFar: string | null;
  rawTemplate: unknown;
  confidence: number;
  confidenceFloor: number;
  extractedSoFar: Record<string, unknown>;
  newExtracted: Record<string, unknown>;
  confirmedFields: ReadonlySet<string>;
}): { template: string | null; merged: Record<string, unknown> } {
  const { messages, templateSoFar, rawTemplate, confidence, confidenceFloor, extractedSoFar, newExtracted, confirmedFields } = input;

  const protectedExtracted: Record<string, unknown> = { ...newExtracted };
  for (const k of confirmedFields) delete protectedExtracted[k];

  const accepted = confidence >= confidenceFloor;
  const combined = accepted ? { ...extractedSoFar, ...protectedExtracted } : extractedSoFar;

  const template = resolveTemplate({ templateSoFar, rawTemplate, messages, params: combined });
  const merged = applyStatedWallets({
    template,
    params: normalizeLimitParams(combined),
    messages,
    confirmedFields,
  });
  return { template, merged };
}
