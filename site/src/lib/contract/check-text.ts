import { CURRENCY_CODES } from '@/lib/contract-capabilities';

/**
 * Text helpers of the payment check: key and entry normalisation, what counts as
 * a figure, and the shape of a `not_checked` entry. No server imports.
 */

/** What kind of thing the check handed back to the caller to read. */
export type NotCheckedKind =
  | 'free_text_answer'
  | 'agreement_text'
  | 'list_entry'
  | 'basis_wording'
  | 'condition'
  | 'flag';

/**
 * A part of the agreement the check did not evaluate and the caller must read
 * itself. Paths only, never the text: the check route serves anonymous callers,
 * and the text is read through the normal contract read, which has its own access rules.
 */
export interface NotChecked {
  path: string;
  kind: NotCheckedKind;
  why: string;
}

/** Entries named in a response; the rest are counted. */
export const MAX_NOT_CHECKED = 30;

/** Every key is folded before any key-based classification: camelCase split, anything but letters and digits to `_`, lower case. */
export const normKey = (k: string) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** The end of `s` with every trailing character the test accepts cut off. A loop, never `/x+$/`: that backtracks quadratically on a long run followed by another character. */
function trimEndWhile(s: string, drop: (c: string) => boolean): string {
  let end = s.length;
  while (end > 0 && drop(s[end - 1])) end--;
  return end === s.length ? s : s.slice(0, end);
}

/** Case, spaces, dots, colons and hyphens fold to one underscore; separators at either end are dropped ('Gambling.' is 'gambling'). */
export const normEntry = (s: string) => trimEndWhile(s.trim().toLowerCase().replace(/[\s.:-]+/g, '_').replace(/^_+/, ''), (c) => c === '_');

/** Values that say, in words, that there is nothing here ("None", "N/A"). Not terms. */
const EMPTY_TERMS = new Set([
  '',
  'none',
  'n/a',
  'na',
  'nil',
  'null',
  '-',
  '--',
  '—',
  'not applicable',
  'not specified',
  'none specified',
  'none stated',
  'none identified',
]);

export function isEmptyTerm(text: string): boolean {
  const t = trimEndWhile(text.trim().toLowerCase(), (c) => c === '.' || c.trim() === '');
  return t.length <= 24 && EMPTY_TERMS.has(t);
}

/**
 * What counts as a figure. The classifier fails closed: ANY digit in a value, a
 * key or a free-text answer is a figure, unless the whole value is one of a few
 * shapes that cannot be an amount (a date, a hash or wallet, an identifier, a
 * version under a version key, a legal citation inside a recital, a duration or
 * uptime or rate by its shape). The exemptions are anchored to the whole value;
 * a value that carries a currency, or credit, refund or penalty wording, is never
 * exempt as a metric. Every pattern here is linear in the length of the string,
 * and a string longer than MAX_ANALYSED that holds a digit is a figure without
 * being analysed, because anonymous callers reach this code.
 */

/** Longest string the exemption patterns are run on. */
export const MAX_ANALYSED = 2000;

/**
 * Any Unicode number: decimal digits (full-width, Arabic-Indic), and superscripts, Roman
 * numerals and circled digits, which are not \p{Nd}. Strings with a non-ASCII character are
 * also tested after NFKC, which turns those into plain digits.
 */
const ANY_NUMBER = /\p{N}/u;
export const hasDigit = (s: string) => ANY_NUMBER.test(s) || (/[^\u0000-\u007f]/.test(s) && ANY_NUMBER.test(s.normalize('NFKC')));

/**
 * The text as the word checks read it: compatibility forms folded (NFKD), then every combining mark and
 * format character dropped (zero-width spaces and joiners, soft hyphens, U+034F). They split a word
 * without changing how it reads, and NFKD first keeps a letter and its mark apart.
 */
const fold = (s: string) => (/[^\u0000-\u007f]/.test(s) ? s.normalize('NFKD').replace(/[\p{M}\p{Cf}]/gu, '') : s);

/**
 * A key that names money or a limit: any digit under it is a figure. Whole `_`-separated words only, so
 * "capabilities" and "escape" are not "cap". A limit's exact names are also caught by isLimitName.
 */
const MONEY_KEY_WORDS =
  'fees?|prices?|costs?|caps?|limit(?:s|ed|ing)?|budgets?|amounts?|credits?|penalt(?:y|ies)|charg(?:e|es|ed|ing)|payments?|spend(?:s|ing)?|thresholds?|maximum|max|totals?|usd|usdc|eur|currenc(?:y|ies)|values?|balances?|deposits?|refunds?|liabilit(?:y|ies)|allowances?|retainers?|stipends?|payouts?|rewards?|salar(?:y|ies)|wages?|royalt(?:y|ies)|bonus(?:es)?|ceilings?|quotas?|escrow|collateral|compensation|premiums?|tariffs?|rebates?|discounts?|allocations?';
export const MONEYISH = new RegExp(`(?:^|_)(?:${MONEY_KEY_WORDS})(?:_|$)`);

/** Words in a token or a contact value that make it a limit statement, not a name. */
const LIMITISH = /(max|min|cap|limit|fee|price|cost|budget|amount|credit|penalt|charge|payment|spend|threshold|total|usd|eur|gbp|currency|value|balance|deposit|refund|liabilit|above|below|exceed|approv|escalat|quota)/i;
export const LIMIT_WORDS = /\b(?:max(?:imum)?|min(?:imum)?|cap|capped|limit\w*|up to|at most|at least|above|below|over|under|more than|less than|exceed\w*|budget|threshold|spend\w*|pay\w*|price\w*|cost\w*|approv\w*|per)\b/i;

/**
 * The number words that are a figure whatever stands beside them: two to nineteen, the tens, and the orders from hundred
 * up (plural too), a dozen, a grand. "One" and "zero" are read apart: they are also names, pronouns and idioms.
 */
const STRONG_WORDS =
  'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|trillions?|dozens?|grands?';
const STRONG_WORD = new RegExp(`^(?:${STRONG_WORDS})$`);
const STRONG_SEARCH = new RegExp(`(?<![A-Za-z])(?:${STRONG_WORDS})(?![A-Za-z])`, 'i');
/** Number words written together ("thirtyfive", "fivehundred", "onehundred"): one token that is nothing else. */
const COMPOUND_WORD = new RegExp(`^(?:${STRONG_WORDS}|one|zero){2,}$`);
/** A number spelled out ("thirty dollars"), wherever it stands. */
export const hasNumberWord = (s: string) => STRONG_SEARCH.test(fold(s));

/** A number spelled out, "one" included except as "one-time", "one-off", "one way", "one of" and the like. */
const MONEY_NUMBER_WORD = new RegExp(`(?<![A-Za-z])(?:one(?![\\s_-]*(?:time|off|way|of|another|day|party))|${STRONG_WORDS})(?![A-Za-z])`, 'i');

/** Crypto assets and units that are not in the currency list the agreement forms read. */
const EXTRA_CODES = ['ETH', 'WETH', 'BTC', 'WBTC', 'SOL', 'XRP', 'BNB', 'LTC', 'XLM', 'DOGE', 'MATIC', 'TRX', 'AVAX', 'SATS'];
const CODE_ALT = [...CURRENCY_CODES, ...EXTRA_CODES].join('|');
// "Glued" to digits is the same as spaced ("500CHF"): only a letter on either side breaks a code or word.
const CODE_WORD = new RegExp(`(?<![A-Za-z])(?:${CODE_ALT})(?![A-Za-z])`, 'i');
const CURRENCY_SYMBOL = /[$€£¥₹₽₩₿]/;
const MONEY_WORDS = /(?<![A-Za-z])(?:dollars?|bucks?|cents?|euros?|pounds?|quid|yen|francs?|pesos?|rupees?|sats|satoshis?|wei|gwei|lamports?|bitcoins?|ether|ethereum|solana|stablecoins?|cash|money|funds?|credits?|refunds?|penalt(?:y|ies)|fees?|charges?|prices?|costs?|discounts?|rebates?|fines?|compensation|damages|liabilit(?:y|ies)|budget|payments?|pay|paid|spend|spent|spending|invoices?|tokens?|allowances?|retainers?|stipends?|salary|salaries|wages?|payouts?|rewards?|royalt(?:y|ies)|bonus(?:es)?|tips?)(?![A-Za-z])/i;
/** A number in scientific notation ("1e3", "2.5E+3"). */
const SCIENTIFIC = /(?<![A-Za-z0-9.])\d+(?:\.\d+)?e[+-]?\d+(?![A-Za-z0-9])/i;

/** An amount written without a currency: a "5k", "2m", "5mm" or "3bn" suffix, or digits grouped by a space, dot or quote ("5 000", "1.000.000"). */
const AMOUNT_STYLE = /\d\s?(?:k|m|mm|mn|bn|b)\b|\d[ .'\u2019\u00a0]\d{3}(?!\d)/i;

/** A currency symbol or code, or a money word, in any spelling NFKC folds: the letters of money only, never an amount style, which a hex token holds by chance ("e89b-", "3e45"). */
export function hasCurrencyOrMoneyWord(s: string): boolean {
  const n = fold(s);
  return CURRENCY_SYMBOL.test(n) || CODE_WORD.test(n) || MONEY_WORDS.test(n);
}

/** A currency symbol or code, money wording, an amount style or scientific notation, in any spelling NFKC folds. A percent sign alone is not money. */
export function hasMoneySignal(s: string): boolean {
  const n = fold(s);
  return CURRENCY_SYMBOL.test(n) || CODE_WORD.test(n) || MONEY_WORDS.test(n) || AMOUNT_STYLE.test(n) || SCIENTIFIC.test(n);
}

/** Money written in number words ("thirty dollars", "at most two hundred USD"): a figure whatever key it sits under. */
export function moneyInWords(s: string): boolean {
  const n = fold(s);
  return MONEY_NUMBER_WORD.test(n) && hasMoneySignal(n);
}

const CURRENCY_NAMES: Record<string, string> = {
  'us dollar': 'USD',
  'us dollars': 'USD',
  'u.s. dollar': 'USD',
  'u.s. dollars': 'USD',
  'usd dollars': 'USD',
  'united states dollar': 'USD',
  'united states dollars': 'USD',
  dollar: 'USD',
  dollars: 'USD',
  euro: 'EUR',
  euros: 'EUR',
  pound: 'GBP',
  pounds: 'GBP',
  'pound sterling': 'GBP',
  'pounds sterling': 'GBP',
  'usd coin': 'USDC',
};
const SYMBOL_CURRENCY: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' };

/** The code for a currency written as a code ("usdc") or by name ("US Dollars"); undefined for anything else. */
export function currencyOf(text: string): string | undefined {
  const t = text.trim();
  if (t.length > 24) return undefined;
  if (/^[A-Za-z]{3,5}$/.test(t) && CURRENCY_CODES.has(t.toUpperCase())) return t.toUpperCase();
  return CURRENCY_NAMES[t.toLowerCase().replace(/\s+/g, ' ')];
}

const DATE_VALUE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const YEAR_VALUE = /^(?:19|20)\d{2}$/;
const ISO_VALUE = /^ISO[\s_-]?\d{1,6}(?:-\d{1,3})*(?::\d{4})?$/i;
const HEX_WALLET = /^0x[0-9a-f]{40,}$/i;
const HASH_VALUE = /^[0-9a-f]{32,128}$/i;
/** Hex lengths of the digests in use (MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512). */
const SHA_LENGTHS = new Set([32, 40, 56, 64, 96, 128]);
const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTRACT_ID = /^amb(?:er)?-\d{4}-\d{3,}$/i;
const BASE58_VALUE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EMAIL_VALUE = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const URL_VALUE = /^https?:\/\/\S+$/i;
const VERSION_VALUE = /^v?\d+(?:\.\d+){0,3}$/i;
const RATE_VALUE = /^(?:(?:up to|max(?:imum)?(?: of)?|at most|about|approximately)\s+)?\d{1,9}(?:,\d{3})*\s*(?:(?:requests?|calls?|reqs?|queries)\s*(?:per|\/|a)\s*(?:minute|min|second|sec|hour)|rpm|rps|qps|req\/s)$/i;

/** A calendar date or timestamp that parses. */
export const isDateValue = (s: string) => DATE_VALUE.test(s) && !Number.isNaN(Date.parse(s));

/** A hex string that is a number padded with zeros ("0x00…07d0", how an amount is written on chain): at most 16 digits once the padding is gone. */
const isEncodedNumber = (s: string) => s.replace(/^0x/i, '').replace(/^0+/, '').length <= 16;

/** Shapes that no spelling of an amount can take: a wallet of 40 or more hex characters, a UUID, a digest of a known length, a base58 wallet. They are exempt under any key, in any context. */
const isStrongId = (s: string) =>
  (HEX_WALLET.test(s) && !isEncodedNumber(s)) ||
  UUID_VALUE.test(s) ||
  (HASH_VALUE.test(s) && SHA_LENGTHS.has(s.length) && /[a-f]/i.test(s) && !isEncodedNumber(s)) ||
  (BASE58_VALUE.test(s) && /[A-Za-z]/.test(s) && /\d/.test(s));

/**
 * A short token with letters in it ("v1", "sha256", "x402"): an identifier, not an amount. Every part
 * that holds digits must be letters then digits with the letters on a short allow-list, so a currency,
 * a unit or a limit word glued to digits ("500CHF", "5ETH", "cap500") never qualifies, and neither
 * does anything that carries money or is written in scientific notation.
 */
const TOKEN_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.:/#@+-]{0,127}$/;
const ID_PREFIX = /^(?:[a-z]|sha|md|ipv|rfc|iso|utf|aes|rsa|ed|es|ec|eip|erc|bip|http|oauth|web)$/i;
function isIdentifierToken(s: string): boolean {
  if (!TOKEN_VALUE.test(s) || LIMITISH.test(s) || !/[A-Za-z]/.test(s) || hasMoneySignal(s)) return false;
  for (const part of s.split(/[-_.:/#@+]+/)) {
    if (!/\d/.test(part)) continue;
    const m = /^([A-Za-z]+)\d+$/.exec(part);
    if (!m || !ID_PREFIX.test(m[1])) return false;
  }
  return true;
}

const UNIT_WORDS = new Set([
  'ms', 'millisecond', 'milliseconds', 's', 'sec', 'secs', 'second', 'seconds', 'min', 'mins', 'minute', 'minutes', 'h', 'hr', 'hrs', 'hour', 'hours',
  'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years', 'yr', 'yrs', 'percent',
]);
const NEUTRAL_WORDS = new Set([
  'notice', 'written', 'prior', 'advance', 'after', 'before', 'termination', 'cancellation', 'uptime', 'availability', 'monthly', 'annual', 'annually',
  'yearly', 'weekly', 'daily', 'hourly', 'of', 'the', 'a', 'an', 'at', 'least', 'within', 'on', 'in', 'business', 'calendar', 'working', 'response',
  'time', 'latency', 'minimum', 'guaranteed', 'guarantee', 'commitment', 'measured', 'per', 'and', 'or', 'less', 'than', 'better', 'from', 'receipt',
  'sla', 'target', 'average', 'mean', 'median', 'retention', 'period', 'term', 'duration', 'window', 'grace', 'data', 'export', 'to', 'for', 'each',
  'every', 'is', 'are', 'be', 'by', 'with', 'upon', 'following', 'p50', 'p90', 'p95', 'p99', 'p999',
]);

/**
 * A duration, an uptime percentage or a response time, by the shape of the
 * whole value: every number is directly followed by a time unit or a percent
 * sign and every other word is neutral. Never when it carries a currency or
 * credit, refund or penalty wording.
 */
export function isMetricValue(s: string): boolean {
  if (hasMoneySignal(s)) return false;
  const tokens = s.toLowerCase().match(/p(?:50|90|95|99|999)(?![a-z0-9])|[a-z]+|\d+(?:[.,]\d+)*|%/g);
  if (!tokens) return false;
  let sawUnit = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d/.test(t)) {
      const next = tokens[i + 1];
      if (next === '%' || (next !== undefined && UNIT_WORDS.has(next))) {
        sawUnit = true;
        i++;
        continue;
      }
      return false;
    }
    if (!NEUTRAL_WORDS.has(t) && !UNIT_WORDS.has(t)) return false;
  }
  return sawUnit;
}

/** "12 months" or "2 years" as a number of months; undefined for anything else. */
export function parseMonths(text: string): number | undefined {
  const m = /^\s*(\d{1,4})\s*(months?|mos?|years?|yrs?)\s*$/i.exec(text.normalize('NFKC'));
  if (!m) return undefined;
  return /^y/i.test(m[2]) ? Number(m[1]) * 12 : Number(m[1]);
}

/** What may follow a citation's number: dotted parts of at most two digits ("5.2"), a letter or two ("15A"), a range ("9-16"), then sub-sections of one or two characters ("5(1)(a)"), never "(500)" or ".2000". */
const CITE_TAIL = '(?:\\.\\d{1,2}(?!\\d))*[A-Za-z]{0,2}(?:[-/]\\d{1,2}(?!\\d))?(?:\\((?:\\d{1,2}[a-z]?|[a-z]{1,3})\\))*';
const CITATIONS: RegExp[] = [
  new RegExp(`\\b(?:sections?|sec|arts?|articles?|clauses?|rules?|regulations?|directives?|chapters?|nos?|paras?|paragraphs?|schedules?)\\.?\\s*\\d+${CITE_TAIL}`, 'gi'),
  // "Cap. 88": capital C and the full stop. A lower-case "cap 30" is a limit.
  new RegExp(`\\bCap\\.\\s*\\d+${CITE_TAIL}`, 'g'),
  new RegExp(`\\bss?\\.\\s*\\d+${CITE_TAIL}`, 'gi'),
  new RegExp(`§+\\s*\\d+${CITE_TAIL}`, 'g'),
  // EU numbers, with a year on one side: "910/2014", "2016/679", "2000/31/EC".
  /\b(?:(?:19|20)\d{2}\/\d{1,4}|\d{1,4}\/(?:19|20)\d{2})(?:\/[A-Z]{2,3})?\b/g,
  // A year is a citation only beside a statute noun: "Act 2000", "Law of 2015".
  /\b(?:acts?|code|law|ordinance|statute|regulations?|directive|decree|convention|treaty)\b[\s,]*(?:of\s+)?(?:19|20)\d{2}\b/gi,
  /\bISO[\s_-]?\d+(?:-\d+)*(?::\d{4})?\b/gi,
  // An algorithm in a signature recital ("SHA-256").
  /\bSHA-?\d{1,3}\b/gi,
];

/** Words that make what is left of a recital a limit or an approval rule, not a citation. */
const RECITAL_VOID = /(?<![A-Za-z])(?:above|below|beyond|exceed\w*|up to|at most|at least|more than|less than|max|maximum|min|minimum|limits?|cap|caps|capped|budget|threshold|spend\w*|pay\w*|price\w*|cost\w*|per|each|every|approv\w*|sign[- ]?off|needs?|ceiling|quota|allowance|greater|larger|higher|requir\w*|consent|months?|weeks?|days?|years?|annual\w*|monthly|weekly|daily|yearly|over\s+\u0001)(?![A-Za-z])/i;

/** Text inside a recital key whose digits are all legal citations, with no money and no limit wording left over. */
function recitalOnlyCitations(s: string): boolean {
  s = fold(s);
  if (hasMoneySignal(s)) return false;
  let t = s;
  // A marker where a citation stood, so that "over <citation>" reads as a bound and "over the hash" does not.
  for (const re of CITATIONS) t = t.replace(re, ' \u0001 ');
  return !hasDigit(t.replace(/\u0001/g, ' ')) && !RECITAL_VOID.test(t);
}

const PHONE_KEYS = new Set(['phone', 'telephone', 'tel', 'fax', 'mobile', 'mobile_number', 'phone_number', 'cell', 'contact_phone', 'principal_phone']);
const PHONE_SHAPE = /^\+?\d[\d\s().-]{5,19}$/;
const CONTACT_KEYS = new Set([
  'address', 'principal_address', 'registered_address', 'street', 'street_address', 'postal_code', 'postcode', 'zip', 'zip_code',
  'registration_number', 'principal_registration_number', 'company_number', 'company_registration_number', 'vat_number', 'tax_id',
]);
/** A number written like an amount ("1,000,000.00", "12.50"), which no address or registration number holds. */
const GROUPED_OR_DECIMAL = /\d,\d{3}\b|\d\.\d{2}\b/;
const CONTACT_SHAPE = /^[\p{L}\p{N} .,#/'’()-]{1,200}$/u;

const PAYMENT_TERM_KEYS = new Set(['payment_terms', 'payment_timing']);
/** The keys a payment protocol name sits under. */
const PROTOCOL_KEYS = new Set(['protocol', 'payment_protocol', 'settlement_protocol']);
const NET_TERMS = /^net[\s_-]?\d{1,3}(?:\s*days?)?$/i;
/** "Within 30 days of invoice", "5 business days after acceptance": when a payment falls due, the whole value. */
const DUE_DATE = /^(?:within\s+)?\d{1,3}\s+(?:(?:business|calendar|working)\s+)?days?\s+(?:of|after|from)\s+(?:the\s+)?(?:invoice|receipt|acceptance|delivery|completion)(?:\s+(?:date|receipt|of\s+(?:the\s+)?(?:invoice|goods|services)))?\.?$/i;
/** The names of the payment protocol the prompts ask for (the x402 flow, "HTTP 402"): the digits in them are not an amount. */
/** What may stand beside a protocol name and leave it a name: connective words and punctuation only. */
const PROTOCOL_CONNECTIVE = /^[\s.,;:()/_-]*(?:(?:via|over|using|per call|per request|on receipt|settled|settlement|payments?|protocol|flow|and|the|an?|with)(?![A-Za-z])[\s.,;:()/_-]*)*$/i;
/** A whole word of a key that names a limit, a cap or an amount. */
const LIMIT_KEY_WORD = /(?:^|_)(?:limits?|caps?|budgets?|ceilings?|max|maximum|thresholds?|quotas?|allowances?|spend\w*|fees?|prices?|costs?|amounts?|totals?|value)(?:_|$)/;
const PROTOCOL_NAME = /(?<![A-Za-z0-9_])(?:x402|http[\s_-]?402)(?![A-Za-z0-9_])/gi;
/** A key that names a wallet, an address, an identifier or a digest: the only keys a strong id is exempt under inside a money section. */
const ID_WORD_KEY = /(^|_)(wallets?|address(?:es)?|hash(?:es)?|digests?|signatures?|uuids?|guids?|ids?|public_key|txid)(_|$)/;
/** A whole value that is only a count, as a string ("24"). */
const BARE_COUNT = /^\d{1,6}(?:\.\d+)?$/;

/**
 * Exact keys (normalised) that name a kind of value a shape may be exempt as. A shape alone never
 * exempts a value: the key must be one of these, and no money context may sit above it (see
 * textFigure). Sources: the generator's own keys (llm/prompts.ts: contract_id, created_at, start_date,
 * end_date, deadline, the agent and principal ids and wallets, the registration number, the notice,
 * retention, uptime and response keys), the repo's golden agreements, and the date keys the agreement
 * window reads (check-accounting START_KEYS and END_KEYS).
 */
export const DATE_KEYS = new Set([
  'created_at', 'updated_at', 'signed_at', 'signed_on', 'signed', 'date', 'dated', 'issued_at', 'issued_on', 'issue_date', 'deadline', 'delivery_date', 'due_date',
  'effective_date', 'start_date', 'end_date', 'expiry_date', 'expiration_date', 'expires_at', 'termination_date', 'commencement_date', 'valid_from', 'valid_until',
  'valid_to', 'effective', 'start', 'starts', 'end', 'ends', 'expiry', 'begins', 'begin_date',
]);
export const YEAR_KEYS = new Set(['year', 'year_of_issue', 'issue_year', 'effective_year', 'incorporation_year', 'year_of_incorporation', 'founded_year', 'copyright_year']);
export const ID_KEYS = new Set([
  'id', 'uuid', 'guid', 'contract_id', 'template', 'template_slug', 'slug', 'wallet', 'wallet_address', 'agent_wallet', 'address', 'hash', 'contract_hash', 'sha256', 'signature',
  'signatures', 'public_key', 'registration_number', 'principal_registration_number', 'company_number', 'company_registration_number', 'vat_number', 'tax_id', 'agent_class',
  'platform_reference', 'reconciliation_method', 'dispute_protocol', 'protocol', 'oversight_framework', 'dispute_resolution.primary',
]);
/** Any key that ends in `_id` names an identifier (agent_id, principal_agent_id, buyer_agent_id). */
export const isIdKey = (key?: string, parent?: string) => !!key && (ID_KEYS.has(key) || /_ids?$/.test(key) || (!!parent && ID_KEYS.has(`${parent}.${key}`)));

/**
 * The exact keys the generator and the template forms use for a number that is a duration, a notice or
 * retention period, an uptime or a rate (see llm/prompts.ts and ANSWER_ALIASES). A bare number under any
 * other key is a figure, whatever unit its name ends in: the key suffix says nothing about money.
 */
export const METRIC_KEYS = new Set([
  'revocation_notice_hours', 'notice_period_hours', 'notice_hours', 'cooling_off_days', 'cancellation_notice_days',
  'claim_deadline_days', 'data_retention_days', 'retention_days', 'surviving_obligations_months', 'sla_uptime_percent', 'uptime_percent',
  'sla_response_ms', 'response_time_ms', 'response_ms', 'latency_ms', 'rate_limit_rpm', 'requests_per_minute', 'rpm', 'rate_limit_per_minute',
  // The clauses the prompts name with a figure: the breach notice (hours) and the claim response timeline (days).
  'breach_notification_hours', 'response_timeline_days',
  // The burst allowance the c1 prompt asks for beside the rate limit.
  'burst', 'burst_allowance', 'burst_limit',
]);
/** The metric keys that stay exempt inside a money section: a burst "limit" can be a spend limit by another name, so it does not. */
export const MONEY_SAFE_METRIC_KEYS = new Set([...METRIC_KEYS].filter((k) => !k.startsWith('burst')));
/** The exact keys under which a duration, uptime or notice may be written as text ("24 hours written notice", "72 hours per GDPR Art. 33"). */
export const METRIC_TEXT_KEYS = new Set([
  ...METRIC_KEYS,
  'notice', 'notice_period', 'revocation_notice', 'cancellation_notice', 'termination_notice', 'early_termination_notice', 'retention_notice', 'renewal_notice',
  'breach_notification', 'breach_notice', 'breach_notification_period', 'data_breach_notification', 'claim_response', 'claim_response_timeline', 'claim_deadline',
  'response_timeline', 'response_time', 'uptime', 'uptime_commitment', 'uptime_guarantee', 'sla_uptime', 'sla_response', 'availability', 'latency', 'retention',
  'retention_period', 'data_retention', 'data_retention_period', 'data_export_window', 'cooling_off', 'cooling_off_period', 'grace_period', 'cure_period',
  'surviving_obligations',
]);
/** The exact keys a rate may be written under ("60 requests per minute"). */
export const RATE_KEYS = new Set(['rate_limit', 'rate_limits', 'rate_limit_rpm', 'rate_limit_per_minute', 'requests_per_minute', 'rpm', 'rate']);
/** Keys that carry a digit by name and are not figures (the x402 payment protocol flag). */
const KEY_DIGIT_OK = new Set(['x402', 'x402_enabled']);

/** "72 hours per GDPR Art. 33": the generator's notice wording, a duration with a citation after it. */
const NOTICE_TAIL = /\s+(?:per|under|pursuant to|in accordance with)\s+(?:[A-Za-z][A-Za-z .&-]{0,40}?\s+)?(?:art(?:icle)?\.?|section|sec\.?|§|clause)\s*\d{1,3}(?:\(\d{1,2}[a-z]?\))*\s*$/i;
/** A duration, uptime or response time, with an optional citation tail that holds no money. */
export function isNoticeValue(s: string): boolean {
  // "5 business days", "10 calendar days": the qualifier says which days, not how many.
  const t = s.replace(/(\d)\s+(?:business|calendar|working)\s+(?=(?:days?|hours?)\b)/gi, '$1 ');
  const tail = NOTICE_TAIL.exec(t);
  if (tail && !hasMoneySignal(tail[0])) return isMetricValue(t.slice(0, tail.index));
  return isMetricValue(t);
}

export interface FigureContext {
  /** The normalised key the value sits under. */
  key?: string;
  /** The key above it, for the few identifiers named by a pair ("dispute_resolution.primary"). */
  parent?: string;
  /** The key is a limit's own name or a money-like name: no shape except a date, a wallet or a digest is exempt. */
  limitKey?: boolean;
  /** The key names a payment rule (a cap, a budget, an approval or escalation threshold, a fee): same. */
  ruleKey?: boolean;
  /**
   * Money context: a limit or money key, an amount wrapper, or a currency beside the value or beside any
   * ancestor, at any depth. It is inherited down the whole tree. Nothing but a date, a wallet or a digest
   * is exempt under it: no year, rate, identifier, recital or metric shape.
   */
  money?: boolean;
  /** Inside a known recital key: legal citations are not figures. */
  recital?: boolean;
  /** The key above this one is a limit's own name: nothing in a limit object is a metric. */
  inLimit?: boolean;
  /** The value is the `value` or `amount` entry of an object: a currency beside it says it is money. */
  wrapped?: boolean;
  /** The key is a version key. */
  versionKey?: boolean;
}

const YEAR_MONTH = /^\d{4}-\d{2}$/;

/**
 * True when the text holds a digit that no whole-value exemption explains, or money written in number
 * words. A shape exempts a value only under the keys that name that kind of value (a year under a year
 * key, an identifier under an id key, a notice under a notice key) and never under a money context.
 */
export function textFigure(text: string, ctx: FigureContext = {}): boolean {
  if (!hasDigit(text)) return moneyInWords(text);
  if (text.length > MAX_ANALYSED) return true;
  const s = fold(text).trim();
  const key = ctx.key;
  const money = !!(ctx.money || ctx.ruleKey || ctx.limitKey);
  // "Net 30 days": the one payment-terms shape that is a due date, not an amount, under its own two keys.
  if (key && PAYMENT_TERM_KEYS.has(key) && NET_TERMS.test(s)) return false;
  if (key && PAYMENT_TERM_KEYS.has(key) && DUE_DATE.test(s)) return false;
  // "x402" and "HTTP 402" are names: with them taken out, no digit and no money is left, and none was beside them.
  const rest = s.replace(PROTOCOL_NAME, ' ');
  // Under a limit or rule key, or inside a limit's object, only the payment timing and protocol keys (a mapped role key such as per_order is not one), and only when what is left is connective wording: a number word or a limit word falls through.
  if (rest !== s && !(ctx.limitKey || ctx.ruleKey || ctx.inLimit ? !key || !(PAYMENT_TERM_KEYS.has(key) || PROTOCOL_KEYS.has(key)) : false) && !hasMoneySignal(s) && !hasDigit(rest) && PROTOCOL_CONNECTIVE.test(rest)) return false;
  // A date cannot be spelled as an amount. A wallet, a UUID or a digest cannot either, but a long token of letters and digits can hide
  // one ("aaaa1999USD"), so they are never exempt with a currency or a money word in them, and inside a money section only under a key that names one.
  if (isDateValue(s)) return false;
  if (isStrongId(s) && !hasCurrencyOrMoneyWord(s) && (!money || (!!key && (ID_WORD_KEY.test(key) || isIdKey(key, ctx.parent))))) return false;
  // An exact metric key (a notice, an uptime, a rate) holds a bare count or a duration even inside a money section, with no money in it.
  if (money && key && MONEY_SAFE_METRIC_KEYS.has(key) && !ctx.inLimit && !ctx.wrapped && !ctx.limitKey && !ctx.ruleKey && (BARE_COUNT.test(s) || isNoticeValue(s))) return false;
  // Under money nothing else is exempt: the amount's own form answer is the only thing that explains a number there.
  if (money) return true;
  if (ISO_VALUE.test(s) || CONTRACT_ID.test(s)) return false;
  if (ctx.recital) return !recitalOnlyCitations(s);
  if (ctx.versionKey && VERSION_VALUE.test(s)) return false;
  if (key) {
    if (DATE_KEYS.has(key) && (YEAR_VALUE.test(s) || YEAR_MONTH.test(s))) return false;
    if (YEAR_KEYS.has(key) && YEAR_VALUE.test(s)) return false;
    if (PHONE_KEYS.has(key) && PHONE_SHAPE.test(s)) return false;
    if (CONTACT_KEYS.has(key) && CONTACT_SHAPE.test(s) && !hasMoneySignal(s) && !LIMIT_WORDS.test(s) && !GROUPED_OR_DECIMAL.test(s)) return false;
    if (RATE_KEYS.has(key) && RATE_VALUE.test(s)) return false;
    if (METRIC_TEXT_KEYS.has(key) && isNoticeValue(s)) return false;
    if (isIdKey(key, ctx.parent) && isIdentifierToken(s)) return false;
  }
  if ((EMAIL_VALUE.test(s) || URL_VALUE.test(s)) && !hasMoneySignal(s) && !LIMITISH.test(s)) return false;
  return true;
}

/** A digit in an object key is a figure ("20" under a tier table, "over_20_usd"), unless the key is an identifier or a year. Under money any digit in a key is one, bar the few keys the templates name. */
export function keyFigure(k: string, money = false): boolean {
  const nk = normKey(k);
  if (!hasDigit(k)) return moneyInWords(nk.replace(/_/g, ' ')) || numberWordFigure(nk.replace(/_/g, ' '));
  if (KEY_DIGIT_OK.has(nk)) return false;
  if (money) return true;
  const s = fold(k).trim();
  return !(YEAR_VALUE.test(s) || isDateValue(s) || isStrongId(s) || isIdentifierToken(s) || isMetricValue(s));
}

const BOUND_WORDS = /\b(?:each|every|(?:a|an)\s+(?:day|week|month|year|hour|quarter|call|request|transaction|invoice|order|seat|unit|vendor))\b/i;

/** The words of a text, lower case: runs of letters (an apostrophe stays inside, a trailing "'s" or "'" goes) and the percent sign. */
const WORD_TOKEN = /[\p{L}][\p{L}'’]*|%/gu;
/** The words of a text as above, and what is written between each word and the next (`gaps[i]` stands between `tokens[i]` and `tokens[i + 1]`). */
function readWords(s: string): { tokens: string[]; gaps: string[] } {
  const lower = s.toLowerCase();
  const tokens: string[] = [];
  const gaps: string[] = [];
  let at = -1;
  for (const m of lower.matchAll(WORD_TOKEN)) {
    const start = m.index ?? 0;
    if (at >= 0) gaps.push(lower.slice(at, start));
    tokens.push(m[0].replace(/['’]s?$/, ''));
    at = start + m[0].length;
  }
  return { tokens, gaps };
}
const wordsOf = (s: string) => readWords(s).tokens;
/** Between two words that are written together: spaces, a hyphen or an apostrophe, and no other mark ("thirty days", "twenty-four hour", not "thirty; days"). */
const PLAIN_JOIN = /^[\s\-\u2010-\u2015'’]*$/;
/** A text that may hold a number word at all, spelled together with other letters or not: the cheap test before the words are read. */
const NUMBER_HINT = new RegExp(`${STRONG_WORDS}|one|zero|half|halves|quarter|thirds?`, 'i');
/** The same, as whole words only: all that is asked of a text too long to read. */
const NUMBER_WHOLE_WORD = new RegExp(`(?<![A-Za-z])(?:${STRONG_WORDS}|one|zero|half|halves|quarter|thirds|(?:a|one)\\s+third(?![A-Za-z])(?![\\s-]+part))(?![A-Za-z])`, 'i');
/** "One" and "zero" are number words too, but "One-stop shop" and "Vendor One" are names: they count only beside wording that reads as a limit. */
const SINGLE_NUMBER_TOKEN = /^(?:one|zero)$/;
/** What "quarter" must stand before to be a number ("a quarter of", "a quarter percent"); "per quarter" and "end of quarter" are a period. */
const PERCENT_NEIGHBOUR = new Set(['percent', 'cent', 'of', '%']);
const numberish = (t: string) => STRONG_WORD.test(t) || SINGLE_NUMBER_TOKEN.test(t) || (t.length <= 40 && COMPOUND_WORD.test(t));
/** Whether the word at `i` is a number whatever stands beside it: a strong number word, a compound of number words, "half" or "halves", "thirds", "a third" (not "a third party"), or "quarter" before "percent" or "of". */
function strongAt(tokens: string[], i: number): boolean {
  const t = tokens[i];
  if (t === 'half' || t === 'halves' || t === 'thirds') return true;
  if (t === 'quarter') return PERCENT_NEIGHBOUR.has(tokens[i + 1]);
  if (t === 'third') return (tokens[i - 1] === 'a' || tokens[i - 1] === 'one') && tokens[i + 1] !== 'party' && tokens[i + 1] !== 'parties';
  return numberish(t) && !SINGLE_NUMBER_TOKEN.test(t);
}

/**
 * Wording that makes an entry with a number in it a limit, a bound or a period, not a name, in either case:
 * a ceiling, cap, maximum or limit, "or less", "or lower", "tops", "total", "beyond", "past", "until", "within", "apiece",
 * "each", "per", "up to", "under", "sub", "short of", "stop at", "cheaper", a budget, a period or a rate ("weekly", "monthly", "a head").
 */
const NAME_BLOCK_WORDS = /(?<![A-Za-z])(?:ceilings?|caps?|capped|max(?:imum)?|min(?:imum)?|limit\w*|quotas?|allowances?|thresholds?|budgets?|spend\w*|pay\w*|price\w*|cost\w*|fees?|charge\w*|approv\w*|exceed\w*|beyond|past|until|till|through|thru|within|under|over|above|below|up\s+to|at\s+most|at\s+least|more\s+than|less\s+than|(?:or|and)\s+(?:less|fewer|more|under|over|above|below|up|down)|lower|lowest|higher|highest|smaller|smallest|greater|greatest|larger|largest|bigger|biggest|least|most|fewer|further|hard|down|tops|totals?|aggregate\w*|combined|overall|cumulative|apiece|each|every|per|a\s+(?:head|person|day|week|month|year|hour|quarter|call|request|transaction|invoice|order|seat|unit|vendor)|daily|weekly|monthly|quarterly|yearly|annual\w*|hourly|nightly|fortnightly|days?|weeks?|months?|years?|hours?|minutes?|seconds?|only|just|exactly|nothing|none|plus|minus|times|sub|beneath|underneath|(?:short|shy)\s+of|stop\w*\s+(?:at|short|before)|halt\w*|cheap\w*|dear\w*|less|fewer|more)(?![A-Za-z])/i;
/** Whether a text reads as a limit, a bound, a period or money: nothing with a number in it may be a name then. */
export const hasLimitWording = (s: string) => hasMoneySignal(s) || NAME_BLOCK_WORDS.test(s) || LIMIT_WORDS.test(s) || BOUND_WORDS.test(s);
/**
 * The only digits a name may hold, each anchored exactly: a standard (ISO 27001, RFC 9110, SOC 2), a level, tier
 * or class and its one or two digits, a ranking, a product or protocol with its number (Microsoft 365, Web3, EC2,
 * B2B, x402, HTTP 402), a quarter, "24/7". Anything else with a digit in it is a figure.
 */
const NAME_DIGIT_ANCHORS = new RegExp(
  [
    '(?:ISO(?:\\/IEC)?|IEC|RFC|SOC|NIST|EIP|ERC|BIP|PCI[\\s_-]?DSS)[\\s_-]?\\d{1,6}(?:-\\d{1,3})*(?::\\d{4})?',
    '(?:level|tier|class|grade|phase|stage|type|version|generation|gen|series|layer|zone|wave|category)\\s?\\d{1,2}',
    'top\\s\\d{1,3}',
    '(?:microsoft|office|dynamics)\\s365',
    'windows\\s(?:10|11)',
    'fortune\\s(?:100|500|1000)',
    'S&P\\s500',
    '24\\/7|24x7',
    'HTTP[\\s_-]?402|x402',
    '(?:B2B2C|B2B|B2C|B2G|C2C|D2C|P2P|G2G|Web[23]|EC2|S3|IPv[46]|HTTP[23]|OAuth2|3D|4G|5G|Q[1-4]|H[12])',
  ]
    .map((a) => `(?<![A-Za-z0-9])(?:${a})(?![A-Za-z0-9]|[.,]\\d)`)
    .join('|'),
  'gi',
);
/** The longest entry that is read as a name when it holds a number: a longer one is a sentence. */
const MAX_NAME_ENTRY = 100;
/** The company words a name that holds a number word may end in ("Three Rivers Ltd"). */
const COMPANY_END = /[\s,]+(?:ltd|limited|llc|inc|corp|gmbh|ag|sa|sia|as|oy|ab|bv|nv|plc|pty|co)\.?\s*$/i;
/** A party name as an entry is compared with it: one space between words, lower case. */
export const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const NO_NAMES: ReadonlySet<string> = new Set();

/**
 * Whether an entry that holds a number has the shape of a name. It does only when no limit, bound, period or money
 * wording is in it (a company word at the end, "Limited" included, is not read as one) and every digit is anchored
 * (see NAME_DIGIT_ANCHORS), and something other than the number is left. With a strong number word in it, it also
 * needs a positive shape: it ends in a company word ("Three Rivers Ltd") or is exactly a party name of the agreement.
 */
function nameWithNumber(entry: string, names: ReadonlySet<string>): boolean {
  if (entry.length > MAX_NAME_ENTRY || hasDigit(entry.replace(/[0-9]/g, ''))) return false;
  const n = fold(entry);
  const body = n.replace(COMPANY_END, '');
  // Anchored digits come out first: "B2B" would read as an amount style ("2B") if left in.
  const rest = body.replace(NAME_DIGIT_ANCHORS, ' ');
  if (/\d/.test(rest) || hasLimitWording(rest)) return false;
  const tokens = wordsOf(body);
  // A bare number or number words and nothing else is a figure.
  if (tokens.every(numberish)) return false;
  // Anchored digits and "One-stop shop": no strong number word is left to ask about.
  if (!tokens.some((_, i) => strongAt(tokens, i))) return true;
  return body !== n || names.has(nameKey(entry));
}

/**
 * Whether an entry of a list answer (categories, actions, counterparties, deliverables) or of a list of names
 * in the agreement text is a figure. Money written in words is one. Any other entry with a digit or a number
 * word in it is a figure unless it has the positive shape of a name (see nameWithNumber): "Three Rivers Ltd",
 * "Microsoft 365 licences", "B2B SaaS", "ISO 27001 certified vendors", "Tier 1 suppliers" are names;
 * "thirty or less", "Seven Eleven supplies", "cloud (ceiling of thirty)", "Five hundred per order", "30"
 * and "thirty" are not.
 */
export function listEntryFigure(entry: string, names: ReadonlySet<string> = NO_NAMES): boolean {
  if (moneyInWords(entry)) return true;
  if (!hasDigit(entry) && !NUMBER_HINT.test(fold(entry))) return false;
  return !nameWithNumber(entry, names);
}

/**
 * Wording that makes "one" or "zero" beside it a limit or a bound: a ceiling, cap, maximum or limit, "or less", "up to",
 * "no more than", "tops", a total, "under", a budget, a rate per order, transaction or the like.
 */
const NUMBER_LIMIT_WORDS = /(?<![A-Za-z])(?:ceilings?|caps?|capped|max(?:imum)?|limit\w*|(?:or|and)\s+(?:less|fewer)|(?:fewer|less|more)\s+than|no\s+(?:more|less)|up\s+to|at\s+(?:most|least)|tops|totals?|under|over|above|below|beyond|budget\w*|exceed\w*|apiece|(?:per|each|every)\s+(?:order|transaction|payment|purchase|invoice|request|call|item|unit|vendor|task|trade|head|person))(?![A-Za-z])/i;
/** What a number counts when it stands directly before it: a duration, whose figure is read as one. "Business", "calendar" and "working" may stand between. */
const DURATION_UNIT = /^(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)$/;
const DURATION_LEAD = new Set(['business', 'calendar', 'working']);
/** What "one" counts when it stands directly before it and is no figure ("one-time", "one of", "one-stop"). */
const ONE_IDIOM_WORDS = new Set(['time', 'off', 'way', 'of', 'another', 'party', 'stop']);
/** How many words either side of "one" or "zero" are read for limit wording. */
const LIMIT_WINDOW = 3;

/**
 * The duration unit that stands after the number word at `end` ("days" in "thirty business days", "hour" in "half an hour"), or -1.
 * Only plain spacing may join them: "thirty; business days" is a limit, then a period.
 */
function durationUnitAfter(tokens: string[], joined: (i: number) => boolean, end: number): number {
  if (!joined(end)) return -1;
  let at = end + 1;
  if (tokens[end] === 'half' && (tokens[at] === 'a' || tokens[at] === 'an')) {
    if (!joined(at)) return -1;
    at++;
  }
  if (DURATION_LEAD.has(tokens[at] ?? '')) {
    if (!joined(at)) return -1;
    at++;
  }
  return DURATION_UNIT.test(tokens[at] ?? '') ? at : -1;
}

/**
 * Whether a plain string spells a number out: any strong number word is a figure, exactly like a digit ("thirty-five",
 * "a hundred", "two dozen", "half", "a third of", "fifty percent"), though no money word is in it, unless a duration unit
 * follows the number directly, with spaces, a hyphen or an apostrophe between ("thirty days' notice", "twenty-four hours",
 * "sixty business days", "half an hour"). "One" and "zero" are a figure only with limit or bound wording within a few words
 * of them. A text too long to read that holds a number word is one.
 */
export function numberWordFigure(text: string): boolean {
  const n = fold(text);
  if (!NUMBER_HINT.test(n)) return false;
  if (n.length > MAX_ANALYSED) return NUMBER_WHOLE_WORD.test(n);
  const { tokens, gaps } = readWords(n);
  const joined = (i: number) => PLAIN_JOIN.test(gaps[i] ?? '');
  for (let i = 0; i < tokens.length; i++) {
    let strong = strongAt(tokens, i);
    if (!strong && !SINGLE_NUMBER_TOKEN.test(tokens[i])) continue;
    // The whole run of number words is one number ("a hundred and twenty", "thirty-five"), as long as plain spacing joins it.
    let end = i;
    for (;;) {
      const step = tokens[end + 1] === 'and' ? 2 : 1;
      if (!numberish(tokens[end + step] ?? '') || !joined(end) || (step === 2 && !joined(end + 1))) break;
      end += step;
      strong ||= strongAt(tokens, end);
    }
    const unit = durationUnitAfter(tokens, joined, end);
    if (unit >= 0) {
      i = unit;
      continue;
    }
    if (strong) return true;
    const next = tokens[end + 1] ?? '';
    if (!ONE_IDIOM_WORDS.has(next) && NUMBER_LIMIT_WORDS.test(tokens.slice(Math.max(0, i - LIMIT_WINDOW), end + 1 + LIMIT_WINDOW).join(' '))) return true;
    i = end;
  }
  return false;
}

/** "half" and "halves" as whole words. */
const HALF_WORD = /(?<![A-Za-z])(?:half|halves)(?![A-Za-z])/i;
/**
 * A number or a half written in words where the text is read as money (beside a currency, under a limit's key): any strong
 * number word, a compound, a fraction, or "half" is a figure there, a duration unit beside it or not.
 */
export const spellsAmount = (s: string) => hasNumberWord(s) || numberWordFigure(s) || HALF_WORD.test(fold(s));

const toNumber = (s: string) => Number(s.replace(/,/g, ''));

export interface ParsedFigure {
  amount: number;
  currency?: string;
  /** The period or basis written after the amount ("per month" gives "month"). */
  period?: string;
  /** The figure was written with a percent sign. */
  percent?: true;
}

const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';

/**
 * A figure written as a bare amount: a plain or two-decimal number, comma
 * thousands groups, a currency symbol, code or name before or after it, a
 * percent sign, and an optional "per <period>". Anything else is not read.
 */
export function parseFigure(text: string): ParsedFigure | undefined {
  let t = text.normalize('NFKC').trim();
  if (t === '' || t.length > 80) return undefined;
  let period: string | undefined;
  const pm = /^(.{1,60}?)\s*(?:\/|\bper\b|\ba\b|\ban\b|\beach\b)\s*([A-Za-z][A-Za-z -]{0,29})$/i.exec(t);
  if (pm) {
    t = pm[1].trim();
    period = pm[2].trim().toLowerCase().replace(/\s+/g, ' ');
  }
  const done = (f: ParsedFigure): ParsedFigure => (period !== undefined ? { ...f, period } : f);
  let m = new RegExp(`^${NUM}$`).exec(t);
  if (m) return done({ amount: toNumber(m[1]) });
  m = new RegExp(`^${NUM}\\s*(?:%|percent)$`, 'i').exec(t);
  if (m) return done({ amount: toNumber(m[1]), percent: true });
  m = new RegExp(`^([$€£])\\s*${NUM}$`).exec(t);
  if (m) return done({ amount: toNumber(m[2]), currency: SYMBOL_CURRENCY[m[1]] });
  m = new RegExp(`^${NUM}\\s*([A-Za-z][A-Za-z. ]{1,19})$`).exec(t);
  if (m) {
    const c = currencyOf(m[2]);
    if (c) return done({ amount: toNumber(m[1]), currency: c });
  }
  m = new RegExp(`^([A-Za-z][A-Za-z. ]{1,19}?)\\s*${NUM}$`).exec(t);
  if (m) {
    const c = currencyOf(m[1]);
    if (c) return done({ amount: toNumber(m[2]), currency: c });
  }
  return undefined;
}

/** USDC counts one to one with USD; every other code stands for itself. Names fold to codes ("US Dollars" is USD). */
export const sameCurrency = (a: string, b: string) => {
  const c = (x: string) => {
    const u = currencyOf(x) ?? x.trim().toUpperCase();
    return u === 'USDC' ? 'USD' : u;
  };
  return c(a) === c(b);
};
