import { CORPUS_TAXONOMY, type TacticDefinition } from './corpusTaxonomy.ts';
import type {
  AnalysisResult,
  FlagEntry,
  TacticAnalysisEntry,
  TacticCatalogEntry,
} from './types.ts';

const FUZZY_MATCH_THRESHOLD = 90;
const MIN_FUZZY_PHRASE_LEN = 12;

const CONTRACTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bwon't\b/g, 'will not'],
  [/\bcan't\b/g, 'cannot'],
  [/\bdidn't\b/g, 'did not'],
  [/\bdon't\b/g, 'do not'],
  [/\bdoesn't\b/g, 'does not'],
  [/\bisn't\b/g, 'is not'],
  [/\baren't\b/g, 'are not'],
  [/\bwasn't\b/g, 'was not'],
  [/\bweren't\b/g, 'were not'],
  [/\bhaven't\b/g, 'have not'],
  [/\bhasn't\b/g, 'has not'],
  [/\bhadn't\b/g, 'had not'],
  [/\bwouldn't\b/g, 'would not'],
  [/\bcouldn't\b/g, 'could not'],
  [/\bshouldn't\b/g, 'should not'],
  [/\byou're\b/g, 'you are'],
  [/\byou'll\b/g, 'you will'],
  [/\bi'm\b/g, 'i am'],
  [/\bi'll\b/g, 'i will'],
  [/\bit's\b/g, 'it is'],
  [/\bthat's\b/g, 'that is'],
  [/\bthere's\b/g, 'there is'],
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeVariants(text: string): { rawLower: string; expandedLower: string } {
  const unifiedQuotes = (text || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  let expanded = unifiedQuotes;
  for (const [pattern, replacement] of CONTRACTION_REPLACEMENTS) {
    expanded = expanded.replace(pattern, replacement);
  }

  return { rawLower: unifiedQuotes, expandedLower: expanded };
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[n];
}

function similarityRatio(a: string, b: string): number {
  const totalLen = a.length + b.length;
  if (totalLen === 0) return 100;
  const dist = levenshteinDistance(a, b);
  return Math.round(((totalLen - dist) / totalLen) * 100);
}

/**
 * Sliding-window Levenshtein similarity (port of partial_ratio).
 */
export function partialRatio(s1: string, s2: string): number {
  if (!s1 && !s2) return 100;
  if (!s1 || !s2) return 0;

  const shorter = s1.length <= s2.length ? s1 : s2;
  const longer = s1.length <= s2.length ? s2 : s1;

  if (longer.includes(shorter)) {
    return 100;
  }

  const winLen = shorter.length;
  let best = 0;

  for (let i = 0; i <= longer.length - winLen; i++) {
    const slice = longer.slice(i, i + winLen);
    const score = similarityRatio(shorter, slice);
    if (score > best) {
      best = score;
      if (best === 100) return 100;
    }
  }

  if (winLen > 3) {
    for (let i = 0; i <= longer.length - (winLen - 1); i++) {
      const slice = longer.slice(i, i + winLen - 1);
      const score = similarityRatio(shorter, slice);
      if (score > best) {
        best = score;
      }
    }
  }

  return best;
}

function matchTacticDefinition(
  def: TacticDefinition,
  rawLower: string,
  expandedLower: string
): string[] {
  const indicators = new Set<string>();

  // 1. Evaluate every keyword without early exit so all indicators are extracted
  for (const kw of def.keywords) {
    const kwNorm = kw.toLowerCase();
    const isShortSingleToken = !kwNorm.includes(' ') && kwNorm.length <= 6;

    if (isShortSingleToken) {
      const wordRegex = new RegExp(`\\b${escapeRegExp(kwNorm)}\\b`, 'i');
      if (wordRegex.test(rawLower) || wordRegex.test(expandedLower)) {
        indicators.add(kw);
      }
      continue;
    }

    if (rawLower.includes(kwNorm) || expandedLower.includes(kwNorm)) {
      indicators.add(kw);
      continue;
    }

    // Fuzzy partial-ratio check on longer multi-word/long phrases to catch typos/inflections
    if (kwNorm.length >= MIN_FUZZY_PHRASE_LEN && rawLower.length >= MIN_FUZZY_PHRASE_LEN) {
      if (
        partialRatio(kwNorm, rawLower) > FUZZY_MATCH_THRESHOLD ||
        (expandedLower !== rawLower && partialRatio(kwNorm, expandedLower) > FUZZY_MATCH_THRESHOLD)
      ) {
        indicators.add(kw);
      }
    }
  }

  // 2. Evaluate every broad regex pattern across both raw and contraction-expanded text
  for (const pattern of def.patterns) {
    const rawMatch = pattern.exec(rawLower);
    if (rawMatch && rawMatch[0]) {
      const cleaned = rawMatch[0].trim();
      if (cleaned) indicators.add(cleaned);
    } else if (expandedLower !== rawLower) {
      const expMatch = pattern.exec(expandedLower);
      if (expMatch && expMatch[0]) {
        const cleaned = expMatch[0].trim();
        if (cleaned) indicators.add(cleaned);
      }
    }
  }

  return Array.from(indicators);
}

export class CoerciveControlEngine {
  readonly taxonomy: TacticDefinition[] = CORPUS_TAXONOMY;

  getTacticsCatalog(): TacticCatalogEntry[] {
    return this.taxonomy.map((def) => ({
      wheel: def.wheel,
      category: def.category,
      citation: def.citation,
      severity_weight: def.severity_weight,
      keyword_count: def.keywords.length,
      pattern_count: def.patterns.length,
      description: def.description,
    }));
  }

  analyzeMessage(text: string): AnalysisResult {
    const { rawLower, expandedLower } = normalizeVariants(text);

    const allFlags: FlagEntry[] = [];
    const tacticsAnalyzed: TacticAnalysisEntry[] = [];
    const matchedIndicatorsSet = new Set<string>();
    const frameworksSet = new Set<string>();

    const categories: string[] = [];
    const economicAbuseFlags: string[] = [];
    const childAbuseFlags: string[] = [];
    const darvoFlags: string[] = [];
    const legalAbuseFlags: string[] = [];
    const techAbuseFlags: string[] = [];
    const mesosystemAbuseFlags: string[] = [];
    const institutionalBetrayalFlags: string[] = [];
    const proactiveAggressionFlags: string[] = [];
    const lethalityRiskFlags: string[] = [];

    let institutionalAbuse = false;
    let severity = 1;

    if (rawLower.length > 0) {
      for (const def of this.taxonomy) {
        const indicators = matchTacticDefinition(def, rawLower, expandedLower);
        if (indicators.length === 0) continue;

        severity = Math.max(severity, def.severity_weight);
        frameworksSet.add(def.wheel);
        for (const ind of indicators) {
          matchedIndicatorsSet.add(ind);
        }

        tacticsAnalyzed.push({
          wheel: def.wheel,
          category: def.category,
          citation: def.citation,
          severity_weight: def.severity_weight,
          matched_indicators: indicators,
        });

        allFlags.push({
          wheel: def.wheel,
          category: def.category,
          matched_indicators: indicators,
          citation: def.citation,
        });

        switch (def.wheel) {
          case 'Post-Separation Power & Control':
            categories.push(def.category);
            break;
          case 'Post-Separation Economic Abuse':
            economicAbuseFlags.push(def.category);
            break;
          case 'Child Abuse':
            childAbuseFlags.push(def.category);
            break;
          case 'Legal Abuse Scale (LAS)':
            legalAbuseFlags.push(def.category);
            break;
          case 'Technology-Facilitated Abuse':
            techAbuseFlags.push(def.category);
            break;
          case 'DARVO':
            darvoFlags.push(def.category);
            break;
          case 'Mesosystem Abuse':
            mesosystemAbuseFlags.push(def.category);
            break;
          case 'Systemic/Institutional Abuse':
            institutionalAbuse = true;
            institutionalBetrayalFlags.push(def.category);
            break;
          case 'Institutional Betrayal (IBQ)':
            institutionalAbuse = true;
            institutionalBetrayalFlags.push(def.category);
            break;
          case 'Proactive Aggression & Contempt':
            proactiveAggressionFlags.push(def.category);
            break;
          case 'Lethality & Fundamental Needs Risk':
            lethalityRiskFlags.push(def.category);
            break;
          default:
            break;
        }
      }
    }

    return {
      categories,
      economic_abuse_flags: economicAbuseFlags,
      child_abuse_flags: childAbuseFlags,
      darvo_flags: darvoFlags,
      legal_abuse_flags: legalAbuseFlags,
      tech_abuse_flags: techAbuseFlags,
      mesosystem_abuse_flags: mesosystemAbuseFlags,
      institutional_betrayal_flags: institutionalBetrayalFlags,
      proactive_aggression_flags: proactiveAggressionFlags,
      lethality_risk_flags: lethalityRiskFlags,
      institutional_abuse: institutionalAbuse,
      severity,
      all_flags: allFlags,
      tactics_analyzed: tacticsAnalyzed,
      matched_indicators: Array.from(matchedIndicatorsSet),
      frameworks_triggered: Array.from(frameworksSet),
      total_tactics_evaluated: this.taxonomy.length,
    };
  }
}
