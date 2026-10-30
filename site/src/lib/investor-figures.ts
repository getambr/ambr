import { readFile } from 'fs/promises';
import path from 'path';

export interface YearCard {
  label: string;
  revenue: string;
  ebitda: string;
  margin: string;
  share: string;
}

export interface InvestorFigures {
  metadataDescription: string;
  hero: string;
  ask: {
    headline: string;
    subhead: string;
    contactCta: string;
    round: string;
    cap: string;
    minCheque: string;
  };
  /**
   * Exit + distribution optionality; only model-confirmed figures live here.
   * Any surface that renders triggers must render safeCaveat and lowClause.
   */
  liquidity: {
    capMultiple: string;
    capNote: string;
    /** Follows the M36 ARR on the brief page. */
    pricingClause: string;
    /** Introduces the Exit/Hold pair on the brief page. */
    conversionLine: string;
    window: string;
    triggers: { threshold: string; label: string; model: string }[];
    exitNote: string;
    holdNote: string;
    safeCaveat: string;
    lowClause: string;
    footer: string;
  };
  /** Copy used only by /investors/brief. */
  brief: {
    status: { label: string; value: string; note: string }[];
    modelNote: string;
    team: string;
  };
  team: { name: string; role: string; detail: string }[];
  /** Deck releases listed in the shipping log on /investors. */
  deckLog: { version: string; date: string; body: string }[];
  deck: {
    tag: string;
    title: string;
    slideCount: number;
    pdfFilename: string;
    modelFilename: string;
    modelButtonLabel: string;
    insideBullets: { label: string; body: string }[];
  };
  model: {
    tag: string;
    title: string;
    scenarioNote?: string;
    /** Prominent notice: cash flow / burn / runway are calculated on the LOW scenario. */
    cashflowNote?: string;
    /** Scenario staircase — each tier's 2028 exit run-rate + the driver that unlocks it. */
    tiers?: {
      name: string;
      value: string;
      driver: string;
      published?: boolean;
      /** Tier the cash plan is computed on (model: Assumptions!B6 selector). */
      cashBasis?: boolean;
      /** Tier the cash buffer is sized to absorb. */
      buffered?: boolean;
    }[];
    years: { y1: YearCard; y2: YearCard; y3: YearCard };
    /** One-line caption reconciling in-year revenue vs exit run-rate vs M36 ARR. */
    reconciliation2028?: string;
    m36Arr: string;
    /** 3-yr cumulative net income, not EBITDA. */
    cumulativeNetIncome: string;
    peakBurn: string;
    assumptions: string;
  };
  pricing: {
    heading: string;
    tiers: { tier: string; price: string; note: string }[];
    variableCostNote: string;
  };
}

const PLACEHOLDER: InvestorFigures = {
  metadataDescription: 'Password-gated investor package for Ambr.',
  hero: 'Full briefing available after authentication.',
  ask: {
    headline: 'Round terms available after authentication',
    subhead: '',
    contactCta:
      'Round details are shared after authentication. Email the team below for access.',
    round: '—',
    cap: '—',
    minCheque: '—',
  },
  // Redacted, not zeroed: the gate is what withholds these, so the fallback
  // must never read as "the terms are ≥0" to someone who is not authenticated.
  liquidity: {
    capMultiple: '—',
    capNote: 'Round pricing is shared after authentication.',
    pricingClause: '',
    conversionLine: '',
    window: '—',
    triggers: [],
    exitNote: 'Available after authentication.',
    holdNote: 'Available after authentication.',
    safeCaveat: '',
    lowClause: '',
    footer: '',
  },
  brief: {
    status: [
      { label: 'MVP funding', value: '—', note: '' },
      { label: 'Net-cash-positive', value: '—', note: '' },
    ],
    modelNote: '',
    team: 'Available after authentication.',
  },
  team: [],
  deckLog: [],
  deck: {
    tag: 'Pitch Deck',
    title: 'Briefing',
    slideCount: 0,
    pdfFilename: 'ambr-pitch-deck.pdf',
    modelFilename: 'ambr-financial-model.xlsx',
    modelButtonLabel: 'Download Financial Model (xlsx)',
    insideBullets: [{ label: 'Briefing contents', body: 'Available after authentication.' }],
  },
  model: {
    tag: 'Financial Model',
    title: 'Available after authentication',
    years: {
      y1: { label: 'Year 1', revenue: '—', ebitda: '—', margin: '—', share: '—' },
      y2: { label: 'Year 2', revenue: '—', ebitda: '—', margin: '—', share: '—' },
      y3: { label: 'Year 3', revenue: '—', ebitda: '—', margin: '—', share: '—' },
    },
    m36Arr: '—',
    cumulativeNetIncome: '—',
    peakBurn: '—',
    assumptions: 'Detailed assumptions are shared in the gated package.',
  },
  pricing: {
    heading: 'Pricing',
    tiers: [{ tier: 'Pricing', price: '—', note: 'after authentication' }],
    variableCostNote: 'Unit economics are shared in the gated package.',
  },
};

export async function loadInvestorFigures(): Promise<InvestorFigures> {
  try {
    const filePath = path.join(process.cwd(), 'private-data', 'investor-figures.json');
    const raw = await readFile(filePath, 'utf-8');
    // Sections an older figures file lacks fall back to the redacted ones.
    return { ...PLACEHOLDER, ...(JSON.parse(raw) as Partial<InvestorFigures>) };
  } catch {
    return PLACEHOLDER;
  }
}
