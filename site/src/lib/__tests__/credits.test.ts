import { describe, it, expect } from 'vitest';
import {
  creditsAfterBurn,
  hasEnoughCredits,
  insufficientCreditsBody,
} from '../credits';
import { FREE_TIER_CREDITS } from '../pricing';

describe('credit burn (1 credit = 1 cent)', () => {
  it('subtracts the template price from the balance', () => {
    expect(creditsAfterBurn(FREE_TIER_CREDITS, 20)).toBe(480);
    expect(creditsAfterBurn(500, 250)).toBe(250);
  });

  it('can burn the balance to exactly zero but never below', () => {
    expect(creditsAfterBurn(100, 100)).toBe(0);
    expect(creditsAfterBurn(99, 100)).toBeNull();
    expect(creditsAfterBurn(0, 20)).toBeNull();
  });

  it('leaves legacy unlimited keys (-1) untouched', () => {
    expect(creditsAfterBurn(-1, 250)).toBe(-1);
    expect(hasEnoughCredits(-1, 250)).toBe(true);
  });

  it('rejects a key that cannot pay with a 402-shaped body', () => {
    expect(hasEnoughCredits(19, 20)).toBe(false);
    expect(hasEnoughCredits(20, 20)).toBe(true);
    expect(insufficientCreditsBody(250, 100)).toEqual({
      error: 'insufficient_credits',
      required: 250,
      available: 100,
    });
  });
});
