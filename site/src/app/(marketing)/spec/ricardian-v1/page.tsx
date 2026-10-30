import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import SectionWrapper from '@/components/ui/SectionWrapper';
import { LEGIBILITY_PRINCIPLE, RICARDIAN_URN } from '@/lib/governance/principle';

export const metadata: Metadata = {
  title: 'Ricardian Contract Spec v1 | Ambr',
  description:
    'The Ricardian contract format produced by Ambr: dual-format prose + JSON bound by SHA-256, URN urn:ambr:ricardian-v1.',
  ...createOgMetadata({
    title: 'Ricardian Contract Spec v1',
    description:
      'Contract format, hash scheme, and URN for urn:ambr:ricardian-v1. MIT licensed.',
    path: '/spec/ricardian-v1',
    label: 'Spec',
    domain: 'ambr.run',
  }),
};

const EXAMPLE_JSON = `{
  "contract_id": "amb-2026-0042",
  "template": "d1-agent-delegation",
  "template_version": 3,
  "principal_declaration": {
    "agent_id": "agent-abc",
    "principal_name": "Acme Corp",
    "principal_type": "company"
  },
  "parameters": {
    "spend_limit_usd": 500,
    "duration_days": 30
  },
  "sha256": "f8c3…",
  "created_at": "2026-04-20T14:22:19Z"
}`;

const EXAMPLE_CONTEXT = `{
  "@context": {
    "ambr": "https://ambr.run/context/ricardian#",
    "urn": "urn:ambr:ricardian-v1"
  }
}`;

export default function RicardianSpecV1Page() {
  return (
    <main>
      <SectionWrapper>
        <div className="mx-auto max-w-3xl">
          <p className="text-xs uppercase tracking-widest text-text-secondary mb-3">
            Specification · v1 · MIT Licensed
          </p>
          <h1 className="text-3xl text-text-primary mb-4">
            Ricardian Contract Spec v1
          </h1>
          <p className="text-sm text-text-secondary mb-2">
            URN:{' '}
            <code className="bg-surface-raised px-2 py-0.5 rounded text-text-primary">
              {RICARDIAN_URN}
            </code>
          </p>
          <p className="text-sm text-text-secondary mb-10">
            Canonical reference URL:{' '}
            <code className="bg-surface-raised px-2 py-0.5 rounded text-text-primary">
              https://ambr.run/spec/ricardian-v1
            </code>
          </p>

          <div className="space-y-10 text-sm text-text-secondary leading-relaxed">
            <section>
              <h2 className="text-lg text-text-primary mb-3">
                {LEGIBILITY_PRINCIPLE.title}
              </h2>
              <p>{LEGIBILITY_PRINCIPLE.summary}</p>
            </section>

            <section>
              <h2 className="text-lg text-text-primary mb-3">Contract shape</h2>
              <p className="mb-3">
                Every contract produced by Ambr is a pair: a human-readable
                legal prose document and a machine-parsable JSON document
                describing the same agreement. The two are linked by a single
                SHA-256 hash that covers both payloads.
              </p>
              <p className="mb-3">Required JSON fields:</p>
              <ul className="list-disc pl-6 space-y-1 mb-3">
                <li>
                  <code className="text-text-primary">contract_id</code> — format{' '}
                  <code>amb-YYYY-NNNN</code>
                </li>
                <li>
                  <code className="text-text-primary">template</code> — template
                  slug (e.g. <code>d1-general-auth</code> delegation,{' '}
                  <code>c3-task-execution</code> agent-to-agent, one-sided
                  power of attorney <code>p2-power-of-attorney</code>; full
                  catalog via <code>GET /api/v1/templates</code>)
                </li>
                <li>
                  <code className="text-text-primary">template_version</code> —
                  integer, monotonically increasing per template
                </li>
                <li>
                  <code className="text-text-primary">principal_declaration</code>{' '}
                  — <code>{'{ agent_id, principal_name, principal_type }'}</code>
                </li>
                <li>
                  <code className="text-text-primary">parameters</code> — object
                  conforming to the template&apos;s parameter schema
                </li>
                <li>
                  <code className="text-text-primary">parameters.governing_law</code>{' '}
                  — string, required by every template&apos;s parameter schema
                  (default <code>Singapore</code>). Governing jurisdiction:
                  Singapore, Delaware, England-Wales or Switzerland. It
                  appears in the rendered contract as the choice-of-law clause
                  and selects the electronic-agent formation recital
                </li>
                <li>
                  <code className="text-text-primary">sha256</code> — hash of
                  the canonical encoding (see below)
                </li>
                <li>
                  <code className="text-text-primary">created_at</code> — ISO
                  8601 UTC
                </li>
              </ul>
              <p className="mb-3">Optional:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>
                  <code className="text-text-primary">parent_contract_hash</code>{' '}
                  — SHA-256 of a parent contract, required when{' '}
                  <code>amendment_type</code> is present
                </li>
                <li>
                  <code className="text-text-primary">amendment_type</code> —{' '}
                  <code>original | amendment | extension</code>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg text-text-primary mb-3">Hash scheme</h2>
              <p className="mb-3">
                The <code>sha256</code> field is computed from two inputs: (a)
                the human-readable prose exactly as stored, and (b) the
                machine-readable object with <code>sha256</code> excluded.
                Canonicalize (b) by sorting object keys lexicographically at
                every depth — arrays keep their order — and serializing with
                ECMAScript <code>JSON.stringify</code> (no insignificant
                whitespace between tokens). Join the two payloads with the
                literal five-byte separator <code>{'"\\n---\\n"'}</code> (LF,
                three hyphens, LF), hash the UTF-8 bytes with SHA-256, and
                encode the digest as 64 lowercase hex characters:
              </p>
              <pre className="bg-surface-raised p-4 rounded text-xs overflow-x-auto text-text-primary">
                <code>{`sha256_hex( utf8( prose + "\\n---\\n" + canonical_json ) )`}</code>
              </pre>
              <p className="mb-3 mt-3">
                Reference implementation (Node.js) — any party can recompute
                the hash without calling Ambr:
              </p>
              <pre className="bg-surface-raised p-4 rounded text-xs overflow-x-auto text-text-primary">
                <code>{`const { createHash } = require('crypto');

const sortKeys = (o) =>
  Array.isArray(o) ? o.map(sortKeys)
  : o && typeof o === 'object'
    ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]))
    : o;

// The API serves machine_readable without an embedded sha256 field. If your
// copy carries one (per the data model above), exclude it before hashing:
const { sha256, ...doc } = machineReadable;

const hash = createHash('sha256')
  .update(prose + '\\n---\\n' + JSON.stringify(sortKeys(doc)), 'utf-8')
  .digest('hex');`}</code>
              </pre>
              <p>
                A verifier recomputes the hash over the two payloads it
                received. A match proves the prose and the JSON refer to the
                same agreement — the basis of the legibility guarantee — and
                requires no trust in Ambr as an intermediary.
              </p>
            </section>

            <section>
              <h2 className="text-lg text-text-primary mb-3">
                JSON example (abbreviated)
              </h2>
              <pre className="bg-surface-raised p-4 rounded text-xs overflow-x-auto text-text-primary">
                <code>{EXAMPLE_JSON}</code>
              </pre>
            </section>

            <section>
              <h2 className="text-lg text-text-primary mb-3">
                Declaring compliance
              </h2>
              <p className="mb-3">
                Third-party A2A or MCP implementations can declare compliance
                with this format by including the URN in their{' '}
                <code>compliesWith</code> field:
              </p>
              <pre className="bg-surface-raised p-4 rounded text-xs overflow-x-auto text-text-primary">
                <code>{`"compliesWith": ["${RICARDIAN_URN}"]`}</code>
              </pre>
              <p className="mt-3 mb-3">
                A minimal JSON-LD context for contract payloads:
              </p>
              <pre className="bg-surface-raised p-4 rounded text-xs overflow-x-auto text-text-primary">
                <code>{EXAMPLE_CONTEXT}</code>
              </pre>
            </section>

            <section>
              <h2 className="text-lg text-text-primary mb-3">Licensing</h2>
              <p>
                The spec, the URN namespace, and the reference template
                catalogue are MIT licensed. Ambr encourages alternative
                implementations — convergence on a shared contract format is
                the point. Templates live in the Ambr repository under{' '}
                <code>/open-source/</code>.
              </p>
            </section>

            <section>
              <h2 className="text-lg text-text-primary mb-3">Versioning</h2>
              <p>
                This is version 1 of the spec. Breaking changes will be
                published under a new URN (e.g.{' '}
                <code>urn:ambr:ricardian-v2</code>). Non-breaking additions
                land under the same URN with a bump to{' '}
                <code>platformVersion</code> on the discovery endpoints.
              </p>
            </section>

            <section>
              <h2 className="text-lg text-text-primary mb-3">Contact</h2>
              <p>
                Questions, proposals, or federation intent:{' '}
                <a
                  href="mailto:governance@ambr.run"
                  className="text-text-primary underline"
                >
                  governance@ambr.run
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </SectionWrapper>
    </main>
  );
}
