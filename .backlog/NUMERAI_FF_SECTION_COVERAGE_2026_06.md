# Numerai — Expand OHLCV coverage → re-validate FF / 25-section signal (multi-day)

**Owner project:** numerai-signals (claim the lease first — see Guardrails)
**Default tags inherited by items:** `project:numerai-signals`, `fama-french`, `coverage`, `ohlcv`, `research`
**Priority:** P1 (submission-quality; secondary to any live-submission breakage)
**Created:** 2026-06-11  ·  **Est. wall-clock:** 4–6 days (collector-gated, mostly unattended)
**Why on the backlog:** large + multi-day + mostly *waiting* on a rate-limited data collector. Do NOT
grind it inside an interactive Opus/Fable session (token burn). Background/virtualpc agents tick it
forward a little each day and only escalate to a human when a GATE is reached.

---

## Goal & success criteria
The FF 5×5 / 25-section + raw-OHLCV features were only **marginal/insignificant** at ~48.5% OHLCV
coverage (proof: `tests_v5/PROOF_ff_sections_20260611.md`). Hypothesis: coverage was the limiter.
**Success =** at ≥75% coverage, a re-run CPCV shows a *significant positive* recent-era (2017+) CORR
and/or MMC uplift → deploy a section-enhanced model to a **research `sctr_*` slot** (NOT staked
`develuse`). If still marginal at full coverage → record the negative result, blacklist the family in
`feature_registry.json`, and stop (don't keep recomputing duds).

RMSE frame: random rank-RMSE 0.408 → full-knowledge 0.05; log baseline-vs-augmented RMSE per the
evidence contract.

---

## Day-by-day plan (each day = one small, bounded tick)

### Day 1 — keep the collector alive + snapshot coverage  *(≈5 min/day, unattended)*
- Ensure the resumable collector runs: `pgrep -f numerai_mass_data_collect || nohup python3
  ~/numerai_mass_data_collect.py --mode yahoo >> ~/numerai_unattended_logs/yahoo_expand_cron.log 2>&1 &`
- Snapshot coverage: `python3 scripts/coverage_monitor.py --quiet` and record shard count.
- **GATE A:** stop ticking when OHLCV coverage ≥ ~214/270 shards (~79%). Until then, just keep alive.
- (Already cron-covered by `pre_deadline_prepare.sh` step 1 + `coverage_monitor` 07:23; this is the watch.)

### Day 2–4 — wait on coverage (collector is Yahoo-rate-limited)  *(passive)*
- One coverage snapshot/day; no compute. If the collector died, restart it (above). Nothing else.

### Day N (coverage ≥75%) — re-validate (ONE heavy job, ≤3h, capped threads)
1. `cd /media/knight2/EDS2/projects/numerai-signals/proofs/cross_pollination`
2. Recent window: `python3 prove_ff_sections.py --min-year 2017` (deployment-relevant)
3. Deep history: `python3 prove_ff_sections.py --min-year 1998`
4. Inspect `proof_result_ff_sections.json`: recent-era CORR uplift, positive-era rate, MMC (Newey-West).
   - Run ONE job at a time — `fit_predict` uses all 96 cores; concurrent runs oversubscribe (caused a
     prior fold-3 kill). Cap BLAS via env (`OPENBLAS/MKL/OMP_NUM_THREADS=4`).

### Day N+1 — deploy-or-reject GATE
- **GATE B (deploy):** recent CORR uplift > 0 with positive-era rate ≥ 0.5, *or* clearly positive MMC
  (Newey-West not adverse) → build a section-enhanced generator variant and submit it to a research
  slot via the existing manifest pattern:
  - add a row to `proofs/cross_pollination/signals_slots.tsv` (slot=`sctr_hdg_*` unused, target, outtag)
  - the pipeline (`pre_deadline_prepare.sh` / `daily_probe.sh`) then generates+submits it every round.
  - update `scripts/build_model_catalog.py` MODELS + `scripts/build_feature_evidence.py` (promote the
    family; link RMSE uplift, IC, proof path, MLflow run, KG node — the evidence contract).
- **GATE B (reject):** still marginal → `feature_registry.update(useless=[...], rnd=R)` to blacklist
  after 3 rounds; append the negative result to `tests_v5/PROOF_ff_sections_20260611.md`; stop.

### Day N+1 — hygiene (optional, light)
- Re-run `audit_ff_leakage.py` shuffled-placebo arm with capped `num_threads` (confirms harness
  cleanliness only; not a blocker).

---

## Critical files
- `proofs/cross_pollination/prove_ff_sections.py` — CPCV (raw-Close size + as-of join already wired).
- `proofs/cross_pollination/ff_sections.py` — `ff_section_features`, `attach_sections_asof`, `load_full_universe_with_raw`.
- `proofs/cross_pollination/signals_slots.tsv` — slot manifest (add the research slot here on deploy).
- `scripts/coverage_monitor.py` — coverage snapshot. `~/numerai_mass_data_collect.py` — the collector.
- Proof log: `tests_v5/PROOF_ff_sections_20260611.md`. Evidence: `reports/FEATURE_RMSE_KNOWLEDGE_LINKS.md`.

## Guardrails
- **Claim the lease first:** `python3 ~/.claude/coordination/coord.py claim numerai --note "FF coverage revalidate"`; release when done.
- Real data only (no synthetic). Reuse existing modules; **no new pipeline scripts/folders**.
- Compute: 96-core/640GB; **one heavy job at a time, ≤3h, thread-capped**. Never oversubscribe.
- Never deploy to staked `develuse` from this task — research `sctr_*` slot only.
- Token economy: this is a *watch-and-tick* task — passive most days; only the Day-N revalidation +
  Day-N+1 deploy are active. Don't open a big interactive session to babysit the collector.
