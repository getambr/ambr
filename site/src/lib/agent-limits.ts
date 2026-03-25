import { getSupabaseAdmin } from './supabase-admin';

interface AgentLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
}

export async function checkAgentLimit(
  apiKeyId: string,
  agentWallet: string,
  dailyLimit: number,
): Promise<AgentLimitResult> {
  const db = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await db
    .from('agent_usage')
    .select('contract_count')
    .eq('api_key_id', apiKeyId)
    .eq('agent_wallet', agentWallet.toLowerCase())
    .eq('date', today)
    .single();

  const used = data?.contract_count ?? 0;

  return {
    allowed: used < dailyLimit,
    used,
    limit: dailyLimit,
  };
}

export async function incrementAgentUsage(
  apiKeyId: string,
  agentWallet: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const wallet = agentWallet.toLowerCase();

  // Upsert: insert if not exists, increment if exists
  const { data: existing } = await db
    .from('agent_usage')
    .select('id, contract_count')
    .eq('api_key_id', apiKeyId)
    .eq('agent_wallet', wallet)
    .eq('date', today)
    .single();

  if (existing) {
    await db
      .from('agent_usage')
      .update({ contract_count: existing.contract_count + 1 })
      .eq('id', existing.id);
  } else {
    await db.from('agent_usage').insert({
      api_key_id: apiKeyId,
      agent_wallet: wallet,
      date: today,
      contract_count: 1,
    });
  }
}
