import {
  deriveCapabilities,
  formatMoney,
  oversightLabel,
  type Money,
} from '@/lib/contract-capabilities';

interface Props {
  machineReadable: Record<string, unknown> | null;
  status: string;
  revokedAt: string | null;
  expiryDate: string | null;
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="text-sm font-semibold text-text-primary mt-0.5">{value}</p>
    </div>
  );
}

function ActionList({ title, tone, items }: { title: string; tone: 'ok' | 'no'; items: string[] }) {
  const color = tone === 'ok' ? 'text-emerald-400' : 'text-red-400';
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${color} mb-2`}>{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-text-primary">
            <svg
              className={`h-4 w-4 mt-0.5 shrink-0 ${color}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              {tone === 'ok' ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              )}
            </svg>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Plain-language "what this AI agent may / may not do" panel, derived from the
 * signed contract's machine_readable scope. Renders nothing for contracts that
 * carry no delegation-style scope.
 */
export default function CapabilitySummary({
  machineReadable,
  status,
  revokedAt,
  expiryDate,
}: Props) {
  const cap = deriveCapabilities(machineReadable);
  if (!cap) return null;

  const expired = !!expiryDate && new Date(expiryDate).getTime() < Date.now();
  const inForce = status === 'active' && !revokedAt && !expired;
  const notInForceReason = revokedAt
    ? 'revoked'
    : expired
      ? 'expired'
      : status !== 'active'
        ? `awaiting signature (${status})`
        : null;

  const limits: { label: string; value: Money }[] = [];
  if (cap.perTxLimit) limits.push({ label: 'Per transaction', value: cap.perTxLimit });
  if (cap.monthlyLimit) limits.push({ label: 'Per month', value: cap.monthlyLimit });

  const oversight = oversightLabel(cap.oversightFramework);

  return (
    <section className="rounded-xl border border-amber/20 bg-amber-glow/40 p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="text-base font-semibold text-text-primary">
          What this AI agent may do
        </h2>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
            inForce
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/40 bg-red-500/10 text-red-400'
          }`}
        >
          {inForce ? 'Authorization in force' : `Not in force${notInForceReason ? ` — ${notInForceReason}` : ''}`}
        </span>
      </div>

      {cap.purpose && (
        <p className="text-sm text-text-secondary mb-4">
          <span className="text-text-primary font-medium">Purpose:</span> {cap.purpose}
        </p>
      )}

      {(limits.length > 0 || cap.approvalAbove) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {limits.map((l) => (
            <Limit key={l.label} label={l.label} value={`≤ ${formatMoney(l.value)}`} />
          ))}
          {cap.approvalAbove && (
            <Limit label="Your approval needed above" value={formatMoney(cap.approvalAbove)} />
          )}
        </div>
      )}

      {cap.categories.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-wide text-text-secondary mb-2">
            Approved categories
          </p>
          <div className="flex flex-wrap gap-2">
            {cap.categories.map((c, i) => (
              <span
                key={i}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-primary"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {(cap.mayDo.length > 0 || cap.mayNotDo.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {cap.mayDo.length > 0 && <ActionList title="May" tone="ok" items={cap.mayDo} />}
          {cap.mayNotDo.length > 0 && <ActionList title="May not" tone="no" items={cap.mayNotDo} />}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
        {cap.agentType && (
          <span>
            Agent type: <span className="text-text-primary">{cap.agentType}</span>
          </span>
        )}
        {typeof cap.subDelegationAllowed === 'boolean' && (
          <span>
            Sub-delegation:{' '}
            <span className="text-text-primary">
              {cap.subDelegationAllowed ? 'allowed' : 'not allowed'}
            </span>
          </span>
        )}
        {cap.endDate && (
          <span>
            Expires: <span className="text-text-primary">{cap.endDate}</span>
          </span>
        )}
        {typeof cap.revocationNoticeHours === 'number' && (
          <span>
            Revocation notice (term):{' '}
            <span className="text-text-primary">
              {cap.revocationNoticeHours === 0 ? 'none stated' : `${cap.revocationNoticeHours}h`}
            </span>
          </span>
        )}
        {oversight && (
          <span>
            Oversight: <span className="text-text-primary">{oversight}</span>
          </span>
        )}
        {cap.geographic && !/^none/i.test(cap.geographic) && (
          <span>
            Geography: <span className="text-text-primary">{cap.geographic}</span>
          </span>
        )}
      </div>

      <p className="mt-3 text-[11px] text-text-secondary/60">
        Derived from the signed contract — these are the agreed terms of the authorization.
        Ambr records and evidences them; it does not enforce them. In particular, revocation takes
        effect when requested regardless of the notice period written above.
      </p>
    </section>
  );
}
