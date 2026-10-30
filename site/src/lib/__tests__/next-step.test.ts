import { describe, it, expect } from 'vitest';
import { mcpNextStepLines, nextStepAfterCreate } from '@/lib/contract/next-step';

describe('next step after creation', () => {
  it('a bilateral contract needs both parties', () => {
    expect(nextStepAfterCreate(false)).toMatch(/both parties must sign/);
    expect(mcpNextStepLines(false)[0]).toMatch(/Both parties must sign/);
  });

  it('a one-sided contract is activated by the principal alone', () => {
    const rest = nextStepAfterCreate(true);
    expect(rest).toMatch(/Only the principal signs/);
    expect(rest).not.toMatch(/both parties/i);
    const lines = mcpNextStepLines(true);
    expect(lines[0]).toMatch(/Only the principal signs/);
    expect(lines.join('\n')).not.toMatch(/both parties/i);
    expect(lines).toHaveLength(3);
  });
});
