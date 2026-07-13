# Scientific Textus: Launch Whitepaper for the VirtualPC P2P Knowledge Network

**Status:** central launch whitepaper  
**Reference implementation:** VirtualPC current build, 2026-06-16  
**Primary use case:** verifiable chemistry, spectroscopy, quantum chemistry, and quantum-computing data  
**Network model:** peer-to-peer Textus, not blockchain, not hashgraph, not a single global ledger  

## Abstract

**Scientific Textus** is the data fabric of the VirtualPC peer-to-peer knowledge
network. It treats scientific observations, materials, computations, spatial
contexts, laboratory conditions, provenance records, and agent decisions as
cryptographically committed **Fibers**. Local signed relations between Fibers are
**Knits**. Higher-order relations between Knits are **EntanglementFibers**. The
protocol rules that define valid Fibers, Knits, and EntanglementFibers are the
**Loom**. The resulting living knowledge graph is the **Textus**.

VirtualPC is the reference node for this network. It already provides the
operational substrate: a multi-agent orchestration backend, task engine, API
surface, LightRAG/Neo4j knowledge layer, Kafka event spine, spectroscopy ingest,
robust peak detection, ChemE time-series analysis, governance registry, and
model-routing layer. Scientific Textus gives that substrate a launch-level
scientific data protocol and makes VirtualPC usable as a peer in a wider network
of laboratories, agents, instruments, simulations, and knowledge stores.

The first rigorous use case is scientific evidence handling. A spectrum only has
meaning when it travels with its sample, calibration, instrument, temperature,
pressure, vacuum state, humidity, gravity, cleanroom air-change rate, geospatial
position, uncertainty model, and provenance. A quantum-computing result only has
meaning when it travels with its backend, qubit topology, calibration snapshot,
transpilation context, shots, noise model, and result counts. Scientific Textus
binds those contexts into the same P2P knowledge fabric.

## Keywords

VirtualPC; Scientific Textus; peer-to-peer network; Fiber; Knit; Loom; Textus;
EntanglementFiber; spectroscopy; XRF; chemistry; quantum chemistry; quantum
computing; FAIR data; provenance; SHA-256; geospatial hashing; knowledge graph.

## 1. Launch Position

Scientific Textus is the central paper for launching the VirtualPC P2P knowledge
network. The paper does not present a speculative database pattern. It defines the
network vocabulary, evidence model, scientific data contract, and reference use
case that VirtualPC operates through.

The network is intentionally not a blockchain:

- it has no mandatory global block order;
- it has no requirement that every node carries every history;
- it does not convert scientific evidence into a single linear ledger;
- it does not make global consensus the default mechanism for local truth.

The network is also not a hashgraph:

- it does not reduce all trust to a global gossip history;
- it treats scientific context as first-class data, not just event ordering;
- it allows local Knits to become valid inside a bounded evidence context;
- it lets Knits become semantically linked through EntanglementFibers.

The central metaphor is a **weefsel**. A laboratory, instrument, agent, sample,
simulation, QPU run, or governance decision contributes Fibers. Peers make Knits
when they create signed relations. The Loom validates structure. The Textus is
the shared, queryable fabric.

## 2. VirtualPC as the Reference Node

VirtualPC is the first concrete operating environment for Scientific Textus. In
the launch architecture, one VirtualPC instance is a Textus peer. Each peer can
host agents, APIs, local data stores, scientific ingest routes, knowledge graphs,
and event logs. Peers exchange signed Fibers, Knits, EntanglementFibers, and
witness records.

The current VirtualPC implementation supplies the reference node surface:

1. **Multi-agent orchestration:** the task engine, agent registry, dashboards,
   collaboration flows, and model router coordinate work by named agents.
2. **Knowledge graph:** LightRAG/Neo4j stores governance, wiki, asset, corpus,
   chemistry, family, and role graph data.
3. **Event spine:** Kafka topics carry model responses, agent tasks, task
   results, failure events, cost tracking, LightRAG updates, and commit audit
   events.
4. **Scientific ingest:** `/api/spectroscopy/analyze`,
   `/api/spectroscopy/ingest`, `/api/spectroscopy/runs`, and
   `/api/timeseries/analyze` expose scientific data entry and analysis paths.
5. **Governance and review:** docs, charters, audit logs, capability registers,
   and code snippets make the implementation inspectable.

In Scientific Textus terms, VirtualPC is not only an application server. It is a
node that holds local Fibers, creates Knits, emits witnessable events, and
participates in the larger Textus.

## 3. Terminology

| Term | Definition |
|---|---|
| `Fiber` | A cryptographically committed unit of value, data, material identity, measurement, condition, computation, or right. |
| `ScientificFiber` | Any Fiber whose payload is scientific: material, measurement, simulation, condition, spatial, or provenance data. |
| `MeasurementFiber` | A Fiber representing an experimental observation or instrument run. |
| `SpectralFiber` | A MeasurementFiber for XRF, Raman, FTIR, UV-Vis, NMR, MS, XRD, or related data. |
| `ConditionFiber` | A Fiber representing physical or laboratory context: temperature, pressure, vacuum, atmosphere, humidity, gravity, cleanroom class, air changes per hour, fields, etc. |
| `SpatialFiber` | A geospatial cell or spatial zone, for example H3, S2, geohash, lab zone, cleanroom sector, rack, instrument bay, or QPU cryostat region. |
| `SimulationFiber` | A Fiber representing a quantum-chemistry or numerical simulation. |
| `QuantumRunFiber` | A Fiber representing a quantum-computer execution, including circuit, backend, calibration, shots, noise, and result counts. |
| `Knit` | A local, signed relation or transition between Fibers. Examples: sample measured by instrument, spectrum interpreted as material, computation explains spectrum. |
| `EntanglementFiber` | A cryptographic and semantic bridge that binds two Knits so they can be validated, queried, or interpreted together. |
| `Loom` | The protocol rules that define valid Fibers, Knits, EntanglementFibers, witness records, and peer behavior. |
| `Textus` | The resulting living knowledge fabric: graph, provenance layer, data surface, event memory, and scientific record. |

The historical-language register for these terms is maintained in
[`TEXTUS-LEXICON.md`](./TEXTUS-LEXICON.md). That lexicon defines Old English,
Latin, Greek, and Indo-European layers for scholarly and machine-readable
vocabulary work.

## 4. Network Model

Scientific Textus uses local validity plus shared witnessability. Each peer can
create Fibers and Knits locally, but those objects become network-useful when
they are:

- canonically serialized;
- hashed;
- signed;
- linked to provenance;
- optionally witnessed by another peer;
- queryable through the Textus graph.

The protocol does not require one global ledger. Instead, it supports bounded
truth domains. A laboratory can validate an XRF measurement Knit against its
instrument, calibration, operator, and environmental conditions. Another peer can
replicate, challenge, or support that Knit by creating another Knit and binding
both through an EntanglementFiber.

The P2P network therefore has three layers:

| Layer | Function | VirtualPC reference surface |
|---|---|---|
| Local peer | Stores local Fibers, Knits, runs, tasks, and knowledge graph entries | Express API, JSON stores, LightRAG/Neo4j, task engine |
| Witness layer | Publishes and replays events, signatures, provenance, and graph updates | Kafka topics, audit logs, governance registry |
| Textus layer | Queries and interprets the woven graph across peers | LightRAG, corpus, codegraph, `/api/textus/*` protocol routes |

## 5. Cryptographic Commitments

Scientific Textus uses cryptographic hashes as commitments, not as containers. A
SHA-256 digest does not contain a spectrum, material composition, or quantum-run
result. It commits to a canonical serialization of that payload.

```ts
type FiberCommitment = {
  fiberType: string;
  schemaVersion: string;
  payloadHash: string;      // SHA-256 over canonical payload
  previousHash?: string;    // optional causal predecessor
  ownerPublicKey?: string;
  createdAt: string;
  signature?: string;
};
```

For scientific data, canonicalization is unit-aware. A temperature of `293.15 K`
and `20 C` can be physically equivalent, but they compare as equal only after the
Loom canonicalizes them into the same SI representation and tolerance policy.

## 6. Scientific Fiber Contract

A generalized ScientificFiber has this shape:

```ts
type ScientificFiber = {
  id: string;
  kind:
    | "MaterialFiber"
    | "SampleFiber"
    | "MeasurementFiber"
    | "SpectralFiber"
    | "ConditionFiber"
    | "SpatialFiber"
    | "SimulationFiber"
    | "QuantumRunFiber";
  payload: Record<string, unknown>;
  payloadHash: string;
  provenance: {
    agentId?: string;
    instrumentId?: string;
    calibrationId?: string;
    sourceSystem?: string;
  };
  createdAt: string;
  signatures: string[];
};
```

For XRF, the SpectralFiber binds sample, technique, instrument, calibration,
spectrum, acquisition parameters, raw-data hash, processed-data hash, and
uncertainty model:

```ts
type XRFSpectralFiber = {
  sampleId: string;
  technique: "ED-XRF" | "WD-XRF" | "TXRF" | "XRF";
  instrumentId: string;
  calibrationId: string;
  spectrum: {
    x: number[];
    y: number[];
    xUnit: "keV" | "channel" | "nm";
    yUnit: "counts" | "a.u.";
  };
  acquisition: {
    dwellTimeS?: number;
    tubeVoltageKV?: number;
    tubeCurrentUA?: number;
    detector?: string;
  };
  rawDataHash: string;
  processedDataHash?: string;
  uncertaintyModel?: string;
};
```

## 7. Condition Fibers

Experimental claims are linked to explicit ConditionFibers. A condition is not
merely metadata. It is a reusable scientific entity that can be shared across
measurements, simulations, cleanroom zones, and instrument runs.

```ts
type ConditionFiber = {
  temperatureK?: number;
  pressurePa?: number;
  vacuumPa?: number;
  humidityPct?: number;
  gravityMS2?: number;
  atmosphere?: {
    gases: Array<{ species: string; fraction: number }>;
  };
  cleanroom?: {
    isoClass?: string;
    airChangesPerHour?: number;
    particleCountPerM3?: Record<string, number>;
  };
  magneticFieldT?: number;
  electricFieldVm?: number;
};
```

This enables queries such as:

- Which XRF spectra for this alloy were recorded between 293 K and 298 K?
- Which spectroscopy runs were performed below `10^-3 Pa`?
- Which experiments were done in ISO 5 cleanroom conditions with at least 240
  air changes per hour?
- Which quantum-computing runs used a calibration snapshot newer than one hour?

## 8. Knits: Local Scientific Relations

A Knit is a signed scientific relation between Fibers. It is local, typed, and
inspectable.

```ts
type Knit = {
  id: string;
  type:
    | "MEASURED_UNDER"
    | "MEASURED_SAMPLE"
    | "CALIBRATED_BY"
    | "LOCATED_IN"
    | "EXPLAINS"
    | "REPLICATES"
    | "CONFLICTS_WITH"
    | "DERIVED_FROM";
  fromFiberHash: string;
  toFiberHash: string;
  contextHash?: string;
  evidenceHash?: string;
  createdAt: string;
  signatures: string[];
  knitHash: string;
};
```

Examples:

```text
SampleFiber
  --MEASURED_SAMPLE-->
XRFSpectralFiber

XRFSpectralFiber
  --MEASURED_UNDER-->
ConditionFiber

QuantumChemistrySimulationFiber
  --EXPLAINS-->
XRFSpectralFiber
```

## 9. Data Entanglement Between Two Knits

Scientific Textus supports **data-wise entanglement between two Knits**. This is
not physical quantum entanglement. It is a protocol mechanism that makes two
relations jointly meaningful, jointly constrained, or jointly validated.

```ts
type EntanglementFiber = {
  id: string;
  knitAHash: string;
  knitBHash: string;
  relation:
    | "CO_VALID"
    | "REPLICATION_PAIR"
    | "THEORY_EXPERIMENT_PAIR"
    | "SHARED_CONDITION"
    | "SHARED_SAMPLE"
    | "CONFLICT_PAIR"
    | "CALIBRATION_DEPENDENCY"
    | "SPATIOTEMPORAL_PAIR";
  constraint:
    | "both_valid_or_none"
    | "one_supports_other"
    | "one_refutes_other"
    | "compare_under_shared_context"
    | "query_join_only";
  contextFiberHashes: string[];
  entanglementHash: string;
  createdAt: string;
  signatures: string[];
};
```

| Mode | Meaning | Example |
|---|---|---|
| Referential entanglement | Two Knits are queried together, but neither determines validity of the other. | XRF run and lab notebook note share a sample. |
| Evidential entanglement | One Knit supports the interpretation of another. | DFT-computed spectrum explains observed Raman peaks. |
| Validity entanglement | Two Knits are jointly valid or jointly invalid. | A measurement Knit is valid only with a calibration Knit from the same instrument interval. |
| Conflict entanglement | Two Knits are explicitly contradictory under shared conditions. | Two XRF interpretations produce incompatible elemental composition for the same sample. |
| Replication entanglement | Two independent Knits are a reproducibility pair. | Same sample, comparable conditions, different instrument/operator. |

This gives the network a higher-order relation layer. The Textus does not only
say "A is connected to B"; it can say "the relation A-to-B is entangled with the
relation C-to-D under condition E."

## 10. Geospatial Fibers

Scientific Textus treats location as a spatial fabric, not merely as floating
point coordinates on a flat map. A measurement occurs inside a hierarchy: earth,
site, building, lab, room, cleanroom zone, instrument position, sample holder,
cryostat, rack, or local coordinate frame.

H3, S2, geohash, and lab-local coordinate systems can all become SpatialFibers.

```ts
type SpatialFiber = {
  indexSystem: "H3" | "S2" | "Geohash" | "LabZone";
  index: string;
  resolution?: number;
  parentIndex?: string;
  neighbors?: string[];
  altitudeM?: number;
  localZone?: string;
};
```

Spatial Fibers answer:

- Which spectra were recorded in this lab zone?
- Which cleanroom sector produced anomalous measurements?
- Which environmental ConditionFibers changed across neighboring zones?
- Which peers are eligible witnesses for an event in the same physical or
  geospatial neighborhood?

## 11. Quantum Chemistry Fibers

Quantum-chemistry results are bound to method and computational context.

```ts
type QuantumChemistryFiber = {
  molecule: {
    formula?: string;
    charge: number;
    spinMultiplicity: number;
    geometryHash: string;
  };
  method: {
    family: "HF" | "DFT" | "MP2" | "CCSD" | "CCSD(T)" | "CASSCF";
    basisSet: string;
    functional?: string;
    solventModel?: string;
  };
  convergence: {
    energyThreshold?: number;
    gradientThreshold?: number;
    maxIterations?: number;
  };
  outputs: {
    energyHartree?: number;
    frequenciesHash?: string;
    predictedSpectrumHash?: string;
  };
  inputHash: string;
  outputHash: string;
};
```

The crucial Knit is:

```text
QuantumChemistryFiber --EXPLAINS--> SpectralFiber
```

An EntanglementFiber binds the simulation-explanation Knit to the
measurement-condition Knit, so that theoretical explanation is evaluated against
the actual physical measurement context.

## 12. Quantum Computing Fibers

A QPU run includes circuit identity, backend identity, calibration snapshot, shot
count, topology, noise model, error mitigation, and result counts.

```ts
type QuantumRunFiber = {
  provider: string;
  backendId: string;
  circuitHash: string;
  transpiledCircuitHash?: string;
  qubitTopologyHash?: string;
  gateSetHash?: string;
  shots: number;
  calibrationSnapshotHash: string;
  noiseModelHash?: string;
  errorMitigation?: string;
  resultCountsHash: string;
  temperatureMK?: number;
};
```

Scientific Textus links:

```text
QuantumRunFiber --DERIVED_FROM--> QuantumCircuitFiber
QuantumRunFiber --MEASURED_UNDER--> CalibrationFiber
QuantumRunFiber --REPLICATES--> QuantumRunFiber
```

## 13. VirtualPC Use Case: Scientific Evidence Through Agents

The launch use case is a VirtualPC peer that receives XRF or spectroscopy data,
binds it to conditions, lets agents analyze and review it, and publishes the
resulting scientific claims into the Textus.

The use-case flow is:

1. An operator or instrument sends spectral data to VirtualPC.
2. VirtualPC analyzes peaks and stores a run summary.
3. The run becomes a SpectralFiber.
4. Temperature, pressure, vacuum, cleanroom, humidity, gravity, and spatial
   context become ConditionFibers and SpatialFibers.
5. The measurement relation becomes a Knit.
6. A simulation, replicate run, or interpretation becomes another Knit.
7. An EntanglementFiber binds the two Knits as replication, support, conflict, or
   shared-context evidence.
8. The resulting graph is available to agents, humans, and peer nodes.

This is the concrete bridge from VirtualPC to Scientific Textus: the same
platform that already coordinates agents and knowledge graphs becomes a
scientific P2P evidence node.

## 14. Current VirtualPC Implementation Surface

The reference repository contains these launch-relevant components:

1. `src/spectroscopy/index.ts`: HTTP ingest/analyze/list endpoints for real
   spectra.
2. `src/spectroscopy/peak-detection.ts`: pure robust peak detection core using
   median/MAD thresholding, prominence, and minimum-distance merge.
3. `src/timeseries.ts`: ChemE-focused CSV analysis for temperature, pressure,
   NPK, yield, correlations, and anomalies.
4. `src/index.ts`: route registration for spectroscopy, time-series,
   LightRAG, Kafka status, knowledge, governance, and agent APIs.
5. `src/integrations/lightrag/`: graph-backed knowledge layer.
6. `src/integrations/kafka/`: event and audit spine.
7. `docs/CAPABILITY-CHARTER.md`: domain-science charter for quantum chemistry
   and spectroscopy.

Build status checked during this launch-paper revision:

```text
npm run build
> virtualpc@1.0.0 build
> tsc

Result: passed
```

Focused scientific tests:

```text
npx jest tests/unit/peakDetection.test.ts tests/unit/timeseries.test.ts --runInBand

Result: passed, 2 test suites, 17 tests
```

## 15. Code Snippets for Academic and Network Review

The following snippets anchor the launch paper in the current VirtualPC build.

### 15.1 Spectroscopy Run Model

Source: `src/spectroscopy/index.ts`

```ts
export interface SpectrumRun {
  id: string;
  technique?: string;   // 'IR' | 'UV-Vis' | 'NMR' | 'MS' | ...
  sample?: string;
  units?: string;       // axis units, e.g. 'cm^-1', 'nm', 'ppm', 'm/z'
  createdAt: string;
  summary: SpectrumSummary;
}
```

Textus role: this is the live run model that becomes a `SpectralFiber` once
canonical hashing, signatures, calibration binding, and ConditionFiber binding
are applied.

### 15.2 Spectroscopy Ingest Endpoint

Source: `src/spectroscopy/index.ts`

```ts
app.post('/api/spectroscopy/ingest', (req, res) => {
  const b = req.body || {};
  const p = parseBody(b);
  if (!p) {
    res.status(400).json({ success: false, error: 'y[] with >=3 numeric points required' });
    return;
  }
  const run: SpectrumRun = {
    id: uid(),
    technique: b.technique,
    sample: b.sample,
    units: b.units,
    createdAt: new Date().toISOString(),
    summary: summarizeSpectrum(p.y, p.opts, p.x),
  };
  runs.unshift(run);
  save();
  res.json({ success: true, run });
});
```

Textus role: this endpoint is the current ingress point for a MeasurementFiber
or SpectralFiber. The Textus extension wraps the persisted run with canonical
payload hashes, condition links, signatures, and witness metadata.

### 15.3 Robust Peak Detection Core

Source: `src/spectroscopy/peak-detection.ts`

```ts
export function noiseThreshold(y: number[], k = 3): number {
  return median(y) + k * 1.4826 * mad(y);
}

export function detectPeaks(y: number[], opts: PeakOptions = {}, x?: number[]): Peak[] {
  const { k = 3, minProminence = 0, minDistance = 1 } = opts;
  if (!Array.isArray(y) || y.length < 3) return [];
  const thr = Math.max(opts.threshold ?? -Infinity, noiseThreshold(y, k));
  // local maxima -> prominence filter -> minimum-distance merge
}
```

Textus role: this deterministic analysis step can be represented as a
DerivedFrom Knit between raw spectral data and processed spectral summary.

### 15.4 ChemE Time-Series Analysis

Source: `src/timeseries.ts`

```ts
export interface AnalysisResult {
  rowCount: number;
  columnCount: number;
  timestampColumn: string | null;
  columns: ColumnStats[];
  correlations: PairCorrelation[];
  topAnomalies: Array<{ column: string; index: number; value: number; z: number; timestamp?: string }>;
  processingMs: number;
}
```

Textus role: this is the basis for environmental and process ConditionFibers.
Columns such as temperature, pressure, vacuum, humidity, or cleanroom readings
become typed condition streams.

### 15.5 Domain Charter

Source: `docs/CAPABILITY-CHARTER.md`

```text
Domain science - Quantum Chemistry & spectroscopy

Need:
- Spectra ingestion (IR/UV-Vis/NMR/MS) with units
- Peak detection / baseline / denoise
- Reproducible analysis + provenance
- QChem glossary
```

Textus role: the charter identifies the scientific payload. Scientific Textus is
the protocol that turns that payload into a network-verifiable knowledge fabric.

## 16. Launch API Contract

The VirtualPC Textus surface extends the current API with these protocol routes:

```text
POST /api/textus/fibers
POST /api/textus/knits
POST /api/textus/entangle
GET  /api/textus/fibers/:hash
GET  /api/textus/knits/:hash
GET  /api/textus/query
GET  /api/textus/witness/:hash
```

The existing spectroscopy ingest payload:

```json
{
  "y": [ ... ],
  "x": [ ... ],
  "technique": "XRF",
  "sample": "sample-123",
  "units": "keV"
}
```

is lifted into the Textus payload:

```json
{
  "technique": "XRF",
  "sample": { "id": "sample-123", "batch": "B-2026-06" },
  "instrument": { "id": "xrf-01", "calibrationId": "cal-778" },
  "spectrum": { "x": [ ... ], "y": [ ... ], "xUnit": "keV", "yUnit": "counts" },
  "conditions": {
    "temperatureK": 293.15,
    "pressurePa": 101325,
    "vacuumPa": null,
    "humidityPct": 45,
    "gravityMS2": 9.80665,
    "cleanroom": { "isoClass": "ISO 7", "airChangesPerHour": 60 }
  }
}
```

Entanglement is created through:

```http
POST /api/textus/entangle
```

```json
{
  "knitAHash": "sha256:...",
  "knitBHash": "sha256:...",
  "relation": "THEORY_EXPERIMENT_PAIR",
  "constraint": "one_supports_other",
  "contextFiberHashes": ["sha256:condition...", "sha256:sample..."]
}
```

## 17. Witness and Trust Model

Scientific Textus uses witness records rather than universal consensus. A peer
can witness that it observed a Fiber, Knit, EntanglementFiber, or conflict claim.
Witnessing does not mean the witness agrees with the claim. It means the witness
can attest that the object existed in a given form at a given time and under a
given protocol version.

```ts
type WitnessRecord = {
  witnessedHash: string;
  witnessedKind: "Fiber" | "Knit" | "EntanglementFiber";
  peerId: string;
  protocolVersion: string;
  observedAt: string;
  signature: string;
};
```

This model is strong enough for scientific reproducibility because it separates:

- existence of a claim;
- validity of a claim;
- interpretation of a claim;
- replication of a claim;
- conflict with a claim.

## 18. Review Questions for Launch

1. Which canonical serialization format should be fixed for cross-language
   hashing?
2. Which unit-tolerance policy should the Loom apply to scientific equivalence?
3. Which minimum metadata set is required for XRF reproducibility?
4. How should calibration expiry weaken or invalidate dependent Knits?
5. Which witness policy is sufficient for local double-spend resistance without
   global consensus?
6. How should quantum-run Fibers express backend drift and calibration staleness?
7. Which P2P transport profile should be promoted as the default external
   federation mechanism for VirtualPC peers?

## 19. Conclusion

Scientific Textus is the launch specification for the VirtualPC P2P knowledge
network. It turns VirtualPC from a single multi-agent orchestration backend into
a reference peer for a broader scientific knowledge fabric. The network does not
need a chain, a global ledger, or a single canonical timeline. It needs Fibers
for committed objects, Knits for local claims, EntanglementFibers for relations
between claims, a Loom for protocol validity, and a Textus for shared knowledge.

The first launch use case is scientific evidence: chemistry, spectroscopy,
quantum chemistry, and quantum computing. These domains force the architecture
to handle physical conditions, instruments, calibration, uncertainty, provenance,
replication, conflict, and interpretation. That makes them the correct testbed
for a P2P network that claims to carry knowledge rather than only messages.

VirtualPC already contains the reference substrate: agents, APIs, knowledge
graphs, event logs, scientific ingest, peak detection, time-series analysis, and
governance documentation. Scientific Textus names the protocol that makes those
parts interoperable across peers.

## Appendix A. Historical Lexicon Layer

Scientific Textus deliberately uses textile language because several
Indo-European families preserve a deep connection between weaving, making,
binding, text, structure, and biological tissue. This does not mean every
architectural term is an etymological cognate. The project uses a stricter rule:

- **etymology** for historically supported word lineages;
- **analogy** for conceptual bridges such as brain tissue, skin tissue, and
  knowledge fabric;
- **technical coinage** for new names such as `EntanglementFiber`.

The working lexicon is in [`docs/TEXTUS-LEXICON.md`](./TEXTUS-LEXICON.md). Its
current preferred labels are:

| Architecture term | Old English layer | Latin layer | Greek layer |
|---|---|---|---|
| `Fiber` | `þræd` / `twín` | `fibra` / `filum` | `μίτος` (`mitos`) |
| `Knit` | `cnyttan` / `cnotta` | `nodus` / `plectere` | `πλέκω` (`pleko`) |
| `Loom` | `geloma` / `wefan` | `lex texendi` | `ἱστός` / `νόμος ὑφάνσεως` |
| `Textus` | `webb` / `wisdōmes-webb` | `textus scientiae` | `ὕφος γνώσεως` |
| `EntanglementFiber` | `sam-cnyttung-thraed` | `fibra symplectica` | `μίτος συμπλοκῆς` |

For academic review, the key claim is conservative: the lexicon supplies a
coherent semantic register for the architecture. It does not assert that Dutch
`brein` and `breien` share a direct etymological origin; it uses their closeness
as a conceptual bridge to brain tissue as woven biological structure.

## References

1. Wilkinson, M. D. et al. "The FAIR Guiding Principles for scientific data management and stewardship." *Scientific Data* 3, 160018 (2016). https://www.nature.com/articles/sdata201618
2. W3C. "PROV-O: The PROV Ontology." W3C Recommendation (2013). https://www.w3.org/TR/prov-o/
3. NIST. "FIPS PUB 180-4: Secure Hash Standard." https://csrc.nist.gov/pubs/fips/180-4/upd1/final
4. H3. "Introduction." https://h3geo.org/docs/
5. IUPAC Gold Book. "Energy dispersive X-ray fluorescence analysis." https://goldbook.iupac.org/terms/view/E02105
6. IUPAC Gold Book. "Wavelength-dispersive X-ray fluorescence analysis." https://goldbook.iupac.org/terms/view/W06662
7. NIST. "X-ray Methods for Chemical Imaging at Micro to Mesoscales." https://www.nist.gov/mml/mmsd/microscopy-and-microanalysis-research-group/x-ray-methods-chemical-imaging-micro-mesoscales
8. IBM Quantum Documentation. "View backend details." https://quantum.cloud.ibm.com/docs/guides/qpu-information
9. IBM Quantum Documentation. "Circuit." https://quantum.cloud.ibm.com/docs/api/qiskit/circuit
10. Bosworth-Toller Anglo-Saxon Dictionary Online. https://bosworthtoller.com/
11. Online Etymology Dictionary. "weave", "loom", "*teks-", "*plek-", "mesh", "histo-". https://www.etymonline.com/
12. Online Latin Dictionary. "texo", "textus". https://www.online-latin-dictionary.com/
13. LSJ Greek Lexicon. "ὑφαίνω." https://lsj.gr/wiki/%E1%BD%91%CF%86%CE%B1%CE%AF%CE%BD%CF%89
