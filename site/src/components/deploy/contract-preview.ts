/**
 * Lightweight contract preview generator for the chat-driven deploy flow.
 *
 * NOT a contract generator — we use Haiku for that at deploy time
 * (POST /api/v1/contracts). This module produces a human-readable
 * SKETCH of what the final contract will look like, with placeholders
 * for missing fields. Updates live as the user fills in parameters
 * via chat. Zero LLM cost, zero latency.
 *
 * For v1, supports the three chat-driven templates: A1, D1, C1.
 */

import { V1_CHAT_TEMPLATES } from '@/lib/llm/prompts';

export const TEMPLATE_PRICING_USD: Record<string, number> = {
  'a1-service-purchase': 0.20,
  'd1-general-auth': 0.50,
  'c1-api-access': 1.00,
};

export const TEMPLATE_NAMES: Record<string, string> = {
  'a1-service-purchase': 'A1 — Service Purchase Agreement',
  'd1-general-auth': 'D1 — General Agent Authorization',
  'c1-api-access': 'C1 — API Access Agreement',
};

interface PreviewSection {
  label: string;
  field: string;
  format?: 'currency' | 'duration' | 'wallet' | 'percent';
}

const PREVIEW_SECTIONS: Record<string, PreviewSection[]> = {
  'a1-service-purchase': [
    { label: 'Consumer', field: 'consumer_name' },
    { label: 'Consumer email', field: 'consumer_email' },
    { label: 'Provider', field: 'provider_name' },
    { label: 'Provider agent', field: 'provider_agent_id', format: 'wallet' },
    { label: 'Service', field: 'service_description' },
    { label: 'Fee', field: 'fee', format: 'currency' },
    { label: 'Currency', field: 'currency' },
    { label: 'Delivery timeline', field: 'delivery_timeline' },
    { label: 'Refund policy', field: 'refund_policy' },
    { label: 'Cooling-off', field: 'cooling_off_days', format: 'duration' },
    { label: 'Governing law', field: 'governing_law' },
  ],
  'd1-general-auth': [
    { label: 'Principal', field: 'principal_name' },
    { label: 'Principal type', field: 'principal_type' },
    { label: 'Registration', field: 'principal_registration_number' },
    { label: 'Address', field: 'principal_address' },
    { label: 'Agent wallet', field: 'agent_id', format: 'wallet' },
    { label: 'Scope', field: 'scope' },
    { label: 'Categories', field: 'categories' },
    { label: 'Per-tx cap', field: 'spending_limit_per_tx', format: 'currency' },
    { label: 'Monthly cap', field: 'spending_limit_monthly', format: 'currency' },
    { label: 'Duration', field: 'duration_months', format: 'duration' },
    { label: 'Governing law', field: 'governing_law' },
  ],
  'c1-api-access': [
    { label: 'Buyer', field: 'buyer_name' },
    { label: 'Buyer agent', field: 'buyer_agent_id', format: 'wallet' },
    { label: 'Seller', field: 'seller_name' },
    { label: 'API endpoint', field: 'api_endpoint' },
    { label: 'Pricing model', field: 'pricing_model' },
    { label: 'Price per call', field: 'price_per_call', format: 'currency' },
    { label: 'Currency', field: 'currency' },
    { label: 'SLA uptime', field: 'sla_uptime_percent', format: 'percent' },
    { label: 'Governing law', field: 'governing_law' },
  ],
};

function formatValue(value: unknown, format?: 'currency' | 'duration' | 'wallet' | 'percent'): string {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value);
  switch (format) {
    case 'currency':
      return typeof value === 'number' ? `$${value.toLocaleString()}` : str;
    case 'duration':
      return /^\d+$/.test(str) ? `${str} ${Number(str) === 1 ? 'month' : 'months'}` : str;
    case 'wallet':
      return str.length > 12 ? `${str.slice(0, 6)}…${str.slice(-4)}` : str;
    case 'percent':
      return /^\d+(\.\d+)?$/.test(str) ? `${str}%` : str;
    default:
      return str;
  }
}

export interface PreviewRow {
  label: string;
  field: string;
  value: string;
  isFilled: boolean;
}

export function buildPreview(
  template: string | null,
  params: Record<string, unknown>,
): { templateName: string | null; priceUsd: number | null; rows: PreviewRow[]; introText: string } {
  if (!template) {
    return {
      templateName: null,
      priceUsd: null,
      rows: [],
      introText:
        'Your contract will appear here as we talk. Tell Ambr Agent what you need — for example: "I want to let my AI assistant book flights up to $2,000 per trip" — and the preview will fill in live.',
    };
  }

  const sections = PREVIEW_SECTIONS[template] ?? [];
  const rows: PreviewRow[] = sections.map((s) => {
    const value = params[s.field];
    const formatted = formatValue(value, s.format);
    return {
      label: s.label,
      field: s.field,
      value: formatted || '⌽ awaiting…',
      isFilled: formatted !== '',
    };
  });

  const introText = getTemplateIntro(template, params);

  return {
    templateName: TEMPLATE_NAMES[template] ?? template,
    priceUsd: TEMPLATE_PRICING_USD[template] ?? null,
    rows,
    introText,
  };
}

function getTemplateIntro(template: string, params: Record<string, unknown>): string {
  switch (template) {
    case 'a1-service-purchase': {
      const consumer = params.consumer_name as string | undefined;
      const service = params.service_description as string | undefined;
      const provider = params.provider_name as string | undefined;
      return [
        consumer ? `${consumer}` : '[Consumer]',
        ' agrees to purchase ',
        service ? `"${service}"` : '[service description]',
        ' from ',
        provider ? provider : '[provider]',
        ' under the terms below, with full consumer protection including cooling-off, refund, and GDPR data handling.',
      ].join('');
    }
    case 'd1-general-auth': {
      const principal = params.principal_name as string | undefined;
      const agentId = params.agent_id as string | undefined;
      const scope = params.scope as string | undefined;
      const monthly = params.spending_limit_monthly;
      return [
        principal ? `${principal}` : '[Principal]',
        ' hereby authorizes the AI agent identified by wallet ',
        agentId ? `${agentId.slice(0, 6)}…${agentId.slice(-4)}` : '[agent wallet]',
        ' to act on its behalf within the scope of ',
        scope ? `"${scope}"` : '[delegation scope]',
        monthly ? ` and a monthly spending cap of $${monthly}` : '',
        '. Any electronic signature created by the Agent within this scope shall be deemed the act of the Principal.',
      ].join('');
    }
    case 'c1-api-access': {
      const buyer = params.buyer_name as string | undefined;
      const seller = params.seller_name as string | undefined;
      const api = params.api_endpoint as string | undefined;
      return [
        buyer ? `${buyer}` : '[Buyer]',
        ' (acting through its AI agent) agrees to access the API ',
        api ? `"${api}"` : '[API endpoint]',
        ' provided by ',
        seller ? seller : '[seller]',
        ' under the pricing, rate-limit, and SLA terms below. Payments may be settled via x402 with the contract hash in payment metadata.',
      ].join('');
    }
    default:
      return '';
  }
}

export function templateOptionsForChips() {
  return V1_CHAT_TEMPLATES;
}
