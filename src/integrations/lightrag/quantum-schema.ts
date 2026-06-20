/**
 * Quantum Information Schema Extension for the P2P Knowledge Graph
 *
 * Extends the core LightRAG schema with node types and relationship kinds
 * needed to represent quantum information concepts:
 *
 *   QuantumCircuit  — a named sequence of quantum gates acting on qubits
 *   Qubit           — a logical qubit register (named, dimensioned)
 *   QuantumGate     — a unitary operation (H, CNOT, T, Rx, …)
 *   EntanglementPair — a Bell-pair or multi-qubit entangled state
 *   QuantumAlgorithm — a named algorithm (Shor, Grover, VQE, QAOA…)
 *   QuantumResource  — a classical resource that depends on quantum output
 *
 * Relationships:
 *   OPERATES_ON      — gate / circuit → qubit
 *   ENTANGLED_WITH   — qubit ↔ qubit (undirected, stored as directed both ways)
 *   PART_OF          — qubit / gate → circuit
 *   IMPLEMENTS       — circuit → algorithm
 *   PRODUCES         — algorithm → resource
 *   SUPERSEDES       — algorithm → older algorithm (quantum advantage)
 *
 * The indexes below are appended to the INDEXES map in schema.ts and are
 * safe to run repeatedly (IF NOT EXISTS).
 *
 * Quantum-readiness for the knowledge graph means:
 *  1. The graph schema can represent quantum state descriptions.
 *  2. Decisions and risks can carry a `quantum_impact` metadata field.
 *  3. Agents can query entanglement chains and circuit dependencies.
 *  4. Post-quantum cryptography migration paths can be tracked as Risks.
 */

// ── Node interfaces ────────────────────────────────────────────────────────────

export interface QuantumCircuit {
  id?: string;
  name: string;
  qubit_count: number;
  depth?: number;
  fidelity_estimate?: number;   // 0–1
  algorithm?: string;           // link to QuantumAlgorithm by name
  description?: string;
  created_by: string;
  created_at?: Date;
}

export interface Qubit {
  id?: string;
  name: string;
  register: string;             // logical register label
  dimension: 2 | 4 | number;   // 2 for standard qubit, 4 for ququart
  coherence_time_us?: number;   // decoherence time in microseconds
  error_rate?: number;          // 0–1
  created_by: string;
  created_at?: Date;
}

export interface QuantumGate {
  id?: string;
  name: string;                 // H, CNOT, T, SWAP, Rx, Rz, CZ, Toffoli, …
  gate_type: 'single_qubit' | 'two_qubit' | 'multi_qubit' | 'measurement';
  unitary_matrix?: number[][];  // optional explicit matrix representation
  clifford: boolean;            // true if gate is in the Clifford group
  created_by: string;
  created_at?: Date;
}

export interface EntanglementPair {
  id?: string;
  state_label: string;          // e.g. 'Φ+', 'Ψ-', 'GHZ', 'W'
  qubit_ids: string[];          // IDs of the entangled qubits
  fidelity?: number;            // 0–1 Bell-state fidelity
  created_by: string;
  created_at?: Date;
}

export interface QuantumAlgorithm {
  id?: string;
  name: string;                 // e.g. 'Shor', 'Grover', 'VQE', 'QAOA'
  complexity_classical: string; // e.g. 'O(exp(n))'
  complexity_quantum: string;   // e.g. 'O(n^3 log n)'
  advantage: 'exponential' | 'polynomial' | 'quadratic' | 'none';
  domain: string;               // e.g. 'cryptography', 'optimization', 'chemistry'
  qubit_requirement: number;    // min logical qubits required
  nisq_compatible: boolean;     // works on near-term noisy hardware
  created_by: string;
  created_at?: Date;
}

export interface QuantumResource {
  id?: string;
  name: string;
  resource_type: 'key' | 'hash' | 'signature' | 'random' | 'simulation' | 'optimization';
  post_quantum_safe: boolean;
  migration_status: 'not_started' | 'in_progress' | 'migrated';
  depends_on_algorithm?: string;
  created_by: string;
  created_at?: Date;
}

// ── Relationship types ─────────────────────────────────────────────────────────

export const QUANTUM_RELATIONSHIPS = {
  OPERATES_ON: 'OPERATES_ON',       // gate / circuit → qubit
  ENTANGLED_WITH: 'ENTANGLED_WITH', // qubit ↔ qubit
  PART_OF: 'PART_OF',               // qubit / gate → circuit
  IMPLEMENTS: 'IMPLEMENTS',         // circuit → algorithm
  PRODUCES: 'PRODUCES',             // algorithm → resource
  SUPERSEDES: 'SUPERSEDES',         // algorithm → older algorithm
  REQUIRES_QUBIT: 'REQUIRES_QUBIT', // algorithm → qubit count constraint
  THREATENS: 'THREATENS',           // quantum algorithm → classical cryptographic resource
} as const;

// ── Neo4j indexes ──────────────────────────────────────────────────────────────

export const QUANTUM_INDEXES: Record<string, string> = {
  quantumCircuitById:
    `CREATE INDEX IF NOT EXISTS FOR (qc:QuantumCircuit) ON (qc.id)`,
  quantumCircuitByName:
    `CREATE INDEX IF NOT EXISTS FOR (qc:QuantumCircuit) ON (qc.name)`,
  qubitById:
    `CREATE INDEX IF NOT EXISTS FOR (q:Qubit) ON (q.id)`,
  qubitByRegister:
    `CREATE INDEX IF NOT EXISTS FOR (q:Qubit) ON (q.register)`,
  quantumGateByName:
    `CREATE INDEX IF NOT EXISTS FOR (g:QuantumGate) ON (g.name)`,
  quantumAlgorithmByName:
    `CREATE INDEX IF NOT EXISTS FOR (a:QuantumAlgorithm) ON (a.name)`,
  quantumAlgorithmByDomain:
    `CREATE INDEX IF NOT EXISTS FOR (a:QuantumAlgorithm) ON (a.domain)`,
  quantumResourceByType:
    `CREATE INDEX IF NOT EXISTS FOR (r:QuantumResource) ON (r.resource_type)`,
  quantumResourcePostQuantum:
    `CREATE INDEX IF NOT EXISTS FOR (r:QuantumResource) ON (r.post_quantum_safe)`,
  entanglementPairByState:
    `CREATE INDEX IF NOT EXISTS FOR (e:EntanglementPair) ON (e.state_label)`,
  fullTextQuantum:
    `CREATE FULLTEXT INDEX quantum_search IF NOT EXISTS FOR (n:QuantumCircuit|QuantumAlgorithm|QuantumGate) ON EACH [n.name, n.description]`,
};

// ── Cypher query helpers ───────────────────────────────────────────────────────

export const QUANTUM_QUERIES = {
  /** Find all circuits using a given gate */
  circuitsUsingGate: () => `
    MATCH (g:QuantumGate {name: $gateName})<-[:OPERATES_ON]-(c:QuantumCircuit)
    RETURN c ORDER BY c.depth ASC LIMIT 20
  `,

  /** Find post-quantum-unsafe resources */
  unsafeResources: () => `
    MATCH (r:QuantumResource {post_quantum_safe: false})
    RETURN r ORDER BY r.migration_status DESC LIMIT 50
  `,

  /** Find entanglement chains from a starting qubit */
  entanglementChain: () => `
    MATCH path = (q:Qubit {id: $qubitId})-[:ENTANGLED_WITH*1..5]->(other:Qubit)
    RETURN path LIMIT 20
  `,

  /** Find all algorithms with quantum advantage in a domain */
  algorithmsByDomain: () => `
    MATCH (a:QuantumAlgorithm {domain: $domain})
    WHERE a.advantage <> 'none'
    RETURN a ORDER BY a.qubit_requirement ASC LIMIT 20
  `,

  /** Which classical resources are threatened by a quantum algorithm */
  threatenedResources: () => `
    MATCH (a:QuantumAlgorithm {name: $algoName})-[:THREATENS]->(r:QuantumResource)
    RETURN r LIMIT 20
  `,

  /** Crypto migration status summary */
  migrationSummary: () => `
    MATCH (r:QuantumResource)
    RETURN r.migration_status AS status, count(r) AS count
    ORDER BY status
  `,
};

// ── Type guards ────────────────────────────────────────────────────────────────

export function isQuantumCircuit(o: any): o is QuantumCircuit {
  return o && typeof o.name === 'string' && typeof o.qubit_count === 'number';
}

export function isQuantumAlgorithm(o: any): o is QuantumAlgorithm {
  return o && typeof o.name === 'string' && typeof o.advantage === 'string';
}

export function isQubit(o: any): o is Qubit {
  return o && typeof o.name === 'string' && typeof o.register === 'string';
}

// ── Seed data — well-known algorithms to pre-populate the graph ─────────────

export const WELL_KNOWN_ALGORITHMS: QuantumAlgorithm[] = [
  {
    name: 'Shor',
    complexity_classical: 'O(exp(n^(1/3) log^(2/3) n))',
    complexity_quantum: 'O(n^3 log n)',
    advantage: 'exponential',
    domain: 'cryptography',
    qubit_requirement: 2048,
    nisq_compatible: false,
    created_by: 'system',
  },
  {
    name: 'Grover',
    complexity_classical: 'O(N)',
    complexity_quantum: 'O(sqrt(N))',
    advantage: 'quadratic',
    domain: 'search',
    qubit_requirement: 64,
    nisq_compatible: true,
    created_by: 'system',
  },
  {
    name: 'VQE',
    complexity_classical: 'O(exp(n))',
    complexity_quantum: 'O(poly(n))',
    advantage: 'exponential',
    domain: 'chemistry',
    qubit_requirement: 50,
    nisq_compatible: true,
    created_by: 'system',
  },
  {
    name: 'QAOA',
    complexity_classical: 'O(exp(n))',
    complexity_quantum: 'O(n^2)',
    advantage: 'polynomial',
    domain: 'optimization',
    qubit_requirement: 100,
    nisq_compatible: true,
    created_by: 'system',
  },
  {
    name: 'QFT',
    complexity_classical: 'O(n 2^n)',
    complexity_quantum: 'O(n^2)',
    advantage: 'exponential',
    domain: 'signal-processing',
    qubit_requirement: 20,
    nisq_compatible: false,
    created_by: 'system',
  },
];

/** Seed the well-known algorithms into the LightRAG graph. Idempotent. */
export async function seedQuantumAlgorithms(lightrag: {
  mergeTypedNode(id: string, label: string, props: Record<string, any>): Promise<void>;
}): Promise<number> {
  let seeded = 0;
  for (const algo of WELL_KNOWN_ALGORITHMS) {
    const id = `algo_${algo.name.toLowerCase()}`;
    await lightrag.mergeTypedNode(id, 'QuantumAlgorithm', {
      ...algo,
      content: `${algo.name}: ${algo.domain} — ${algo.advantage} quantum advantage`,
      created_by: 'system',
    });
    seeded++;
  }
  return seeded;
}
