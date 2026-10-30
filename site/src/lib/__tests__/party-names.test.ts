import { describe, it, expect } from 'vitest';
import { extractPartyNames } from '../contract/party-names';

// The NFT image, the reader and the dashboard pass contracts.contract_type to
// extractPartyNames. It holds the template category, never a slug, so every
// category must take the field-name fallback, as 'commerce' always has.
describe('extractPartyNames given a contract_type category', () => {
  // Distinct names per field, so each slug branch would give a different answer.
  const params = { principal_name: 'Acme', consumer_name: 'Bea', buyer_name: 'Cy', provider_name: 'Dee', seller_name: 'Eve' };

  it.each(['consumer', 'commerce', 'delegation'])('%s takes the field-name fallback', (category) => {
    expect(extractPartyNames(category, params)).toEqual({ principalName: 'Acme', counterpartyName: 'Dee' });
  });
});
