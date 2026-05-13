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
  };
  deck: {
    tag: string;
    title: string;
    slideCount: number;
    pdfFilename: string;
    modelFilename: string;
    modelButtonLabel: string;
  };
  model: {
    tag: string;
    title: string;
    years: { y1: YearCard; y2: YearCard; y3: YearCard };
    m36Arr: string;
    cumulativeEbitda: string;
    peakBurn: string;
    assumptions: string;
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
  },
  deck: {
    tag: 'Pitch Deck',
    title: 'Briefing',
    slideCount: 0,
    pdfFilename: 'ambr-pitch-deck.pdf',
    modelFilename: 'ambr-financial-model.xlsx',
    modelButtonLabel: 'Download Financial Model (xlsx)',
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
    cumulativeEbitda: '—',
    peakBurn: '—',
    assumptions: 'Detailed assumptions are shared in the gated package.',
  },
};

export async function loadInvestorFigures(): Promise<InvestorFigures> {
  try {
    const filePath = path.join(process.cwd(), 'private-data', 'investor-figures.json');
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as InvestorFigures;
  } catch {
    return PLACEHOLDER;
  }
}
