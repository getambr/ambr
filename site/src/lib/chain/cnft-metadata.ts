const PLATFORM_URL = process.env.NEXT_PUBLIC_PLATFORM_URL || 'https://getamber.dev';

interface ContractForMetadata {
  contract_id: string;
  sha256_hash: string;
  contract_type?: string;
  amendment_type?: string;
  principal_declaration?: Record<string, unknown>;
}

interface ERC721Metadata {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: { trait_type: string; value: string }[];
}

export function buildNftMetadata(contract: ContractForMetadata): ERC721Metadata {
  const principalName =
    (contract.principal_declaration?.principal_name as string) || 'Unknown';
  const contractType = contract.contract_type || 'contract';
  const amendmentType = contract.amendment_type || 'original';

  return {
    name: `Ambr Contract ${contract.contract_id}`,
    description: `Ricardian Contract NFT — ${contractType} (${amendmentType}). Signed and verified on the Ambr protocol.`,
    image: `${PLATFORM_URL}/api/v1/nft/image/${contract.sha256_hash}`,
    external_url: `${PLATFORM_URL}/reader/${contract.sha256_hash}`,
    attributes: [
      { trait_type: 'Contract Hash', value: contract.sha256_hash },
      { trait_type: 'Contract ID', value: contract.contract_id },
      { trait_type: 'Contract Type', value: contractType },
      { trait_type: 'Amendment Type', value: amendmentType },
      { trait_type: 'Principal', value: principalName },
      { trait_type: 'Transfer Status', value: 'Locked' },
    ],
  };
}

export function getMetadataUri(sha256Hash: string): string {
  return `${PLATFORM_URL}/api/v1/nft/by-hash/${sha256Hash}/metadata`;
}
