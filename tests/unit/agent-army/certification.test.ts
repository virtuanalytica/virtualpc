import {
  generateTest,
  gradeTest,
  mintCertificate,
  makeQuestion,
} from '../../../src/agent-army/certification';
import { Relation } from '../../../src/ingest/relations';

function makeRelations(): Relation[] {
  return [
    { subject: 'dama-dmbok', predicate: 'is-a', object: 'guide', weight: 1 },
    { subject: 'data governance', predicate: 'is-a', object: 'discipline', weight: 1 },
    { subject: 'data quality', predicate: 'is-a', object: 'capability', weight: 1 },
    { subject: 'database', predicate: 'has', object: 'tables', weight: 1 },
  ];
}

describe('makeQuestion', () => {
  it('creates a multiple-choice question from a relation', () => {
    const relations = makeRelations();
    const q = makeQuestion(relations[0], relations, 'data', 'governance');
    expect(q).not.toBeNull();
    expect(q!.subject).toBe('dama-dmbok');
    expect(q!.correctIndex).toBeGreaterThanOrEqual(0);
    expect(q!.options[q!.correctIndex]).toBe('guide');
    expect(q!.options.length).toBe(4);
  });

  it('pads distractors when not enough alternatives exist', () => {
    const relations: Relation[] = [
      { subject: 'a', predicate: 'is-a', object: 'x', weight: 1 },
    ];
    const q = makeQuestion(relations[0], relations, 'data', 'governance');
    expect(q!.options.length).toBe(4);
  });
});

describe('generateTest', () => {
  it('generates questions capped by maxQuestions', () => {
    const { questions } = generateTest(makeRelations(), 'data', 'governance', {
      agentDid: 'did:agent:1',
      maxQuestions: 2,
    });
    expect(questions.length).toBe(2);
  });

  it('skips metadata relations', () => {
    const relations: Relation[] = [
      { subject: 'source:1', predicate: 'hasFiber', object: 'data', weight: 1 },
      { subject: 'source:1', predicate: 'hasDomain', object: 'governance', weight: 1 },
      { subject: 'dama-dmbok', predicate: 'is-a', object: 'guide', weight: 1 },
    ];
    const { questions } = generateTest(relations, 'data', 'governance', {
      agentDid: 'did:agent:1',
      maxQuestions: 10,
    });
    expect(questions.every((q) => q.predicate !== 'hasFiber')).toBe(true);
    expect(questions.every((q) => q.predicate !== 'hasDomain')).toBe(true);
  });
});

describe('gradeTest', () => {
  it('grades a perfect score as professional', () => {
    const { questions } = generateTest(makeRelations(), 'data', 'governance', {
      agentDid: 'did:agent:1',
      maxQuestions: 2,
    });
    const answers = questions.map((q) => q.correctIndex);
    const result = gradeTest(questions, answers, 'did:agent:1', 'data', 'governance');
    expect(result.scorePct).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.level).toBe('professional');
  });

  it('grades a failing score', () => {
    const { questions } = generateTest(makeRelations(), 'data', 'governance', {
      agentDid: 'did:agent:1',
      maxQuestions: 2,
    });
    const answers = questions.map(() => 0);
    const result = gradeTest(questions, answers, 'did:agent:1', 'data', 'governance');
    expect(result.scorePct).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe('mintCertificate', () => {
  it('mints a certificate from a passing result', () => {
    const { questions } = generateTest(makeRelations(), 'data', 'governance', {
      agentDid: 'did:agent:1',
      maxQuestions: 2,
    });
    const answers = questions.map((q) => q.correctIndex);
    const result = gradeTest(questions, answers, 'did:agent:1', 'data', 'governance');
    const cert = mintCertificate(result);
    expect(cert.agentDid).toBe('did:agent:1');
    expect(cert.fiber).toBe('data');
    expect(cert.passed).toBe(true);
    expect(cert.timestamp).toMatch(/^\d{4}-/);
  });
});
