# Numerai — Feature-engineering CURRICULUM (learn which features to compute, each run)

**Owner:** numerai-signals (claim the lease) · **Priority:** P1 (closes the knowledge gap → 95th pct)
**Project:** numerai-signals
**Default tags inherited by items:** `project:numerai-signals`, `feature-engineering`, `curriculum`, `cpcv`, `research`
**Created:** 2026-06-11 · **Shape:** 6 big runs, one per night in a cron-clear window, ≤3h each.
**Learning state:** `reports/feature_family_scoreboard.json` (read it BEFORE each run; update it AFTER).

## The idea
Each run tests ONE coherent feature **family** so usefulness is attributable. The run's result is
*recorded*, and the NEXT run uses it: the **feature_registry** blacklists what was useless 3+ rounds
(generators skip it → saves compute), and the **family scoreboard** reallocates compute toward winners
(generate MORE around confirmed features) and drops losers. So we *learn which features to calculate*
instead of recomputing everything every round. Knowledge frame: random rank-RMSE **0.408** → full **0.05**;
we're at ~6% — every family is measured by how much of that gap it closes, per compute-hour.

## The fixed harness (same every run — reuse, no new pipeline)
```
GENERATE  (registry.filter_candidates first → skip blacklisted)         → reports/<family>.parquet
  → PROBE_SELECT  probe_select.py --extra <family>.parquet --round R     (null-importance: 3 random
                  probes, drop every feature ≤ best probe, loop; gold method frees memory)
  → REGISTRY      feature_registry.update(useful, useless, R)            (blacklist 3+ useless rounds)
  → CPCV CONFIRM  prove_* harness on survivors (CORR/RMSE/MMC, Newey-West, embargo=20, per-era)
  → EVIDENCE      build_feature_evidence.py / link_feature_rmse_knowledge.py  (RMSE/IC/proof/MLflow/KG)
  → DEPLOY        winners → develuse ONLY if beats baseline CORR; else diversity sctr_* / the NN slot
  → SCOREBOARD    write n_generated/n_survived/n_confirmed/corr+rmse uplift/runtime/uplift_per_hour/decision
```
Every run logs cost (runtime, rows, eras, features, threads) to MLflow → **uplift-per-compute-hour** ranks
families. Deploy is gated by the evidence contract; CORR/MMC-only stays research-only.

## The 6 runs (ordered cheap-informative → expensive-uncertain)

### Run 1 · `A_transforms` (~1h) — transforms of the strong features we already trust
Generate from base(22) + FRS(60) + crypto-agg(9): per-era **multi-timeframe ranks** (rolling 5/20/60-era
per ticker), **z-scores**, **z-quantiles (1–5)**, and **higher-order moments** (skew, kurt) per era of the
features AND of their quantiles/zscores. Extend `feature_factory.py` (it already does rank/z/zq + interactions).
**Learn:** do transformations add signal beyond the raw features, or is the GBM/NN already capturing them?

### Run 2 · `C_thematic_sector` (~1.5h) — the strongest prior (sectors/themes)
GICS **sector (11) / sub-industry (206)** + crypto-category aggregates: per-era sector mean / **dispersion** /
momentum of each base feature; **ticker-minus-sector** (sector-relative); sector one-hot × momentum. Reuse the
identifier/sector meta in `ff_sections.py`. **Learn:** does sector/thematic structure predict the 20d-forward
rank? (Equity & crypto react to economic themes + the sectors their orgs/developers operate in.)

### Run 3 · `D_crosspoll_both` (~1.5h) — both directions of cross-pollination
Crypto→equity: expand beyond the 9 dispersion survivors (crypto **category** aggregates, **on-chain
transaction** aggregates from YIEDL onchain). Equity→crypto: **screen the missing direction** (equity-market
aggregates → forward crypto return — `crosspoll_basis_scores.csv` currently has only crypto→equity). Extend
`build_crosspoll_basis.py`. **Learn:** which cross-asset regime features predict the OTHER market.

### Run 4 · `F_macro_regime` (~0.7h) — macro/trend regime
FRED macro point-in-time by date (rates, CPI, payrolls, VIX, term spread) + their momentum/trend; join to the
equity panel by date (lag 1d). Reuse `data/equity/raw/fred`. **Learn:** do macro regime features improve the
20d forecast beyond `macro_PAYEMS` (already FRS-active)?

### Run 5 · `B_interactions_deep` (~2.5h) — wide interactions, hard prune
`feature_factory.py --topk 40 --topj 16` → ~780 pairwise + ~560 triple products of the top features, then
**aggressive** probe-prune (the gold method: keep only what beats 3 random probes, loop until they sink).
**Learn:** which specific pairs/triples carry non-linear signal a tree/NN can exploit.

### Run 6 · `E_tsfresh_efficient` (~2.5h) — time-series descriptors
`tsfresh_loop.py` efficient preset on rolling OHLCV windows for a **sampled** ticker set (bounded); FRS-score.
(Minimal preset earlier found 0 winners; efficient preset is richer.) **Learn:** do autocorr/entropy/trend
descriptors add signal, or is tsfresh a dud to blacklist?

## How each run teaches the next (the point of the exercise)
- **Blacklist:** features useless 3 consecutive rounds → `feature_registry` → generators skip them.
- **Expand:** confirmed winners → next run generates MORE of that shape (e.g., if FRS×sector interactions win,
  Run 2+5 focus there). Encoded as `decision: expand` in the scoreboard.
- **Reallocate:** rank families by `uplift_per_hour`; give the next slot's compute to the best ROI family.
- **Completeness critic** (after Run 6): list families NOT yet tried (wavelet, regime-switching, microstructure,
  fundamentals deltas) → they become the next curriculum.

## Compute discipline (hard)
- 96-core/640GB; **one heavy job at a time, ≤3h**, thread-capped (`OPENBLAS/MKL/OMP=4`, `POLARS=16`), row/
  ticker-sampled, capped feature counts. **Never** run during the 14:00 pre_deadline / 15:05 daily_probe /
  16:15 crypto-dispersion / 18:00 feature-discovery crons — schedule a `feature_curriculum.sh` at e.g. **20:00
  UTC** that pops the next `pending` family from the scoreboard, runs the harness, writes results, exits (one
  family/night). Guard: defer if any heavy numerai job is live.
- Real data only. EUR-standardize any market-cap before grouping (market-cap rule). Reuse modules; no new folders.

## Deliverables per run
`reports/<family>.parquet`, `probe_selected_features.json`, a CPCV `proof_result_<family>.json` in tests_v5,
an MLflow run, an updated `feature_family_scoreboard.json` row, and (if confirmed) an entry in
`FEATURE_RMSE_KNOWLEDGE_LINKS.md`. Winners deploy per the gate; the rest are documented + blacklisted.
