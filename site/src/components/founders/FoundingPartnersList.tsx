import { getSupabase } from '@/lib/supabase';

interface FounderPartner {
  org_name: string;
  use_case: string | null;
  approved_at: string | null;
}

async function getPartners(): Promise<FounderPartner[]> {
  const db = getSupabase();
  const { data } = await db
    .from('founder_partners')
    .select('org_name, use_case, approved_at')
    .eq('is_active', true)
    .eq('public_listing', true)
    .order('approved_at', { ascending: true });

  return (data as FounderPartner[]) ?? [];
}

export default async function FoundingPartnersList() {
  const partners = await getPartners();
  const remaining = Math.max(0, 10 - partners.length);

  return (
    <div className="max-w-3xl mx-auto mt-12">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-xl text-text-primary">Founding Partners</h2>
        <span className="font-mono text-xs text-amber">
          {partners.length} / 10 spots claimed
          {remaining > 0 && ` · ${remaining} remaining`}
        </span>
      </div>

      {partners.length === 0 ? (
        <div className="border border-border bg-surface/50 p-6 text-center">
          <p className="text-sm text-text-secondary">
            Founding Partners appear here once approved. Be the first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {partners.map((p) => (
            <div
              key={p.org_name}
              className="border border-amber/40 bg-surface/80 p-4"
            >
              <h3 className="text-base text-text-primary">{p.org_name}</h3>
              {p.use_case && (
                <p className="mt-1 text-xs text-text-secondary line-clamp-2">
                  {p.use_case}
                </p>
              )}
              {p.approved_at && (
                <p className="mt-2 text-[0.65rem] font-mono text-amber/70 uppercase tracking-wider">
                  Since {new Date(p.approved_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
