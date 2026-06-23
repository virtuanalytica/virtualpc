import {
  Certificate,
  Question,
  TestResult,
  generateTest,
  gradeTest,
  mintCertificate,
} from './certification';
import { AgentRole, getRoleById } from './roles';
import { Relation } from '../ingest/relations';

export interface Agent {
  did: string;
  name: string;
  role: AgentRole;
  modelEndpoint?: string;
  certificates: Certificate[];
}

export interface AgentConfig {
  did: string;
  name: string;
  roleId: string;
  modelEndpoint?: string;
}

/**
 * Create an agent from a configuration object.
 *
 * Throws if the requested role id is unknown.
 */
export function createAgent(config: AgentConfig): Agent {
  const role = getRoleById(config.roleId);
  if (!role) {
    throw new Error(`unknown agent role: ${config.roleId}`);
  }
  return {
    did: config.did,
    name: config.name,
    role,
    modelEndpoint: config.modelEndpoint,
    certificates: [],
  };
}

/**
 * Deterministic mock answerer for certification tests.
 *
 * In a production deployment this would call the LLM endpoint configured on
 * the agent. The mock is useful for integration tests and demos without
 * requiring a live model.
 */
export function answerQuestions(questions: Question[], accuracy = 1.0): number[] {
  return questions.map((q) => {
    if (Math.random() < accuracy) {
      return q.correctIndex;
    }
    // Pick a random wrong option.
    const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correctIndex);
    return wrong[Math.floor(Math.random() * wrong.length)];
  });
}

/**
 * Run a certification test for an agent against a set of relations.
 *
 * Uses the agent's primary domain (first domain in the role) for the test.
 * Stores the certificate on the agent if passed.
 */
export function certifyAgent(
  agent: Agent,
  relations: Relation[],
  maxQuestions = 50,
): TestResult {
  const domain = agent.role.domains[0];
  const { questions } = generateTest(relations, agent.role.fiber, domain, {
    agentDid: agent.did,
    maxQuestions,
  });
  const answers = answerQuestions(questions, 1.0);
  const result = gradeTest(questions, answers, agent.did, agent.role.fiber, domain);
  if (result.passed) {
    agent.certificates.push(mintCertificate(result));
  }
  return result;
}
