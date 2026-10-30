const PLATFORM_URL = process.env.NEXT_PUBLIC_PLATFORM_URL || 'https://getamber.dev';

interface ContractForMetadata {
  contract_id: string;
  sha256_hash: string;
  contract_type?: string;
  amendment_type?: string;
  principal_declaration?: Record<string, unknown>;
  /** Contract lifecycle fields; without them the contract is described as active. */
  status?: string | null;
  revoked_at?: string | null;
  expiry_date?: string | null;
}

export type NftContractStatus = 'active' | 'revoked' | 'expired' | 'pending' | 'terminated' | 'amended';

interface ERC721Metadata {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: { trait_type: string; value: string }[];
}

const PENDING_STATUSES = ['draft', 'pending_signature', 'handshake', 'pending'];

export function resolveNftStatus(contract: ContractForMetadata, now: number = Date.now()): NftContractStatus {
  const status = contract.status ?? 'active';
  if (contract.revoked_at || status === 'revoked') return 'revoked';
  if (status === 'terminated' || status === 'amended') return status;
  if (status === 'expired') return 'expired';
  if (PENDING_STATUSES.includes(status)) return 'pending';
  if (contract.expiry_date && Date.parse(contract.expiry_date) <= now) return 'expired';
  return 'active';
}

function describeStatus(status: NftContractStatus, contract: ContractForMetadata): string {
  const date = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : null);
  switch (status) {
    case 'revoked': {
      const d = date(contract.revoked_at);
      return d ? `Revoked on ${d}.` : 'Revoked.';
    }
    case 'expired': {
      const d = date(contract.expiry_date);
      return d ? `Expired on ${d}.` : 'Expired.';
    }
    case 'pending':
      return 'Pending signature on the Ambr protocol.';
    case 'terminated':
      return 'Terminated.';
    case 'amended':
      return 'Superseded by an amendment.';
    default:
      return 'Signed and verified on the Ambr protocol.';
  }
}

export function buildNftMetadata(contract: ContractForMetadata): ERC721Metadata {
  const principalName =
    (contract.principal_declaration?.principal_name as string) || 'Unknown';
  const contractType = contract.contract_type || 'contract';
  const amendmentType = contract.amendment_type || 'original';
  const status = resolveNftStatus(contract);

  return {
    name: `Ambr Contract ${contract.contract_id}`,
    description: `Ricardian Contract NFT — ${contractType} (${amendmentType}). ${describeStatus(status, contract)}`,
    image: `${PLATFORM_URL}/api/v1/nft/image/${contract.sha256_hash}`,
    external_url: `${PLATFORM_URL}/reader/${contract.sha256_hash}`,
    attributes: [
      { trait_type: 'Contract Hash', value: contract.sha256_hash },
      { trait_type: 'Contract ID', value: contract.contract_id },
      { trait_type: 'Contract Type', value: contractType },
      { trait_type: 'Amendment Type', value: amendmentType },
      { trait_type: 'Principal', value: principalName },
      { trait_type: 'Status', value: status },
      // Not soulbound — transfers require bilateral consent (on-chain
      // approveTransfer / novation). "Locked" was misleading vs. the rest of
      // the app, which correctly says "counterparty-gated".
      { trait_type: 'Transfer Status', value: 'Counterparty-Gated' },
    ],
  };
}

export function getMetadataUri(sha256Hash: string): string {
  return `${PLATFORM_URL}/api/v1/nft/by-hash/${sha256Hash}/metadata`;
}
