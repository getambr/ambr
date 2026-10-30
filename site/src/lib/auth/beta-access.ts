import { isAdmin } from '@/lib/admin-emails';
import type { ApiKeyContext, BetaFeatures } from '@/lib/api-auth';

/**
 * Beta features that can be granted per-account via the admin UI.
 * Keep in sync with `BetaFeatures` keys in `api-auth.ts`.
 */
export type BetaFeature = keyof Required<BetaFeatures>;

export type BetaAccessReason = 'admin' | 'beta_flag' | 'denied';

/**
 * Source-of-truth gate for any beta feature. Call from API routes BEFORE
 * doing privileged work. The `reason` is suitable for audit logging.
 *
 * Admin emails (per `admin-emails.ts`) bypass the per-account flag — they
 * always see every beta. Non-admins need the explicit flag in the
 * `beta_features` JSONB column on their `api_keys` row.
 */
export function checkBetaAccess(
  apiCtx: ApiKeyContext | null,
  feature: BetaFeature,
): { allowed: boolean; reason: BetaAccessReason } {
  if (!apiCtx) return { allowed: false, reason: 'denied' };

  if (isAdmin(apiCtx.email)) {
    return { allowed: true, reason: 'admin' };
  }

  if (apiCtx.betaFeatures?.[feature] === true) {
    return { allowed: true, reason: 'beta_flag' };
  }

  return { allowed: false, reason: 'denied' };
}
