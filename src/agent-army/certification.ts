/**
 * Certification test generator for the VirtualPC agent army.
 *
 * Turns ingested subject/predicate/object triples into multiple-choice
 * questions. Agents are tested per fibre/domain; passing agents receive a
 * certificate record.
 */

import { Relation } from '../ingest/relations';

export type CertificationLevel = 'trainee' | 'practitioner' | 'professional';

export interface Question {
  id: string;
  subject: string;
  predicate: string;
  question: string;
  options: string[];
  correctIndex: number;
  fiber: string;
  domain: string;
}

export interface Certificate {
  agentDid: string;
  fiber: string;
  domain: string;
  scorePct: number;
  level: CertificationLevel;
  passed: boolean;
  timestamp: string;
}

export interface TestResult {
  agentDid: string;
  fiber: string;
  domain: string;
  scorePct: number;
  level: CertificationLevel;
  passed: boolean;
  questions: Question[];
  answers: number[];
}

const LEVEL_THRESHOLDS: Record<CertificationLevel, number> = {
  trainee: 0.6,
  practitioner: 0.75,
  professional: 0.85,
};

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function shuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let s = seed;
  for (let i = result.length - 1; i > 0; i -= 1) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeQuestionId(subject: string, predicate: string, object: string): string {
  return `${subject}|${predicate}|${object}`;
}

/**
 * Build a multiple-choice question from a single relation.
 *
 * Distractors are picked from other relations that share the same predicate.
 * The correct answer is always present and options are shuffled deterministically.
 */
export function makeQuestion(
  relation: Relation,
  allRelations: Relation[],
  fiber: string,
  domain: string,
): Question | null {
  const correct = relation.object.trim();
  if (!correct) return null;

  const samePredicate = allRelations.filter(
    (r) => r.predicate === relation.predicate && r.object !== correct,
  );

  const distractors = shuffle(
    samePredicate.map((r) => r.object.trim()).filter(Boolean),
    stableHash(relation.subject + relation.predicate),
  ).slice(0, 3);

  // Ensure at least three options total; pad with generic distractors if needed.
  const optionPool = [...new Set([correct, ...distractors])];
  while (optionPool.length < 4) {
    optionPool.push(`option-${optionPool.length + 1}`);
  }

  const options = shuffle(
    optionPool.slice(0, 4),
    stableHash(relation.subject + relation.predicate + relation.object),
  );
  const correctIndex = options.indexOf(correct);

  return {
    id: makeQuestionId(relation.subject, relation.predicate, relation.object),
    subject: relation.subject,
    predicate: relation.predicate,
    question: `What is the ${relation.predicate} of "${relation.subject}"?`,
    options,
    correctIndex,
    fiber,
    domain,
  };
}

/**
 * Generate a certification test for a given fibre/domain from a bundle's
 * relations. Caps the number of questions to avoid excessive LLM calls.
 */
export function generateTest(
  relations: Relation[],
  fiber: string,
  domain: string,
  options: {
    agentDid: string;
    maxQuestions?: number;
  },
): { questions: Question[] } {
  const relevant = relations.filter(
    (r) => r.predicate !== 'hasFiber' && r.predicate !== 'hasDomain',
  );

  const seeded = shuffle(
    relevant,
    stableHash(`${fiber}|${domain}|${options.agentDid}`),
  );

  const questions: Question[] = [];
  for (const relation of seeded) {
    const q = makeQuestion(relation, relevant, fiber, domain);
    if (q) questions.push(q);
    if (questions.length >= (options.maxQuestions ?? 50)) break;
  }

  return { questions };
}

/**
 * Grade a completed test and return a certificate if the agent passed.
 */
export function gradeTest(
  questions: Question[],
  answers: number[],
  agentDid: string,
  fiber: string,
  domain: string,
): TestResult {
  if (answers.length !== questions.length) {
    throw new Error('answers length must match questions length');
  }

  const correct = questions.reduce(
    (acc, q, idx) => acc + (answers[idx] === q.correctIndex ? 1 : 0),
    0,
  );
  const scorePct = questions.length > 0 ? correct / questions.length : 0;

  let level: CertificationLevel = 'trainee';
  if (scorePct >= LEVEL_THRESHOLDS.professional) {
    level = 'professional';
  } else if (scorePct >= LEVEL_THRESHOLDS.practitioner) {
    level = 'practitioner';
  }

  const passed = scorePct >= LEVEL_THRESHOLDS.trainee;

  return {
    agentDid,
    fiber,
    domain,
    scorePct,
    level,
    passed,
    questions,
    answers,
  };
}

/**
 * Mint a certificate from a passing test result.
 */
export function mintCertificate(result: TestResult): Certificate {
  return {
    agentDid: result.agentDid,
    fiber: result.fiber,
    domain: result.domain,
    scorePct: result.scorePct,
    level: result.level,
    passed: result.passed,
    timestamp: new Date().toISOString(),
  };
}
