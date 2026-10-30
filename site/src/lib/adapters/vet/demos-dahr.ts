/**
 * DACS-2 Vet adapter — counterparty credential verification via Demos DAHR.
 *
 * Talks to the Demos node's PUBLIC, PERMISSIONLESS `web2ProxyRequest` RPC
 * DIRECTLY over HTTPS — no `@kynesyslabs/demosdk` (that 60-dep ESM package can't
 * run in a Vercel function), no wallet/seed, no gas. The node accepts any valid
 * ed25519 identity, so we mint an EPHEMERAL keypair per call. The node relays
 * the fetch and returns the body + a consensus `responseHash`; the optional
 * on-chain anchoring tx (which would need a funded wallet) is intentionally
 * skipped for the MVP, so the attestation locator is the `responseHash`.
 *
 * Wire format verified against the installed SDK source (websdk/Web2Calls.js +
 * demosclass.js `call()`) and a live probe against demosnode.discus.sh
 * (2026-06-04): create → startProxy, two JSON POSTs.
 *
 * FEATURE-FLAGGED: until `DACS_VET_LIVE === 'true'` AND `DEMOS_RPC_URL` is set,
 * every call returns `decision: 'indeterminate'` (no network access).
 */

import crypto from 'node:crypto';
import { LEI_RECIPE, isLei } from '@/lib/dacs/recipes';
import { signDacsArtifact, DACS_DOMAINS } from '@/lib/dacs/sign';
import type { VerifyResult, AttestationRef } from '@/lib/dacs/types';

const NO_ANCHOR: AttestationRef = { anchor: { kind: 'https', locator: '' }, contentHash: '' };

function liveEnabled(): boolean {
  // No DEMOS_WALLET_KEY needed — the proxy fetch is permissionless. (The seed
  // would only be required for optional on-chain anchoring, deferred.)
  return process.env.DACS_VET_LIVE === 'true' && !!process.env.DEMOS_RPC_URL;
}

/** Fresh ed25519 identity headers for the node RPC (web2ProxyRequest is open). */
function dahrAuthHeaders(): Record<string, string> {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const x = (publicKey.export({ format: 'jwk' }) as any).x as string;
  const pubHex = Buffer.from(x, 'base64url').toString('hex');
  const identity = 'ed25519:' + pubHex;
  // Timestamp-bound auth (demosdk v4 / node "audit C3b"): the node now rejects the
  // old static signature over the bare key ("update your SDK — auth now requires a
  // timestamp-bound signature"). Sign the SHA-256 hex of `${identity}:${timestamp}`
  // and send a `timestamp` header. Verified live against demosnode.discus.sh 2026-06-26.
  const timestamp = Date.now().toString();
  const authMessage = crypto.createHash('sha256').update(`${identity}:${timestamp}`).digest('hex');
  const sig = crypto.sign(null, Buffer.from(authMessage, 'utf8'), privateKey);
  return {
    'Content-Type': 'application/json',
    identity,
    signature: Buffer.from(sig).toString('hex'),
    timestamp,
  };
}

// Node RPC envelope (mirrors demos.call): { method, params: [content] }.
function rpcContent(message: unknown) {
  return { type: 'web2ProxyRequest', message, sender: null, receiver: null, timestamp: null, data: {}, extra: '' };
}
function web2Request(action: 'create' | 'startProxy', url = '') {
  return {
    raw: { action, parameters: [], method: 'GET', url, headers: {}, stage: { origin: { identity: '', connection_url: '' } } },
    result: null,
    hash: '',
    signature: { type: 'ed25519', data: '' },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nodePost(rpc: string, body: unknown, headers: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(rpc, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal resolver for the fixed `$.data[0].attributes.x.y` paths in our recipes. */
function resolvePath(root: unknown, path: string): unknown {
  const clean = path.replace(/^\$\.?/, '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = root;
  for (const seg of clean.split('.')) {
    if (cur == null) return undefined;
    const m = seg.match(/^([^[]+)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    cur = cur[m[1]];
    for (const idx of m[2].match(/\[(\d+)\]/g) ?? []) {
      if (cur == null) return undefined;
      cur = cur[Number(idx.slice(1, -1))];
    }
  }
  return cur;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(ltd|limited|inc|incorporated|llc|gmbh|corp|corporation|co|company|plc|sa|ag|oy|ab|bv|nv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesRoughlyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function finalize(v: Omit<VerifyResult, 'signature'>): Promise<VerifyResult> {
  const signature = await signDacsArtifact(DACS_DOMAINS.verifyResult, v);
  return { ...v, signature };
}

/**
 * Verify a company against GLEIF by LEI via the Demos DAHR node RPC.
 * `expectedName` (the contract's stated party name) is cross-checked against the
 * GLEIF legal name when both are known.
 */
export async function verifyLei(identifier: string, expectedName?: string): Promise<VerifyResult> {
  const now = Date.now();
  const id = identifier.trim().toUpperCase();
  const base = {
    resultVersion: '1' as const,
    scheme: 'lei',
    identifier: id,
    recipeVersion: LEI_RECIPE.recipeVersion,
    method: 'consensus-backed-proxy' as const,
    fetchedAt: now,
    verifiedAt: now,
  };

  if (!isLei(id)) {
    return finalize({ ...base, decision: 'error', reason: 'Identifier is not a valid 20-character LEI.', attestation: NO_ANCHOR });
  }
  if (!liveEnabled()) {
    return finalize({ ...base, decision: 'indeterminate', reason: 'Live verification is not yet enabled.', attestation: NO_ANCHOR });
  }

  try {
    const rpc = process.env.DEMOS_RPC_URL as string;
    const url = LEI_RECIPE.defaultMethod.endpoint.urlTemplate.replace('{identifier}', encodeURIComponent(id));

    // 1) create DAHR session (fresh timestamp-bound auth per call — the node rejects stale/replayed signatures)
    const createResp = await nodePost(rpc, { method: 'web2ProxyRequest', params: [rpcContent({ web2Request: web2Request('create') })] }, dahrAuthHeaders());
    const sessionId = createResp?.response?.dahr?.sessionId;
    if (!sessionId) {
      return finalize({ ...base, decision: 'error', reason: 'Could not open a DAHR session on the Demos node.', attestation: NO_ANCHOR });
    }

    // 2) start proxy (the node fetches GLEIF and returns body + responseHash)
    const proxyResp = await nodePost(
      rpc,
      { method: 'web2ProxyRequest', params: [rpcContent({ web2Request: web2Request('startProxy', url), sessionId, payload: undefined, authorization: '' })] },
      dahrAuthHeaders(),
    );
    const r = proxyResp?.response;
    const httpStatus = r?.status;
    const responseHash = (r?.responseHash as string) ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = r?.data;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { /* leave as string */ }
    }

    if (httpStatus !== 200 && httpStatus !== undefined && (httpStatus < 200 || httpStatus >= 300)) {
      return finalize({ ...base, decision: 'indeterminate', reason: `GLEIF returned HTTP ${httpStatus} via Demos DAHR.`, attestation: { anchor: { kind: 'demos-web2', locator: responseHash }, contentHash: responseHash } });
    }

    const lei = resolvePath(body, LEI_RECIPE.parserRules.successJsonPath);
    const legalName = resolvePath(body, LEI_RECIPE.parserRules.dataMap!.legalName) as string | undefined;
    const status = resolvePath(body, LEI_RECIPE.parserRules.dataMap!.status) as string | undefined;
    const attestation: AttestationRef = { anchor: { kind: 'demos-web2', locator: responseHash }, contentHash: responseHash };

    let decision: VerifyResult['decision'];
    let reason: string;
    if (!lei) {
      decision = 'fail';
      reason = 'No matching LEI record found in GLEIF.';
    } else if (expectedName && legalName && !namesRoughlyMatch(expectedName, legalName)) {
      decision = 'fail';
      reason = `Name mismatch — contract says "${expectedName}", GLEIF says "${legalName}".`;
    } else if (status && status !== 'ISSUED') {
      // A non-ISSUED LEI (LAPSED / RETIRED / ANNULLED / MERGED / DUPLICATE / …) is not an
      // active registration — previously this still "passed" on LEI-presence alone.
      decision = 'fail';
      reason = `LEI registration is not active — GLEIF status is ${status}.`;
    } else {
      decision = 'pass';
      reason = legalName ? `Verified against GLEIF — ${legalName}.` : 'LEI verified against GLEIF.';
    }
    return finalize({ ...base, decision, reason, data: { legalName, status }, attestation });
  } catch (e) {
    return finalize({ ...base, decision: 'error', reason: e instanceof Error ? e.message : 'DAHR verification failed.', attestation: NO_ANCHOR });
  }
}
