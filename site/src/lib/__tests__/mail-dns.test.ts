import { describe, it, expect } from 'vitest';
import { checkMailDns, evaluateDmarc, hasSpf, type MailResolver } from '@/lib/health/mail-dns';

const dnsError = (code: string) => Object.assign(new Error(code), { code });

// Records as they currently resolve for the domain.
const HEALTHY: Record<string, { mx?: string[]; txt?: string[][] }> = {
  'ambr.run': { mx: ['mx.forwarder.example'], txt: [['v=spf1 include:spf.forwarder.example ~all']] },
  'resend._domainkey.ambr.run': { txt: [['p=MIGfMA0GCSqGSIb3DQEBAQUAA4GN', 'ADCBiQKBgQC9']] },
  'send.ambr.run': { mx: ['feedback-smtp.example'], txt: [['v=spf1 include:amazonses.com ~all']] },
  '_dmarc.ambr.run': { txt: [['v=DMARC1; p=quarantine; rua=mailto:dmarc@ambr.run']] },
};

function resolverFor(
  zone: Record<string, { mx?: string[]; txt?: string[][] }>,
  failing: Record<string, string> = {},
): MailResolver {
  return {
    async resolveMx(host) {
      if (failing[host]) throw dnsError(failing[host]);
      const mx = zone[host]?.mx;
      if (!mx) throw dnsError('ENODATA');
      return mx.map((exchange, priority) => ({ exchange, priority }));
    },
    async resolveTxt(host) {
      if (failing[host]) throw dnsError(failing[host]);
      const txt = zone[host]?.txt;
      if (!txt) throw dnsError('ENOTFOUND');
      return txt;
    },
  };
}

const byKey = (items: Awaited<ReturnType<typeof checkMailDns>>) =>
  Object.fromEntries(items.map((i) => [i.key, i]));

describe('evaluateDmarc', () => {
  it('no record is red', () => {
    expect(evaluateDmarc([]).status).toBe('down');
    expect(evaluateDmarc(['v=spf1 -all']).status).toBe('down');
  });

  it('p=none is amber and says it only monitors', () => {
    const r = evaluateDmarc(['v=DMARC1; p=none; rua=mailto:dmarc@ambr.run']);
    expect(r.status).toBe('degraded');
    expect(r.detail).toBe('DMARC only monitors; spoofed mail is not rejected.');
  });

  it('quarantine and reject are green, whatever the case and spacing', () => {
    expect(evaluateDmarc(['v=DMARC1; p=quarantine']).status).toBe('ok');
    expect(evaluateDmarc(['v=DMARC1;p=reject;pct=100']).status).toBe('ok');
    expect(evaluateDmarc(['V=dmarc1; P=Reject']).status).toBe('ok');
  });

  it('a record without a usable policy is amber, not green', () => {
    expect(evaluateDmarc(['v=DMARC1; rua=mailto:x@ambr.run']).status).toBe('degraded');
    expect(evaluateDmarc(['v=DMARC1; p=bogus']).status).toBe('degraded');
  });

  it('does not read sp= as the policy', () => {
    expect(evaluateDmarc(['v=DMARC1; sp=reject']).status).toBe('degraded');
  });
});

describe('hasSpf', () => {
  it('finds an SPF record among other TXT values', () => {
    expect(hasSpf(['google-site-verification=abc', 'v=spf1 -all'])).toBe(true);
    expect(hasSpf(['v=spf10 nope', 'something v=spf1'])).toBe(false);
  });
});

describe('checkMailDns', () => {
  it('is all green for a complete setup, joining split TXT strings', async () => {
    const items = byKey(await checkMailDns(resolverFor(HEALTHY)));
    expect(Object.keys(items)).toEqual(['dns_mx', 'dns_spf', 'dns_dkim', 'dns_send', 'dns_dmarc']);
    expect(Object.values(items).map((i) => i.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('p=none shows as amber with the plain note', async () => {
    const zone = { ...HEALTHY, '_dmarc.ambr.run': { txt: [['v=DMARC1; p=none; rua=mailto:dmarc@ambr.run']] } };
    const items = byKey(await checkMailDns(resolverFor(zone)));
    expect(items.dns_dmarc.status).toBe('degraded');
    expect(items.dns_dmarc.detail).toContain('only monitors');
    expect(items.dns_mx.status).toBe('ok');
  });

  it('flags each missing record on its own', async () => {
    const items = byKey(await checkMailDns(resolverFor({})));
    expect(items.dns_mx.status).toBe('down');
    expect(items.dns_spf.status).toBe('down');
    expect(items.dns_dkim.status).toBe('down');
    expect(items.dns_dmarc.status).toBe('down');
    // The send subdomain is Resend's choice, so a gap there is amber, not red.
    expect(items.dns_send.status).toBe('degraded');
    expect(items.dns_send.detail).toContain('mail server and SPF');
  });

  it('a root SPF record is not the DKIM key, and a TXT without p= is not a key', async () => {
    const zone = { ...HEALTHY, 'resend._domainkey.ambr.run': { txt: [['v=DKIM1; k=rsa']] } };
    const items = byKey(await checkMailDns(resolverFor(zone)));
    expect(items.dns_dkim.status).toBe('down');
  });

  it('a failed lookup is amber, never reported as a missing record', async () => {
    const items = byKey(
      await checkMailDns(resolverFor(HEALTHY, { '_dmarc.ambr.run': 'ETIMEOUT', 'ambr.run': 'ESERVFAIL' })),
    );
    expect(items.dns_dmarc.status).toBe('degraded');
    expect(items.dns_dmarc.detail).toContain('lookup itself failed');
    expect(items.dns_mx.status).toBe('degraded');
    expect(items.dns_spf.status).toBe('degraded');
    expect(items.dns_dkim.status).toBe('ok');
  });
});

describe('record edge cases', () => {
  it('treats duplicate DMARC records as degraded', () => {
    expect(evaluateDmarc(['v=DMARC1; p=reject', 'v=DMARC1; p=none']).status).toBe('degraded');
  });

  it('treats a reject policy that applies to no mail as degraded', () => {
    expect(evaluateDmarc(['v=DMARC1; p=reject; pct=0']).status).toBe('degraded');
    expect(evaluateDmarc(['v=DMARC1; p=reject; pct=100']).status).toBe('ok');
  });

  it('requires exactly one SPF record', () => {
    expect(hasSpf(['v=spf1 include:a.example ~all', 'v=spf1 -all'])).toBe(false);
  });

  it('allows whitespace around = in the DMARC version and policy', () => {
    expect(evaluateDmarc(['v = DMARC1; p = reject']).status).toBe('ok');
    expect(evaluateDmarc(['v =DMARC1 ; p= quarantine']).status).toBe('ok');
    expect(evaluateDmarc(['v = DMARC1; p = none']).status).toBe('degraded');
  });

  it('allows whitespace around = in the DKIM key, and still rejects an empty one', async () => {
    const run = async (txt: string) => {
      const zone = { ...HEALTHY, 'resend._domainkey.ambr.run': { txt: [[txt]] } };
      return byKey(await checkMailDns(resolverFor(zone))).dns_dkim.status;
    };
    expect(await run('v=DKIM1; p = MIGfMA0GCSqGSIb3DQEB')).toBe('ok');
    expect(await run('p =MIGfMA0GCSqGSIb3DQEB')).toBe('ok');
    expect(await run('v=DKIM1; p = ; k=rsa')).toBe('down');
  });

  it('treats an empty DKIM key as missing even when it is not the last tag', async () => {
    const resolver: MailResolver = {
      resolveMx: async () => [{ exchange: 'mx.example', priority: 10 }],
      resolveTxt: async (host) => (host.startsWith('resend._domainkey') ? [['p=; k=rsa']] : []),
    };
    const items = await checkMailDns(resolver);
    expect(items.find((i) => i.key === 'dns_dkim')?.status).toBe('down');
  });
});
