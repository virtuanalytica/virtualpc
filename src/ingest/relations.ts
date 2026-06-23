/**
 * Rule-based relation extraction for the VirtualPC ingestion pipeline.
 *
 * Turns plain text into subject/predicate/object triples. This MVP uses
 * sentence splitting and a small set of lexical patterns; later stages can
 * delegate to an LLM for richer extraction.
 */

import { Source } from './types';

export interface Relation {
  subject: string;
  predicate: string;
  object: string;
  weight: number;
}

interface Pattern {
  predicate: string;
  regex: RegExp;
}

const PATTERNS: Pattern[] = [
  { predicate: 'is-a', regex: /\b(.+?)\s+is\s+(?:a|an)\s+(.+?)(?:[,.;:!?]|$)/i },
  { predicate: 'is-part-of', regex: /\b(.+?)\s+is\s+part\s+of\s+(.+?)(?:[,.;:!?]|$)/i },
  { predicate: 'has', regex: /\b(.+?)\s+has\s+(.+?)(?:[,.;:!?]|$)/i },
  { predicate: 'defines', regex: /\b(.+?)\s+defines\s+(.+?)(?:[,.;:!?]|$)/i },
  { predicate: 'uses', regex: /\b(.+?)\s+uses\s+(.+?)(?:[,.;:!?]|$)/i },
  { predicate: 'produces', regex: /\b(.+?)\s+produces\s+(.+?)(?:[,.;:!?]|$)/i },
];

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'it', 'they',
]);

/**
 * Split text into sentences using a simple heuristic.
 *
 * Handles common abbreviations (Mr., Mrs., Dr.) naively and collapses
 * whitespace.
 */
export function splitSentences(text: string): string[] {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|e\.g|i\.e)\./gi, '$1<DOT>');
  const withMarkers = cleaned.replace(/([.!?])(\s+|$)/g, '$1<SENT>$2');
  return withMarkers
    .split('<SENT>')
    .map((s) => s.replace(/<DOT>/g, '.').trim())
    .filter((s) => s.length > 0);
}

function normaliseTerm(term: string): string | null {
  const cleaned = term
    .replace(/[,.;:!?()\[\]{}"']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the)\s+/i, '')
    .toLowerCase();
  if (!cleaned || cleaned.length < 2) return null;
  if (STOP_WORDS.has(cleaned)) return null;
  return cleaned;
}

/**
 * Extract relations from plain text using rule-based patterns.
 *
 * The returned relations carry a weight of 1 by default. Domain-specific
 * heuristics (e.g. chemical formulas, mathematical notation) can be added
 * later without changing the public signature.
 */
export function extractRelations(text: string, _source?: Source): Relation[] {
  const relations: Relation[] = [];
  const seen = new Set<string>();

  for (const sentence of splitSentences(text)) {
    for (const { predicate, regex } of PATTERNS) {
      const match = regex.exec(sentence);
      if (!match) continue;
      const subject = normaliseTerm(match[1]);
      const object = normaliseTerm(match[2]);
      if (!subject || !object) continue;
      const key = `${subject}|${predicate}|${object}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relations.push({ subject, predicate, object, weight: 1 });
    }
  }

  return relations;
}
