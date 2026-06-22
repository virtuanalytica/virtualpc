#!/usr/bin/env python3
"""Generate a profession-by-profession business-case playbook.

Run from repo root:
    python3 scripts/generate-professions-playbook.py

Outputs:
    docs/PROFESSIONS-PLAYBOOK.md

The playbook is intentionally structured for later PDF conversion with pandoc:
    pandoc docs/PROFESSIONS-PLAYBOOK.md -o docs/PROFESSIONS-PLAYBOOK.pdf
"""

from pathlib import Path
from typing import List, Tuple

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "PROFESSIONS-PLAYBOOK.md"

Sector = Tuple[str, List[Tuple[str, str, List[str], str]]]

# Each entry: (profession, role_fragment, key_entities, headline_benefit)
SECTORS: List[Sector] = [
    (
        "Healthcare & life sciences",
        [
            ("General practitioner", "primary-care physician who triages, refers and coordinates longitudinal care", ["patient", "diagnosis", "referral", "consent"], "one shared, patient-controlled medical timeline across clinics"),
            ("Hospital specialist", "consultant managing complex cases across multi-disciplinary teams", ["case", "lab_result", "treatment_plan", "MDT_note"], "real-time, attribution-aware case notes that survive shift handovers"),
            ("Nurse", "frontline caregiver executing protocols and observing patient state", ["vital_sign", "medication_round", "wound_assessment", "handover"], "shift-to-shift continuity without duplicated data entry"),
            ("Pharmacist", "medication safety expert reconciling prescriptions and interactions", ["prescription", "dispensing_record", "drug_interaction", "batch_trace"], "instant, tamper-evident medication reconciliation"),
            ("Medical researcher", "scientist designing studies, sharing datasets and reproducing results", ["cohort", "protocol", "dataset", "retraction"], "reproducible, signed study provenance and retraction chains"),
            ("Clinical-trial coordinator", "operator tracking consent, randomisation and adverse events", ["consent_form", "randomisation", "adverse_event", "audit_trail"], "regulatory-ready audit trails without a central EDC vendor"),
            ("Biostatistician", "analyst deriving evidence from health data", ["statistical_model", "synthetic_data", "validation_run", "confidence_interval"], "transparent model lineage and re-runnable analyses"),
            ("Public-health officer", "official monitoring population health and outbreak signals", ["outbreak_signal", "vaccination_record", "policy", "syndrome"], "cross-jurisdiction signal sharing while preserving source attribution"),
            ("Epidemiologist", "scientist tracing disease spread and intervention effects", ["contact_trace", "intervention", "R_estimate", "variant"], "privacy-preserving, verifiable contact and lineage data"),
            ("Mental-health therapist", "clinician tracking client progress and interventions", ["session_note", "outcome_measure", "crisis_plan", "consent"], "client-owned therapy records that travel across providers"),
        ],
    ),
    (
        "Legal, compliance & risk",
        [
            ("Corporate lawyer", "advisor structuring contracts, M&A and disputes", ["contract_clause", "jurisdiction", "party", "amendment"], "contract amendment graphs with clause-level lineage"),
            ("Litigation lawyer", "advocate building evidence and case strategy", ["exhibit", "pleading", "deposition", "timeline"], "evidence chains that courts can verify independently"),
            ("Compliance officer", "guardian ensuring regulatory adherence", ["regulation", "control", "violation", "remediation"], "always-current control-to-regulation mapping"),
            ("Data-protection officer", "privacy officer managing consent and data-subject rights", ["consent_record", "DSAR", "retention_policy", "processor_agreement"], "portable, machine-readable consent ledgers"),
            ("Risk manager", "executive quantifying and mitating enterprise risk", ["risk_event", "control", "KRI", "scenario"], "federated risk registers with source attribution"),
            ("Auditor", "independent assurer verifying controls and statements", ["audit_evidence", "finding", "management_response", "recommendation"], "direct, signed evidence rather than screenshot attachments"),
            ("Contract manager", "operator owning the contract lifecycle", ["contract", "milestone", "obligation", "renewal"], "obligation graphs that surface renewal and SLA risks"),
            ("IP attorney", "counsel protecting patents, trademarks and copyrights", ["patent", "priority_date", "claim", "infringement"], "tamper-event priority-date and claim lineage"),
            ("Ethics officer", "officer overseeing AI and research ethics", ["ethics_approval", "consent", "algorithmic_impact", "stakeholder"], "traceable ethics approvals linked to deployed systems"),
            ("Forensic accountant", "investigator tracing financial anomalies", ["transaction", "entity", "anomaly", "source_document"], "immutable transaction provenance graphs"),
        ],
    ),
    (
        "Finance, insurance & real estate",
        [
            ("Retail banker", "relationship manager serving deposits, loans and payments", ["customer", "loan_application", "KYC_record", "transaction"], "portable KYC and credit reputation across banks"),
            ("Investment analyst", "researcher valuing securities and portfolios", ["security", "valuation_model", "forecast", "signal"], "transparent valuation-model lineage and confidence scoring"),
            ("Portfolio manager", "decision-maker allocating capital across assets", ["portfolio", "trade_order", "benchmark", "risk_budget"], "attributable, auditable trade rationale"),
            ("Insurance underwriter", "risk selector pricing policies", ["policy", "risk_factor", "claim_history", "premium"], "shared, consent-based claim histories that reduce fraud"),
            ("Claims adjuster", "investigator validating and settling claims", ["claim", "evidence", "settlement", "fraud_indicator"], "signed evidence packages that speed fair settlement"),
            ("Mortgage broker", "intermediary matching borrowers and lenders", ["mortgage_application", "income_verification", "property", "offer"], "reusable income and property verification yarns"),
            ("Real-estate agent", "broker matching buyers and sellers", ["listing", "viewing", "offer", "chain_status"], "tamper-resistant offer chains and disclosure histories"),
            ("Property manager", "operator maintaining leased assets", ["lease", "maintenance_ticket", "inspection", "tenant"], "maintenance lineage tied to lease obligations"),
            ("Fund administrator", "back-office operator processing NAV and distributions", ["NAV", "distribution", "cap_table", "valuation"], "shared cap-table and NAV calculation lineage"),
            ("Tax advisor", "professional minimising tax exposure within the law", ["tax_position", "ruling", "filing", "jurisdiction"], "ruling-to-filing provenance for audits"),
        ],
    ),
    (
        "Education & research",
        [
            ("University professor", "researcher and educator producing and curating knowledge", ["publication", "grant", "dataset", "peer_review"], "signed peer-review and reproducible research packages"),
            ("PhD candidate", "early-career researcher producing a dissertation", ["hypothesis", "experiment", "draft_chapter", "supervisor_note"], "verifiable experimental provenance and supervisor feedback"),
            ("Research librarian", "curator organising scholarly information", ["collection", "metadata", "license", "provenance"], "interoperable, attribution-rich catalogue records"),
            ("Instructional designer", "designer building courses and learning paths", ["learning_objective", "module", "assessment", "prerequisite"], "reusable learning-objective graphs across institutions"),
            ("School principal", "leader running a K-12 institution", ["student_record", "attendance", "safeguarding_note", "curriculum"], "longitudinal student records that follow the learner"),
            ("Classroom teacher", "educator delivering lessons and tracking progress", ["lesson_plan", "assessment", "attainment", "feedback"], "portable attainment records and lesson-sharing"),
            ("Ed-tech product manager", "builder of learning software", ["feature", "learning_outcome", "A_B_test", "standard"], "evidence-linked feature decisions mapped to standards"),
            ("Academic publisher", "publisher managing submissions and reviews", ["manuscript", "review", "revision", "DOI"], "open, signed peer-review histories"),
            ("Museum curator", "custodian interpreting and lending collections", ["artefact", "exhibition", "loan", "provenance"], "cross-institution provenance and loan histories"),
            ("Archivist", "professional preserving and describing records", ["record", "fonds", "retention_schedule", "accession"], "persistent, verifiable archival description graphs"),
        ],
    ),
    (
        "Engineering, construction & manufacturing",
        [
            ("Civil engineer", "designer of infrastructure and built assets", ["design_calculation", "drawing", "inspection", "as_built"], "signed design-to-as-built lineage for safety audits"),
            ("Structural engineer", "specialist ensuring load-bearing integrity", ["load_model", "calculation", "inspection", "repair"], "calculation provenance linked to inspection reports"),
            ("Construction project manager", "coordinator delivering projects on time and budget", ["work_package", "milestone", "RFI", "change_order"], "change-order graphs with cost and schedule impact"),
            ("Site supervisor", "field manager overseeing trades and safety", ["daily_log", "safety_observation", "defect", "trade_handover"], "real-time, signed site logs replacing paper diaries"),
            ("Quantity surveyor", "cost engineer measuring and valuing work", ["BOQ", "measurement", "valuation", "variation"], "measurement lineage that supports payment disputes"),
            ("Architect", "designer creating building and spatial concepts", ["concept", "drawing", "specification", "approval"], "design-decision provenance across project phases"),
            ("Mechanical engineer", "designer of machines and thermal systems", ["CAD_model", "simulation", "test_result", "ECN"], "ECN-to-test-result traceability"),
            ("Electrical engineer", "designer of power and control systems", ["schematic", "cable_schedule", "test_certificate", "commissioning"], "commissioning certificates linked to schematic revisions"),
            ("Quality engineer", "specialist preventing defects and variance", ["inspection_plan", "defect", "CAPA", "SPC"], "closed-loop CAPA traceability across suppliers"),
            ("Supply-chain planner", "scheduler balancing demand and inventory", ["forecast", "purchase_order", "inventory", "constraint"], "federated demand signals with source confidence"),
            ("Factory operator", "machine operator producing goods", ["batch", "parameter_set", "downtime_event", "quality_check"], "machine-parameter lineage tied to batch quality"),
            ("Maintenance technician", "technician keeping assets running", ["work_order", "spare_part", "failure_mode", "maintenance_history"], "predictive-maintenance knowledge across sites"),
        ],
    ),
    (
        "Logistics, transport & energy",
        [
            ("Fleet manager", "operator of vehicles and drivers", ["vehicle", "route", "driver_record", "maintenance"], "shared maintenance and compliance histories across operators"),
            ("Freight forwarder", "coordinator moving cargo across borders", ["shipment", "customs_declaration", "bill_of_lading", "tracking_event"], "cross-carrier shipment graphs with customs-ready evidence"),
            ("Warehouse manager", "operator storing and dispatching inventory", ["SKU", "location", "picking_batch", "cycle_count"], "real-time inventory truth across warehouses"),
            ("Last-mile courier", "driver delivering parcels to consumers", ["parcel", "delivery_attempt", "proof_of_delivery", "route"], "cryptographic proof-of-delivery without a platform"),
            ("Port operator", "manager of maritime cargo flows", ["container", "vessel", "berth_plan", "customs_hold"], "port-to-port container provenance"),
            ("Air-traffic controller", "controller ensuring safe aircraft separation", ["flight_plan", "clearance", "weather", "sector"], "trusted, timestamped clearance graphs"),
            ("Railway signaller", "operator controlling rail movements", ["train_path", "signal_aspect", "incident", "possession"], "signed movement authorities across operators"),
            ("Energy trader", "trader buying and selling electricity or gas", ["trade", "delivery_period", "meter_reading", "imbalance"], "meter-to-trade settlement lineage"),
            ("Grid operator", "manager balancing electricity supply and demand", ["meter", "forecast", "constraint", "dispatch"], "federated grid-state snapshots with provenance"),
            ("Renewable-asset manager", "operator of wind/solar assets", ["turbine", "production", "fault", "service_visit"], "asset-fault histories shared with OEMs and insurers"),
        ],
    ),
    (
        "Agriculture, food & environment",
        [
            ("Crop farmer", "grower producing grains, vegetables or fruit", ["field", "input", "yield", "weather"], "field-level input-to-yield provenance for buyers"),
            ("Livestock farmer", "producer raising animals", ["animal", "vaccination", "feed_batch", "welfare_audit"], "animal-welfare and veterinary records tied to product"),
            ("Agronomist", "advisor optimising crop production", ["recommendation", "soil_sample", "treatment", "outcome"], "recommendation-outcome feedback across farms"),
            ("Food-safety inspector", "auditor verifying safe food handling", ["inspection", "hazard", "corrective_action", "certificate"], "inspection-to-certificate graphs accessible to retailers"),
            ("Supply-chain sustainability manager", "officer tracing ESG claims", ["claim", "evidence", "scope_emission", "audit"], "verifiable scope-3 evidence from suppliers"),
            ("Fisheries scientist", "biologist managing fish stocks", ["catch_record", "stock_assessment", "quota", "observer_report"], "signed catch and observer data for quota compliance"),
            ("Forester", "manager of woodland and carbon stocks", ["stand", "inventory", "carbon_stock", "harvest_plan"], "carbon-credit lineage from forest inventory"),
            ("Environmental consultant", "advisor assessing impact and remediation", ["impact_assessment", "sample", "mitigation", "permit"], "sample-to-permit provenance for regulators"),
            ("Water-resource manager", "planner allocating water rights and quality", ["abstraction_right", "quality_sample", "allocation", "drought_plan"], "water-right and quality data shared across basins"),
            ("Waste-management operator", "operator tracking collection and disposal", ["collection", "waste_stream", "treatment", "certificate"], "waste-to-certificate traceability"),
        ],
    ),
    (
        "Government & public sector",
        [
            ("Policy advisor", "official drafting and evaluating policy", ["policy_option", "evidence", "consultation", "impact_assessment"], "evidence-to-policy lineage that survives elections"),
            ("Legislative drafter", "lawyer writing statutes and amendments", ["bill", "amendment", "jurisdiction", "commencement"], "amendment graphs showing how a statute evolved"),
            ("Case worker", "public servant processing citizen applications", ["application", "evidence", "decision", "appeal"], "citizen-owned application evidence packets"),
            ("Benefits administrator", "officer managing social-security payments", ["claim", "entitlement", "payment", "fraud_flag"], "privacy-preserving entitlement verification"),
            ("Procurement officer", "buyer acquiring public goods and services", ["tender", "bid", "award", "contract"], "transparent bid-evaluation provenance"),
            ("Tax collector", "official assessing and collecting tax", ["taxpayer", "assessment", "payment", "ruling"], "signed ruling-to-assessment trails"),
            ("Border officer", "official controlling cross-border movement", ["traveler", "visa", "risk_indicator", "inspection"], "privacy-preserving, source-attributed risk indicators"),
            ("Emergency coordinator", "manager responding to disasters", ["incident", "resource", "dispatch", "situation_report"], "cross-agency situation reports with source confidence"),
            ("Election official", "administrator running elections", ["voter", "ballot", "tally", "audit"], "verifiable, privacy-preserving tally evidence"),
            ("Diplomat", "negotiator representing state interests", ["agreement", "negotiation_round", "red_line", "communique"], "negotiation provenance for treaty ratification"),
        ],
    ),
    (
        "Media, creative & culture",
        [
            ("Journalist", "reporter investigating and publishing news", ["source", "claim", "article", "correction"], "signed source notebooks and transparent corrections"),
            ("Fact-checker", "verifier rating claims and media", ["claim", "rating", "evidence", "correction"], "interoperable fact-checking ratings with evidence"),
            ("Photojournalist", "visual journalist documenting events", ["image", "caption", "location", "consent"], "image provenance and consent records"),
            ("Documentary filmmaker", "producer constructing factual films", ["interview", "archive_clip", "release_form", "edit_decision"], "archive-rights and release-form graphs"),
            ("Music producer", "creator producing and licensing recordings", ["stem", "master", "license", "royalty_split"], "stem-to-royalty lineage for rights management"),
            ("Author", "writer creating books or long-form content", ["manuscript", "draft", "contract", "royalty"], "draft-to-publication provenance and royalty splits"),
            ("Game designer", "designer creating interactive experiences", ["mechanic", "narrative_branch", "asset", "playtest_result"], "playtest-evidence linked to design decisions"),
            ("UX researcher", "researcher understanding user behaviour", ["interview", "insight", "persona", "recommendation"], "insight-to-recommendation traceability"),
            ("Brand strategist", "planner defining market positioning", ["insight", "positioning", "asset", "campaign"], "positioning evidence linked to campaign assets"),
            ("Event manager", "organiser executing conferences and experiences", ["event", "vendor", "attendee", "feedback"], "vendor and attendee provenance for large events"),
        ],
    ),
    (
        "Sales, marketing & customer success",
        [
            ("B2B sales rep", "seller closing enterprise deals", ["opportunity", "contact", "proposal", "CRM_note"], "contact-consent and proposal lineage across handoffs"),
            ("Account executive", "owner of named accounts and renewals", ["account", "health_score", "renewal", "escalation"], "account-knowledge graph surviving rep turnover"),
            ("Sales engineer", "technical seller demonstrating solutions", ["demo", "requirement", "POC", "technical_blocker"], "requirement-to-POC evidence for deal reviews"),
            ("Marketing manager", "planner running campaigns and demand gen", ["campaign", "channel", "lead", "attribution"], "attribution graphs with source confidence"),
            ("Content marketer", "creator producing inbound content", ["content_piece", "keyword", "funnel_stage", "performance"], "content-performance lineage across channels"),
            ("Community manager", "facilitator nurturing user communities", ["member", "conversation", "insight", "moderation_action"], "community-insight graphs with consent"),
            ("Customer-success manager", "advocate driving adoption and retention", ["customer", "health_score", "playbook", "outcome"], "outcome evidence tied to playbook usage"),
            ("Product marketer", "launcher positioning products for market", ["launch", "messaging", "competitor", "win_loss"], "win/loss evidence linked to messaging"),
            ("Growth hacker", "experimenter optimising funnel metrics", ["experiment", "metric", "hypothesis", "result"], "experiment-registry with retraction support"),
            ("CRM administrator", "operator configuring sales systems", ["field", "workflow", "integration", "data_quality_rule"], "CRM metadata lineage and governance"),
        ],
    ),
    (
        "Human resources & operations",
        [
            ("Recruiter", "talent acquisition professional", ["candidate", "requisition", "interview", "offer"], "portable candidate-verification and interview notes"),
            ("HR business partner", "strategic HR advisor to managers", ["employee", "performance_review", "succession_plan", "case"], "employee-consented career-record graphs"),
            ("Payroll specialist", "operator processing compensation", ["employee", "pay_run", "deduction", "payslip"], "signed payslip and deduction evidence"),
            ("Learning & development manager", "builder of workforce skills", ["skill", "course", "completion", "competency"], "portable competency records across employers"),
            ("Diversity & inclusion officer", "leader advancing equity", ["initiative", "metric", "survey", "action"], "D&I metric provenance and progress tracking"),
            ("Workplace safety officer", "manager preventing accidents", ["hazard", "incident", "investigation", "control"], "incident-investigation graphs across contractors"),
            ("Operations manager", "generalist running internal processes", ["process", "KPI", "improvement", "SOP"], "SOP-to-KPI lineage with improvement evidence"),
            ("Facilities manager", "operator maintaining buildings", ["asset", "work_order", "inspection", "lease"], "asset-maintenance histories shared with landlords"),
            ("Procurement analyst", "analyst optimising supplier spend", ["supplier", "category", "contract", "savings"], "supplier-performance graphs with audit trail"),
            ("Executive assistant", "coordinator supporting leadership", ["meeting", "decision", "action_item", "delegate"], "decision and action-item provenance"),
        ],
    ),
    (
        "Technology, cybersecurity & data",
        [
            ("Software engineer", "builder writing and shipping code", ["commit", "issue", "design_doc", "test_result"], "design-doc-to-commit-to-test lineage"),
            ("DevOps engineer", "operator of CI/CD and infrastructure", ["pipeline", "deployment", "incident", "rollback"], "deployment and rollback provenance across environments"),
            ("Site-reliability engineer", "engineer balancing reliability and velocity", ["SLO", "alert", "postmortem", "runbook"], "postmortem-to-runbook knowledge retention"),
            ("Security analyst", "defender detecting and responding to threats", ["alert", "indicator", "incident", "mitigation"], "indicator-sharing with source confidence"),
            ("Threat-intelligence analyst", "researcher tracking adversaries", ["IOC", "campaign", "TTP", "source"], "federated, attributed threat-intelligence feeds"),
            ("Penetration tester", "ethical hacker finding vulnerabilities", ["finding", "exploit", "remediation", "retest"], "signed penetration-test evidence for clients"),
            ("Data engineer", "builder of data pipelines", ["pipeline", "dataset", "schema", "quality_check"], "pipeline-to-dataset lineage with quality rules"),
            ("Data scientist", "analyst building models from data", ["experiment", "model", "feature", "evaluation"], "experiment-to-model lineage and retraction"),
            ("Machine-learning engineer", "engineer deploying ML systems", ["model", "serving_endpoint", "drift_metric", "rollback"], "model-card and drift provenance"),
            ("Prompt engineer", "designer of LLM prompts", ["prompt", "model", "test_case", "rating"], "prompt-versioning with human rating lineage"),
            ("Database administrator", "custodian of database systems", ["schema", "migration", "backup", "privilege"], "schema-migration provenance and access audits"),
            ("Identity architect", "designer of authentication and authorisation", ["DID", "credential", "role", "revocation"], "credential lifecycle and revocation graphs"),
            ("Cloud architect", "designer of cloud infrastructure", ["resource", "policy", "cost_center", "tag"], "resource-to-policy-to-cost lineage"),
            ("Technical writer", "author of product documentation", ["topic", "article", "review", "translation"], "documentation provenance and review state"),
        ],
    ),
]


def use_cases(entities: List[str]) -> List[str]:
    a, b, c, d = entities[0], entities[1], entities[2], entities[3]
    return [
        f"Publish signed {a} and {b} updates from their own yarn so downstream peers can verify origin and sequence.",
        f"Subscribe to trusted {c} and {d} yarns and merge them into a local patch for querying and reporting.",
        f"Retract or correct outdated statements as new {b} arrive, preserving a complete audit trail.",
    ]


def sample_stitches(profession: str, entities: List[str]) -> str:
    subj = entities[0].replace(" ", "_")
    pred_a = f"has_{entities[1]}"
    pred_b = "verified_by"
    pred_c = "links_to"
    return f"""```json
{{
  "triple": {{"subject": "did:knit:{subj}/sample", "predicate": "{pred_a}", "object": "did:knit:{entities[2]}/sample"}},
  "source_yarn": "did:knit:{profession.lower().replace(' ', '-')}",
  "confidence": 0.92
}}
{{
  "triple": {{"subject": "did:knit:{entities[3]}/sample", "predicate": "{pred_b}", "object": "did:knit:notary-loom"}},
  "source_yarn": "did:knit:notary",
  "confidence": 0.98
}}
```"""


def profession_entry(profession: str, role: str, entities: List[str], benefit: str) -> str:
    cases = use_cases(entities)
    stitches = sample_stitches(profession, entities)
    return f"""### {profession}

**Role in one sentence:** A {role}.

**Why the fabric matters:** {profession}s need {benefit}. A central database forces every party into the same schema and access rules; the fabric lets each professional own a yarn while still weaving a shared graph.

**Top 3 use cases:**
1. {cases[0]}
2. {cases[1]}
3. {cases[2]}

**Business case:**
- **Efficiency:** eliminate re-keying and reconciliation between tools by sharing content-addressed facts.
- **Trust:** every {entities[0]} update is signed and timestamped, reducing disputes and audit preparation time.
- **Resilience:** local patches keep working during outages or cross-border data-transfer restrictions.

**Incentives:**
- **Personal:** build a portable professional reputation tied to a DID, not a platform profile.
- **Organisational:** cut integration costs and satisfy auditors with built-in provenance.
- **Ecosystem:** participate in industry-wide knowledge graphs without giving away proprietary data.

**Sample stitches in their Loom:**
{stitches}

**First week on the fabric:**
1. Spin up a Loom and create a yarn for `{profession.lower().replace(' ', '-')}`.
2. Publish five canonical {entities[0]} records as stitches.
3. Follow two peer yarns (e.g., a regulator and a key partner) and inspect the merged patch.

---
"""


def sector_section(name: str, entries: List[Tuple[str, str, List[str], str]]) -> str:
    body = "\n".join(profession_entry(p, r, e, b) for p, r, e, b in entries)
    return f"""## {name}

{body}
"""


def main():
    sections = [sector_section(name, entries) for name, entries in SECTORS]
    total_professions = sum(len(e) for _, e in SECTORS)

    doc = f"""# Professions Playbook — Who uses the fabric, why, and how

**Subtitle:** *Business cases and incentives for more than 100 professions on the Loom / KnitNet / Fiber / Plexus stack.*

**Status:** Generated playbook v0.1  
**Scope:** One-page-per-profession use cases, ROI framing, incentives and first-week actions.

---

## Executive summary

The VirtualPC fabric is not a single product for a single job title. It is a **shared knowledge infrastructure** that looks different depending on who is holding the Loom.

This playbook covers **{total_professions} professions** across twelve sectors. Each entry answers:

- What does this person actually do?
- Which parts of the fabric do they touch?
- What is the hard business case?
- What are their personal, organisational and ecosystem incentives?
- What are the first concrete actions in their first week?

All entries share one assumption: **the brain lives in the GitHub repo**. The repository is the machine; the brand websites, agent dashboards and profession-specific apps are views on the same fabric.

---

## How to read this playbook

- **If you are a founder or investor:** skim the executive summary and the sector headers, then read the entries closest to your target buyer.
- **If you are a product manager:** use the "Top 3 use cases" as starter user stories.
- **If you are an implementer:** use the "Sample stitches" as concrete data-model examples.
- **If you are a regulator or auditor:** focus on the "Business case" and "Incentives" sections for accountability and compliance value.

---

## Shared primitives across every profession

No matter the job title, every user works with the same five primitives:

| Primitive | What a professional sees |
|-----------|--------------------------|
| **Yarn** | Their professional identity stream — every fact they publish is signed. |
| **Stitch** | A single signed fact: a diagnosis, a contract clause, a sensor reading, a source note. |
| **Thread** | A sequence of stitches on one topic — e.g., a patient timeline or a project change log. |
| **Patch** | Their personal dashboard / database view after weaving the yarns they trust. |
| **Plexus** | The historian view — how the patch evolved, who said what, and when. |

---

{''.join(sections)}

## Cross-cutting incentives

Every profession in this playbook is motivated by at least one of the following:

1. **Lower integration cost.** One content-addressed fact can be reused by accounting, legal, operations and customers without building point-to-point APIs.
2. **Defensible audit trails.** Signed stitches are cheaper to produce and harder to dispute than document-based evidence.
3. **Professional portability.** A DID-backed yarn travels with the person, not the employer.
4. **Selective transparency.** Share exactly what is needed with exactly who needs it, without a central platform owning the relationship.
5. **Resilience.** Local patches keep working when cloud services, jurisdictions or network links fail.

---

## From playbook to PDF

This file is intentionally plain Markdown so it can be converted to a formal PDF:

```bash
pandoc docs/PROFESSIONS-PLAYBOOK.md -o docs/PROFESSIONS-PLAYBOOK.pdf \
  --pdf-engine=xelatex \
  -V geometry:margin=2.5cm \
  -V mainfont='Inter' \
  --toc
```

For a shorter pitch version, generate a one-slide summary per profession by extracting the "Role in one sentence", "Top 3 use cases" and "Business case" fields.

---

## Next steps

1. Validate the top 10 target professions with real users.
2. Replace generic ROI estimates in each entry with numbers from pilot deployments.
3. Link each profession to a ready-to-use Loom configuration in `config/professions/`.
4. Publish profession-specific landing pages under `public/professions/`.

---

*Generated by `scripts/generate-professions-playbook.py`. Update the profession list and re-run to refresh this document.*
"""

    OUT.write_text(doc, encoding="utf-8")
    print(f"Wrote {total_professions} professions to {OUT}")


if __name__ == "__main__":
    main()
