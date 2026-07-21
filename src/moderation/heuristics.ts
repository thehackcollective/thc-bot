// Zero-cost pre-filter. Scores a message on scam/spam signals with regex + unicode
// analysis. Cheap enough to run on every message; decides which ones are worth an
// LLM call (borderline) and which are already obvious.

export interface HeuristicResult {
  score: number; // 0..1 rough spam likelihood
  signals: string[]; // human-readable hits, shown in the review card
}

// Phrase families common to resale / deal scams. Case-insensitive substrings.
const PHRASES: [RegExp, string][] = [
  [/serious buyers?\s+only/i, "‘serious buyers only’"],
  [/no time\s*pass/i, "‘no time pass’"],
  [/\bproof\s+(of\s+trust\s+)?available\b/i, "‘proof available’"],
  [/\btrusted\s+seller\b/i, "‘trusted seller’"],
  [/\bdeal\s+with\s+confidence\b/i, "‘deal with confidence’"],
  [/\bdm\s+(me\s+)?to\s+(buy|order|purchase)/i, "‘DM to buy’"],
  [/\b(ping|dm|contact|message)\s+me\b.*\b(buy|price|order|interested)/i, "solicit-DM"],
  [/\bwhy\s+choose\s+me\b/i, "‘why choose me’"],
  [/\bsafe\s+payment\s+methods?\b/i, "‘safe payment methods’"],
  [/\bplans?\s+available\b/i, "‘plans available’"],
  [/\bmethod\s+available\b/i, "‘method available’"],
  [/\bproof\s+available\b/i, "‘proof available’"],
];

// Products/services frequently trafficked in these groups. Presence alone is weak;
// combined with sell-language it's strong.
const RESALE_TERMS: [RegExp, string][] = [
  [/\blinkedin\s+(premium|account|sales\s+navigator)/i, "LinkedIn resale"],
  [/\bsales\s+navigator\b/i, "Sales Navigator"],
  [/\b(claude|chatgpt|gpt|openai|gemini|perplexity)\s+(max|plus|pro|premium|plan)/i, "AI-plan resale"],
  [/\b\d+\s*[x×]\s*(plan|plans)\b/i, "‘Nx plans’"],
  [/\b(career|business)\s+premium\b/i, "premium tiers"],
  [/\b(6|12|3|2)\s*months?\b.*\b(available|plan|premium)/i, "subscription-term list"],
];

const CONTACT = /(wa\.me\/|t\.me\/|\bwhatsapp\b.*\+?\d{6,}|\+\d{1,3}[\s-]?\d{6,})/i;

// Mathematical-alphanumeric "fancy" letters (𝗕𝗢𝗟𝗗 etc.) + fullwidth forms — a very
// strong spam tell in normal chat. Count them as a ratio of alphabetic runes.
function fancyRatio(text: string): number {
  let fancy = 0;
  let alpha = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const isMathAlnum = cp >= 0x1d400 && cp <= 0x1d7ff;
    const isFullwidth = cp >= 0xff01 && cp <= 0xff5e;
    const isEnclosed = cp >= 0x1f130 && cp <= 0x1f1ff; // enclosed alphanumerics supplement
    if (isMathAlnum || isFullwidth || isEnclosed) fancy++;
    if (isMathAlnum || isFullwidth || isEnclosed || /\p{L}/u.test(ch)) alpha++;
  }
  return alpha ? fancy / alpha : 0;
}

function emojiCount(text: string): number {
  const m = text.match(/\p{Extended_Pictographic}/gu);
  return m ? m.length : 0;
}

export function scoreMessage(text: string): HeuristicResult {
  const signals: string[] = [];
  let score = 0;

  for (const [re, label] of PHRASES) {
    if (re.test(text)) {
      signals.push(label);
      score += 0.25;
    }
  }
  let resaleHits = 0;
  for (const [re, label] of RESALE_TERMS) {
    if (re.test(text)) {
      signals.push(label);
      resaleHits++;
    }
  }
  // Resale terms are weak alone, strong in aggregate / with sell-language.
  if (resaleHits) score += Math.min(0.4, resaleHits * 0.15);

  const fancy = fancyRatio(text);
  if (fancy > 0.2) {
    signals.push(`stylized-unicode ${(fancy * 100).toFixed(0)}%`);
    score += 0.3;
  }

  const emojis = emojiCount(text);
  if (emojis >= 6) {
    signals.push(`${emojis} emoji`);
    score += 0.15;
  }

  if (CONTACT.test(text)) {
    signals.push("external contact/number");
    score += 0.15;
  }

  return { score: Math.min(1, score), signals };
}

// Thresholds that route a message: below LOW = skip entirely (clearly fine),
// at/above HIGH = obvious spam (flag without an LLM call), in between = ask the LLM.
export const HEURISTIC_LOW = 0.2;
export const HEURISTIC_HIGH = 0.75;
