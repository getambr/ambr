import { getAnthropicClient, CONTRACT_MODEL } from './client';
import { getTemplatePrompt } from './prompts';

interface GenerateContractParams {
  templateSlug: string;
  parameters: Record<string, unknown>;
  principalDeclaration: {
    agent_id: string;
    principal_name: string;
    principal_type: string;
  };
  contractId: string;
}

interface GeneratedContract {
  humanReadable: string;
  machineReadable: Record<string, unknown>;
}

const CONTRACT_TOOL = {
  name: 'create_contract' as const,
  description: 'Create a dual-format Ricardian Contract with human-readable and machine-readable components.',
  input_schema: {
    type: 'object' as const,
    properties: {
      humanReadable: {
        type: 'string' as const,
        description: 'The complete human-readable legal contract text.',
      },
      machineReadable: {
        type: 'object' as const,
        description: 'Structured JSON object containing all contract terms.',
      },
    },
    required: ['humanReadable', 'machineReadable'],
  },
};

export async function generateContract(
  params: GenerateContractParams,
): Promise<GeneratedContract> {
  const client = getAnthropicClient();
  const systemPrompt = getTemplatePrompt(params.templateSlug);

  const userInput = JSON.stringify({
    contract_id: params.contractId,
    template: params.templateSlug,
    parameters: params.parameters,
    principal_declaration: params.principalDeclaration,
    generated_at: new Date().toISOString(),
  });

  const response = await client.messages.create({
    model: CONTRACT_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userInput }],
    tools: [CONTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'create_contract' },
  });

  // Extract tool use result — guaranteed valid JSON by the API
  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('LLM did not return tool_use response');
  }

  const input = toolBlock.input as Record<string, unknown>;

  if (!input.humanReadable || !input.machineReadable) {
    throw new Error(
      'LLM response missing humanReadable or machineReadable fields',
    );
  }

  // Enrich machine-readable layer with oversight metadata
  const machineReadable = input.machineReadable as Record<string, unknown>;

  // EU AI Act Article 14 compliance: document the oversight method
  machineReadable.compliance = {
    ...(machineReadable.compliance as Record<string, unknown> || {}),
    human_oversight_method: params.templateSlug.startsWith('d')
      ? 'pre-authorized delegation'
      : 'delegated authority',
    oversight_framework: 'eu_ai_act_article_14',
    delegation_chain_auditable: true,
    revocation_capable: true,
  };

  return {
    humanReadable: input.humanReadable as string,
    machineReadable,
  };
}
