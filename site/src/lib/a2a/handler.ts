/**
 * A2A Task Handler — bridges Google A2A protocol to Ambr MCP tools.
 *
 * Receives A2A JSON-RPC messages (message/send, tasks/get, tasks/cancel),
 * maps them to existing MCP tool calls, and returns A2A Task objects.
 *
 * Since we're on Vercel serverless, all tasks are synchronous —
 * they complete within the same request (no polling needed).
 */

import { randomUUID } from 'crypto';
import { rateLimit } from '@/lib/rate-limit';

// --- A2A Types (spec: https://a2a-protocol.org/latest/specification/) ---

type TaskState =
  | 'submitted'
  | 'working'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'
  | 'input_required'
  | 'auth_required';

interface TaskStatus {
  state: TaskState;
  message?: A2AMessage;
}

interface TextPart {
  type: 'text';
  text: string;
}

interface DataPart {
  type: 'data';
  data: Record<string, unknown>;
}

type Part = TextPart | DataPart;

interface A2AMessage {
  role: 'user' | 'agent';
  parts: Part[];
}

interface Artifact {
  id: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

interface Task {
  id: string;
  contextId?: string;
  status: TaskStatus;
  artifacts?: Artifact[];
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// --- Skill-to-tool mapping ---

interface ToolMapping {
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Maps a natural language message or structured request to an MCP tool call.
 * If the message contains a JSON `skill` field, uses it directly.
 * Otherwise, uses keyword matching.
 */
function mapMessageToTool(message: A2AMessage): ToolMapping | null {
  // Check for structured data parts first
  for (const part of message.parts) {
    if (part.type === 'data' && part.data) {
      const d = part.data;
      if (d.skill || d.tool) {
        const skillId = (d.skill || d.tool) as string;
        const args = (d.arguments || d.args || {}) as Record<string, unknown>;
        return { tool: skillIdToToolName(skillId), args };
      }
    }
  }

  // Fall back to text-based keyword matching
  const textParts = message.parts
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text.toLowerCase())
    .join(' ');

  if (!textParts) return null;

  // Order matters — more specific patterns first
  if (/(?:verify|check).+hash/i.test(textParts) || /hash.+(?:verify|valid)/i.test(textParts)) {
    const hashMatch = textParts.match(/[a-f0-9]{64}/);
    if (hashMatch) {
      return { tool: 'ambr_verify_hash', args: { hash: hashMatch[0] } };
    }
    return { tool: 'ambr_verify_hash', args: {} };
  }

  if (/(?:status|state|lifecycle).+(?:contract|amb-)/i.test(textParts) || /(?:contract|amb-).+(?:status|state)/i.test(textParts)) {
    const idMatch = extractContractId(textParts);
    return { tool: 'ambr_get_contract_status', args: idMatch ? { id: idMatch } : {} };
  }

  if (/(?:handshake|accept|reject|request.?changes).+contract/i.test(textParts) || /contract.+(?:handshake|accept|reject)/i.test(textParts)) {
    const idMatch = extractContractId(textParts);
    const intent = /reject/i.test(textParts) ? 'reject' : /request.?change/i.test(textParts) ? 'request_changes' : 'accept';
    return { tool: 'ambr_agent_handshake', args: { contract_id: idMatch || '', intent } };
  }

  if (/(?:create|generate|draft|make|new).+contract/i.test(textParts)) {
    // Try to extract structured params from the text
    return { tool: 'ambr_create_contract', args: extractCreateParams(textParts) };
  }

  if (/(?:get|retrieve|fetch|show|find).+contract/i.test(textParts)) {
    const idMatch = extractContractId(textParts);
    return { tool: 'ambr_get_contract', args: idMatch ? { id: idMatch } : {} };
  }

  if (/(?:list|browse|show|what).+template/i.test(textParts) || /template/i.test(textParts)) {
    return { tool: 'ambr_list_templates', args: {} };
  }

  return null;
}

function skillIdToToolName(skillId: string): string {
  const mapping: Record<string, string> = {
    create_contract: 'ambr_create_contract',
    list_templates: 'ambr_list_templates',
    get_contract: 'ambr_get_contract',
    verify_hash: 'ambr_verify_hash',
    get_status: 'ambr_get_contract_status',
    agent_handshake: 'ambr_agent_handshake',
    handshake: 'ambr_agent_handshake',
  };
  return mapping[skillId] || `ambr_${skillId}`;
}

function extractContractId(text: string): string | null {
  // Match amb-YYYY-NNNN format
  const ambMatch = text.match(/amb-\d{4}-\d{4}/);
  if (ambMatch) return ambMatch[0];

  // Match SHA-256 hash
  const hashMatch = text.match(/[a-f0-9]{64}/);
  if (hashMatch) return hashMatch[0];

  // Match UUID
  const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (uuidMatch) return uuidMatch[0];

  return null;
}

function extractCreateParams(text: string): Record<string, unknown> {
  // Basic extraction — agents should use structured data parts for reliable creation
  const params: Record<string, unknown> = {};

  // Try to extract template hint
  if (/delegation|authorize|power of attorney/i.test(text)) {
    params.template_hint = 'delegation';
  } else if (/api|access|compute|service/i.test(text)) {
    params.template_hint = 'commerce';
  }

  return params;
}

// --- Tool execution (bridges to MCP server) ---
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  apiKey: string | undefined,
): Promise<{ text: string; data?: Record<string, unknown>; isError: boolean }> {
  // Lazy import to avoid circular dependency
  const { handleMcpMessage } = await import('@/lib/mcp/server');

  // Bridge to MCP: construct a tools/call JSON-RPC request
  const mcpRequest = {
    jsonrpc: '2.0' as const,
    id: 'a2a-bridge',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  };

  const mcpResponse = await handleMcpMessage(mcpRequest, apiKey);

  if (!mcpResponse) {
    return { text: 'No response from tool.', isError: true };
  }

  if (mcpResponse.error) {
    return { text: mcpResponse.error.message, isError: true };
  }

  const result = mcpResponse.result as {
    content?: { type: string; text: string }[];
    isError?: boolean;
  };

  if (!result?.content?.length) {
    return { text: 'Empty result.', isError: true };
  }

  const text = result.content.map((c) => c.text).join('\n');
  return { text, isError: result.isError ?? false };
}

// --- JSON-RPC helpers ---

function jsonRpcOk(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, data } };
}

// --- A2A method handlers ---

async function handleSendMessage(
  params: Record<string, unknown>,
  apiKey: string | undefined,
): Promise<JsonRpcResponse> {
  const id = (params.id as string) || null;
  const message = params.message as A2AMessage | undefined;

  if (!message?.parts?.length) {
    return jsonRpcError(id, -32602, 'message.parts is required and must be non-empty');
  }

  // Auth check for write operations
  const toolMapping = mapMessageToTool(message);

  if (!toolMapping) {
    // Can't determine what the agent wants — ask for clarification
    const task: Task = {
      id: randomUUID(),
      status: {
        state: 'input_required',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: "I couldn't determine what you need. Available skills: create_contract, list_templates, get_contract, verify_hash, get_status. Please specify a skill or describe your request more clearly.",
            },
          ],
        },
      },
    };
    return jsonRpcOk(id, { task });
  }

  // Check auth for tools that need it
  const needsAuth = ['ambr_create_contract', 'ambr_agent_handshake'].includes(toolMapping.tool);
  if (needsAuth && !apiKey) {
    // Return input_required with x402 pricing info so agents can pay per-contract
    const task: Task = {
      id: randomUUID(),
      status: {
        state: 'input_required',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: 'Payment required. Options: (1) Send USDC on Base to the recipient wallet and include the tx hash in the X-Payment header, or (2) pass an API key via the X-API-Key header.',
            },
            {
              type: 'data',
              data: {
                x402: {
                  version: '2',
                  currency: 'USDC',
                  chain: 'base',
                  recipient: process.env.NEXT_PUBLIC_WALLET_ADDRESS || '',
                  accepts: ['exact', 'overpay'],
                  pricing: {
                    'd1-general-auth': '$2.00',
                    'd2-limited-service': '$1.50',
                    'd3-fleet-auth': '$5.00',
                    'c1-api-access': '$3.00',
                    'c2-compute-sla': '$4.00',
                    'c3-task-execution': '$3.50',
                    'a1-service-purchase': '$0.30',
                    'a2-ai-subscription': '$0.30',
                    'a3-warranty-liability': '$0.30',
                    'p1-nda': '$0.50',
                  },
                },
                alternative: {
                  method: 'api_key',
                  header: 'X-API-Key',
                  activate_url: 'https://getamber.dev/activate',
                },
              },
            },
          ],
        },
      },
    };
    return jsonRpcOk(id, { task });
  }

  // Rate limit
  if (apiKey) {
    const rl = rateLimit(`a2a:${apiKey.slice(0, 8)}`, 10, 60_000);
    if (!rl.allowed) {
      const task: Task = {
        id: randomUUID(),
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Rate limit exceeded. Retry after ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
              },
            ],
          },
        },
      };
      return jsonRpcOk(id, { task });
    }
  }

  // Execute the tool
  const result = await executeTool(toolMapping.tool, toolMapping.args, apiKey);

  if (result.isError) {
    const task: Task = {
      id: randomUUID(),
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: result.text }],
        },
      },
    };
    return jsonRpcOk(id, { task });
  }

  // Build successful task with artifact
  const artifactParts: Part[] = [{ type: 'text', text: result.text }];
  if (result.data) {
    artifactParts.push({ type: 'data', data: result.data });
  }

  const task: Task = {
    id: randomUUID(),
    status: {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: `Completed: ${toolMapping.tool}` }],
      },
    },
    artifacts: [
      {
        id: randomUUID(),
        parts: artifactParts,
        metadata: { tool: toolMapping.tool, timestamp: new Date().toISOString() },
      },
    ],
  };

  return jsonRpcOk(id, { task });
}

function handleGetTask(params: Record<string, unknown>): JsonRpcResponse {
  const id = (params.id as string) || null;
  // Stateless on Vercel — tasks complete synchronously in message/send
  // No task storage. Return not_found.
  return jsonRpcError(id, -32001, 'Task not found. Ambr processes tasks synchronously — results are returned in the message/send response.');
}

function handleCancelTask(params: Record<string, unknown>): JsonRpcResponse {
  const id = (params.id as string) || null;
  return jsonRpcError(id, -32001, 'Task not found. Ambr processes tasks synchronously — they cannot be canceled.');
}

// --- Main handler ---

export async function handleA2AMessage(
  body: unknown,
  apiKey: string | undefined,
): Promise<JsonRpcResponse> {
  if (!body || typeof body !== 'object' || !('method' in body)) {
    return jsonRpcError(null, -32600, 'Invalid Request: must be a JSON-RPC 2.0 object with method field');
  }

  const req = body as JsonRpcRequest;
  const id = req.id ?? null;

  switch (req.method) {
    case 'message/send':
    case 'SendMessage':
      return handleSendMessage(req.params ?? {}, apiKey);

    case 'tasks/get':
    case 'GetTask':
      return handleGetTask(req.params ?? {});

    case 'tasks/cancel':
    case 'CancelTask':
      return handleCancelTask(req.params ?? {});

    default:
      return jsonRpcError(id, -32601, `Method not found: ${req.method}. Supported: message/send, tasks/get, tasks/cancel`);
  }
}
