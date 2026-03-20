import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { ContractData, StorageAdapter, StorageResult } from './index';

export class SupabaseStorageAdapter implements StorageAdapter {
  name = 'supabase';

  async store(contract: ContractData): Promise<StorageResult> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('contracts')
      .insert({
        contract_id: contract.contractId,
        template_id: contract.templateId,
        status: contract.status,
        human_readable: contract.humanReadable,
        machine_readable: contract.machineReadable,
        sha256_hash: contract.sha256Hash,
        principal_declaration: contract.principalDeclaration,
        parameters: contract.parameters,
        api_key_id: contract.apiKeyId ?? null,
        payer_wallet: contract.payerWallet ?? null,
        payment_method: contract.paymentMethod,
        visibility: contract.visibility,
        publish_targets: [],
        encryption_metadata: contract.encryptionMetadata ?? null,
        parent_contract_hash: contract.parentContractHash ?? null,
        amendment_type: contract.amendmentType ?? 'original',
      })
      .select('id, contract_id, sha256_hash, status, created_at')
      .single();

    if (error) throw error;

    return {
      adapter: this.name,
      reference: data.id,
      stored_at: data.created_at,
    };
  }

  async retrieve(ref: string): Promise<ContractData | null> {
    const db = getSupabaseAdmin();
    let query = db.from('contracts').select('*');

    if (ref.startsWith('amb-')) {
      query = query.eq('contract_id', ref);
    } else if (/^[a-f0-9]{64}$/.test(ref)) {
      query = query.eq('sha256_hash', ref);
    } else {
      query = query.eq('id', ref);
    }

    const { data, error } = await query.single();
    if (error || !data) return null;

    return {
      contractId: data.contract_id,
      templateId: data.template_id,
      humanReadable: data.human_readable,
      machineReadable: data.machine_readable,
      sha256Hash: data.sha256_hash,
      principalDeclaration: data.principal_declaration,
      parameters: data.parameters,
      status: data.status,
      visibility: data.visibility ?? 'private',
      apiKeyId: data.api_key_id,
      payerWallet: data.payer_wallet,
      paymentMethod: data.payment_method ?? 'api_key',
      parentContractHash: data.parent_contract_hash,
      amendmentType: data.amendment_type,
      encryptionMetadata: data.encryption_metadata,
    };
  }

  async verify(ref: string, expectedHash: string): Promise<boolean> {
    const contract = await this.retrieve(ref);
    if (!contract) return false;
    return contract.sha256Hash === expectedHash;
  }
}
