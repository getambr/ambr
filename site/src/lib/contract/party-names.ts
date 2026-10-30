/**
 * Extract party display names from a contract's parameters JSON, in a
 * template-aware way. Used by the dashboard + reader portal to label
 * each paired cNFT card with the role and name of the party holding it.
 *
 * Templates map party roles to different parameter field names:
 *   A1 service-purchase: principal = consumer, counterparty = provider
 *   C1 api-access:       principal = buyer,    counterparty = seller
 *   D1 general-auth:     principal = principal_name (no second party name)
 *
 * Callers should pass either the template slug OR templateId. We accept
 * both since the dashboard stores `template_id` (uuid) while reader portal
 * code sometimes has the slug at hand.
 */

export interface PartyNames {
  principalName: string | null;
  counterpartyName: string | null;
}

export function extractPartyNames(
  templateSlugOrName: string | null | undefined,
  parameters: Record<string, unknown> | null | undefined,
): PartyNames {
  const params = parameters ?? {};
  const slug = (templateSlugOrName ?? '').toLowerCase();

  // A1 — service purchase: consumer is the principal, provider is counterparty
  if (slug.includes('a1') || slug.includes('service-purchase') || slug.includes('service_purchase')) {
    return {
      principalName: stringOrNull(params.consumer_name),
      counterpartyName: stringOrNull(params.provider_name),
    };
  }

  // C1 — API access: buyer is the principal, seller is counterparty
  if (slug.includes('c1') || slug.includes('api-access') || slug.includes('api_access')) {
    return {
      principalName: stringOrNull(params.buyer_name),
      counterpartyName: stringOrNull(params.seller_name),
    };
  }

  // D1 — general agent authorization: only principal_name is named
  if (slug.includes('d1') || slug.includes('general-auth') || slug.includes('general_auth')) {
    return {
      principalName: stringOrNull(params.principal_name),
      counterpartyName: null,
    };
  }

  // Unknown template — try common field names as a fallback
  return {
    principalName:
      stringOrNull(params.principal_name)
      ?? stringOrNull(params.consumer_name)
      ?? stringOrNull(params.buyer_name)
      ?? null,
    counterpartyName:
      stringOrNull(params.provider_name)
      ?? stringOrNull(params.seller_name)
      ?? null,
  };
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}
