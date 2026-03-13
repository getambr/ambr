import { describe, it, expect } from 'vitest';
import { getTemplatePrompt } from '../llm/prompts';

describe('getTemplatePrompt', () => {
  const templateSlugs = [
    'd1-general-auth',
    'd2-limited-service',
    'd3-fleet-auth',
    'c1-api-access',
    'c2-compute-sla',
    'c3-task-execution',
  ];

  for (const slug of templateSlugs) {
    describe(`template: ${slug}`, () => {
      it('returns a non-empty prompt', () => {
        const prompt = getTemplatePrompt(slug);
        expect(prompt.length).toBeGreaterThan(100);
      });

      it('includes mandatory elements', () => {
        const prompt = getTemplatePrompt(slug);
        expect(prompt).toContain('humanReadable');
        expect(prompt).toContain('machineReadable');
        expect(prompt).toContain('Principal Declaration');
        expect(prompt).toContain('IETF ADP');
        expect(prompt).toContain('SHA-256');
        expect(prompt).toContain('primacy');
        expect(prompt).toContain('SIGNATURE BLOCK');
      });

      it('includes electronic agent formation recital references', () => {
        const prompt = getTemplatePrompt(slug);
        expect(prompt).toContain('Electronic Transactions Act');
        expect(prompt).toContain('UETA');
        expect(prompt).toContain('eIDAS');
      });

      it('includes governing law reference', () => {
        const prompt = getTemplatePrompt(slug);
        expect(prompt).toContain('governing_law');
      });
    });
  }

  describe('legacy slug mapping', () => {
    it('maps "delegation" to d1-general-auth', () => {
      const legacy = getTemplatePrompt('delegation');
      const direct = getTemplatePrompt('d1-general-auth');
      expect(legacy).toBe(direct);
    });

    it('maps "commerce" to c1-api-access', () => {
      const legacy = getTemplatePrompt('commerce');
      const direct = getTemplatePrompt('c1-api-access');
      expect(legacy).toBe(direct);
    });

    it('maps "service-agreement" to c2-compute-sla', () => {
      const legacy = getTemplatePrompt('service-agreement');
      const direct = getTemplatePrompt('c2-compute-sla');
      expect(legacy).toBe(direct);
    });

    it('maps "nda" to c3-task-execution', () => {
      const legacy = getTemplatePrompt('nda');
      const direct = getTemplatePrompt('c3-task-execution');
      expect(legacy).toBe(direct);
    });
  });

  describe('unknown slug', () => {
    it('returns custom contract fallback', () => {
      const prompt = getTemplatePrompt('nonexistent-template');
      expect(prompt).toContain('Custom Contract');
      expect(prompt).toContain('Principal Declaration');
      expect(prompt).toContain('IETF ADP');
    });
  });
});
