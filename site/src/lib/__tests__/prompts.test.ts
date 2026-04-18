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
    'a1-service-purchase',
    'a2-ai-subscription',
    'a3-warranty-liability',
    'p1-nda',
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

  describe('a1-service-purchase consumer requirements', () => {
    const prompt = getTemplatePrompt('a1-service-purchase');

    it('includes cooling-off period', () => {
      expect(prompt).toContain('COOLING-OFF');
      expect(prompt).toContain('14');
    });

    it('includes cancellation parity requirement', () => {
      expect(prompt).toContain('cancellation must be as easy as purchase');
    });

    it('includes AI agent disclosure', () => {
      expect(prompt).toContain('EU AI Act Art. 50');
      expect(prompt).toContain('AGENT DISCLOSURE');
    });

    it('includes GDPR data protection notice', () => {
      expect(prompt).toContain('GDPR Art. 13-14');
      expect(prompt).toContain('DATA PROTECTION');
    });

    it('includes consumer rights notice', () => {
      expect(prompt).toContain('CONSUMER RIGHTS');
      expect(prompt).toContain('Consumer Rights Directive');
    });

    it('prohibits exclusion of negligence liability', () => {
      expect(prompt).toContain('UCTA s. 2');
      expect(prompt).toContain('negligence or death');
    });

    it('includes refund policy requirement', () => {
      expect(prompt).toContain('refund_policy');
      expect(prompt).toContain('CANCELLATION AND REFUND');
    });

    it('includes plain-language summary', () => {
      expect(prompt).toContain('PLAIN-LANGUAGE SUMMARY');
    });

    it('includes consumer right to small claims court', () => {
      expect(prompt).toContain('small claims court');
    });

    it('references eIDAS', () => {
      expect(prompt).toContain('eIDAS Art. 25');
    });
  });

  describe('a2-ai-subscription consumer requirements', () => {
    const prompt = getTemplatePrompt('a2-ai-subscription');

    it('includes cooling-off period', () => {
      expect(prompt).toContain('COOLING-OFF');
      expect(prompt).toContain('14');
    });

    it('includes cancellation parity requirement', () => {
      expect(prompt).toContain('cancellation must be as easy as sign-up');
    });

    it('includes AI agent disclosure', () => {
      expect(prompt).toContain('EU AI Act Art. 50');
      expect(prompt).toContain('AGENT DISCLOSURE');
    });

    it('defaults auto-renewal to off', () => {
      expect(prompt).toContain('auto_renew');
      expect(prompt).toContain('default false');
    });

    it('includes GDPR data protection notice', () => {
      expect(prompt).toContain('GDPR Art. 13-14');
      expect(prompt).toContain('DATA PROTECTION');
    });

    it('includes consumer rights notice', () => {
      expect(prompt).toContain('CONSUMER RIGHTS');
      expect(prompt).toContain('Consumer Rights Directive');
    });

    it('references eIDAS', () => {
      expect(prompt).toContain('eIDAS Art. 25');
    });
  });

  describe('a3-warranty-liability consumer requirements', () => {
    const prompt = getTemplatePrompt('a3-warranty-liability');

    it('includes cooling-off period', () => {
      expect(prompt).toContain('COOLING-OFF');
      expect(prompt).toContain('14');
    });

    it('includes warranty scope and guaranteed outcome', () => {
      expect(prompt).toContain('WARRANTY SCOPE');
      expect(prompt).toContain('GUARANTEED OUTCOME');
      expect(prompt).toContain('objectively verifiable');
    });

    it('includes liability cap with UCTA reasonableness', () => {
      expect(prompt).toContain('LIABILITY CAP');
      expect(prompt).toContain('UCTA s. 11');
      expect(prompt).toContain('2x contract value');
    });

    it('prohibits exclusion of negligence liability', () => {
      expect(prompt).toContain('UCTA s. 2');
      expect(prompt).toContain('negligence or death');
    });

    it('includes claim procedure', () => {
      expect(prompt).toContain('CLAIM PROCEDURE');
      expect(prompt).toContain('claim_deadline_days');
    });

    it('includes AI agent disclosure', () => {
      expect(prompt).toContain('EU AI Act Art. 50');
      expect(prompt).toContain('AGENT DISCLOSURE');
    });

    it('includes consumer right to reject arbitration', () => {
      expect(prompt).toContain('small claims court');
      expect(prompt).toContain('reject arbitration');
    });

    it('includes GDPR data protection notice', () => {
      expect(prompt).toContain('GDPR Art. 13-14');
      expect(prompt).toContain('DATA PROTECTION');
    });

    it('includes consumer rights notice with statutory warranty', () => {
      expect(prompt).toContain('CONSUMER RIGHTS');
      expect(prompt).toContain('statutory');
    });

    it('references eIDAS', () => {
      expect(prompt).toContain('eIDAS Art. 25');
    });

    it('references Magnuson-Moss Warranty Act', () => {
      expect(prompt).toContain('Magnuson-Moss');
    });
  });

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

    it('maps "nda" to p1-nda', () => {
      const legacy = getTemplatePrompt('nda');
      const direct = getTemplatePrompt('p1-nda');
      expect(legacy).toBe(direct);
    });
  });

  describe('p1-nda C2C requirements', () => {
    const prompt = getTemplatePrompt('p1-nda');

    it('states no agent_id required', () => {
      expect(prompt).toContain('NO agent_id');
    });

    it('supports mutual and one-way NDA types', () => {
      expect(prompt).toContain('mutual');
      expect(prompt).toContain('one-way-a-to-b');
      expect(prompt).toContain('one-way-b-to-a');
    });

    it('includes standard exclusions', () => {
      expect(prompt).toContain('public domain');
      expect(prompt).toContain('independently developed');
      expect(prompt).toContain('compelled disclosure');
      expect(prompt).toContain('court order');
    });

    it('includes surviving obligations', () => {
      expect(prompt).toContain('surviving');
      expect(prompt).toContain('24');
    });

    it('includes confidential scope definition', () => {
      expect(prompt).toContain('CONFIDENTIAL INFORMATION SCOPE');
      expect(prompt).toContain('confidential_scope');
    });

    it('includes return of materials clause', () => {
      expect(prompt).toContain('RETURN OF MATERIALS');
    });

    it('includes remedies with injunctive relief', () => {
      expect(prompt).toContain('REMEDIES');
      expect(prompt).toContain('injunctive relief');
    });

    it('includes no-license clause', () => {
      expect(prompt).toContain('NO LICENSE');
    });

    it('identifies both parties by email for signing', () => {
      expect(prompt).toContain('party_a_email');
      expect(prompt).toContain('party_b_email');
      expect(prompt).toContain('magic link');
    });

    it('references trade secret legislation', () => {
      expect(prompt).toContain('Defend Trade Secrets Act');
      expect(prompt).toContain('Directive (EU) 2016/943');
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
