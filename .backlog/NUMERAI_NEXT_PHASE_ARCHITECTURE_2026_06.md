# Numerai — Next-phase architecture: richer features · multi-source provenance · sector edge

**Owner:** numerai-signals · **Priority:** P1 (post the recency win, the next CORR/MMC levers)
**Project:** numerai-signals
**Default tags inherited by items:** `project:numerai-signals`, `architecture`, `provenance`, `features`, `sector-edge`
**Created:** 2026-06-11 · Context: the big win this session was DATA RECENCY (+0.0249 CORR, p~1e-121).
This plan captures the user's next directions. RMSE is NOT the metric (unreachable <0.21); score on
CORR/MMC vs the `example_preds` benchmark. Evidence contract applies: CPCV-confirm before deploy.

## 1 · Advanced interactions + higher-order moments (extend feature_factory, no new pipeline)
Current `feature_factory`: per-era rank/z/zq, products (x2/x3), per-ticker rolling z+skew (--tf-moments),
sector aggs (--sector), macro (--macro), crypto-agg (--crosspoll). ADD a `--advanced` family:
- **Higher moments:** rolling KURTOSIS (have skew); per-era cross-sectional skew/kurt (regime); and
  moments OF the quantiles/zscores/interactions (user: "higher order moments of ... interactions").
- **Co-moments:** feature × forward-market proxy → co-skewness/co-kurtosis with the market (downside risk).
- **Advanced interactions:** ratios a/b, normalized products a·b/(|a|+|b|), conditional a·sign(b),
  rank-interactions rank(a)·rank(b), and difference-of-z. (Plain products already win 155/176 in probe.)
- Feed through the curriculum (probe_select → CPCV-confirm). Bound top-K to respect <=3h.

## 2 · More data sources + PROVENANCE (source + publication date stored in the file)
Every ingested datum must carry its lineage so we stay point-in-time and auditable:
- **Schema convention:** each ingested feature/data file carries `source` (provider/dataset id) and
  `pub_date` (a.k.a. as-of/available-at — when the value was PUBLISHED, not the bar date). A helper
  `tag_provenance(df, source, pub_date_col)` stamps these; a registry maps feature -> source + lineage
  (the parallel feature_knowledge_base.sqlite already started crypto source lineage).
- **Point-in-time rule:** join external data by `pub_date <= era_date` (use only what was available),
  never the bar date — this is the same provisional->EOD-overwrite invariant as the intraday-PVT backlog.
- **New sources (ranked by expected edge):** (a) fundamentals / financial statements (value, quality,
  accruals) with filing `pub_date`; (b) more price/volume providers for cross-validation + the freshest
  bar; (c) crypto on-chain (YIEDL onchain — txn counts) and category data; (d) macro (FRED — wired);
  (e) news/sentiment with publish timestamps. Each lands with source + pub_date columns.
- Multi-day data-eng build; reuse `yiedl_data.ingest_daily` dedup pattern; one source at a time, CPCV-gated.

## 3 · Sector edge + sector databases (certain industries we have an edge in)
- **Measure the edge:** `prove_sector_edge.py` (built) trains the recent-data baseline and reports per-GICS-
  sector per-era CORR on the 2024-2026 holdout -> ranks sectors by predictability. Run it; the top sectors
  are where we have an edge.
- **Sector databases:** for the edge sectors, build dedicated per-sector data/feature stores (sector-specific
  fundamentals, peer aggregates, sector-relative features — the `--sector` family is the seed) under
  `data/sector/<gics_sector>/` with the §2 provenance schema. Then sector-SPECIALISED models (one model per
  edge sector, or a sector-interacted global model) and deploy the winners to diversity slots (MMC).
- GICS meta is ready (`ff_sections.load_identifier_meta`: 22k tickers, 12 sectors, sub-industries).

## Sequencing (one heavy job at a time, <=3h, cron-clear windows)
1. Run `prove_sector_edge.py` -> identify edge sectors.   2. Add `feature_factory --advanced` -> curriculum.
3. Establish the provenance schema + helper; retro-tag existing stores.   4. Ingest the top new source
(fundamentals) with source+pub_date.   5. Build sector DBs for the edge sectors -> sector-specialised models.
Each step CPCV-gated (CORR/MMC vs baseline) before deploy; log to MLflow + the feature KB + LightRAG.
