import { describe, it, expect } from 'vitest';
import { serverErrorMessage } from '@/lib/wallet/server-error';

describe('serverErrorMessage', () => {
  it('passes the server message through unchanged', () => {
    const message =
      'No wallet is named for the principal side of this contract, so only its creator can sign for it.';
    expect(serverErrorMessage({ error: 'principal_slot_restricted', message })).toBe(message);
  });

  it('falls back when the body has no usable message', () => {
    expect(serverErrorMessage(null)).toBe('Signing failed');
    expect(serverErrorMessage({})).toBe('Signing failed');
    expect(serverErrorMessage({ message: '  ' })).toBe('Signing failed');
    expect(serverErrorMessage({ message: 42 }, 'Nope')).toBe('Nope');
  });
});
