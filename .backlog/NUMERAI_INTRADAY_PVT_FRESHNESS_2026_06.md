# Numerai — Today's intraday price/volume/transaction (beyond-EOD edge) + EOD-overwrite freshness

**Owner project:** numerai-signals (claim the lease first)
**Default tags inherited by items:** `project:numerai-signals`, `intraday`, `price-volume-transaction`, `freshness`, `live-inference`
**Priority:** P1 (submission-quality edge; the NN ingestion hook is already built and waiting)
**Created:** 2026-06-11  ·  **Est:** 3–5 days (rate-limited full-universe fetch + finalize loop)
**Why on the backlog:** a real multi-day data-engineering build (full-universe intraday fetch is Yahoo/
exchange rate-limited) — don't grind it in an interactive session. The NN already has the integration
hook; this fills it.

---

## Goal
Give the models the **freshest** signal competitors lack: today's intraday **price, volume, and
transaction** data for the FULL universe (≈7,400 equities + ≈300 cryptos), turned into the same
daily-bar features the NN/GBM train on, fed at inference ~1h before the deadline. Critically, today's
intraday bar is **provisional** — once tomorrow's EOD bar for today's date exists, **overwrite** the
provisional row so we never keep half-day data as a finalized bar.

## Integration hook (ALREADY BUILT — just produce the two files)
`scripts/train_nn_signals.py :: load_enhanced()` joins, when present:
- `data/live_current/intraday_features_hist.parquet` — per (numerai_ticker, date) **historical** daily-bar
  features (return_1d, dvol_1d, vol_ratio_20, txn_*). Built from the EOD OHLCV store. Used for TRAINING.
- `data/live_current/intraday_features_live.parquet` — per numerai_ticker **today's** provisional values
  for the SAME feature definitions. Used for LIVE inference.
Same definitions on both sides so the NN actually learns their value. Produce these two files and the
features activate automatically (no NN code change). Later: wire the same join into
`proofs/cross_pollination/make_live_submission.py` for the GBM slots.

## Build plan
### Phase 1 — feature definitions (1 file, reuse raw_features/financial_volume)
- Define the daily-bar features on the EOD OHLCV store (`data/equity/raw/yahoo_full_universe`,
  `data/crypto/*`): `return_1d`, `dvol_1d = close*volume`, `vol_ratio_20 = volume/avg20`, and a
  transaction proxy (equity: trade count if available else volume; crypto: on-chain tx count from YIEDL
  onchain). Reuse `proofs/cross_pollination/{raw_features.py,financial_volume.py}` where possible.
- Emit `intraday_features_hist.parquet` (per ticker/date, full history) — this is the training side.

### Phase 2 — intraday fetcher (equity, rate-limited → background)
- Map numerai_ticker → Yahoo symbol (the collector already has this map). Pull today's bar via
  `yfinance` `fast_info`/`history(period='1d', prepost=True)` in **batches** with backoff (≈7.4k tickers).
- Compute the Phase-1 features from today's partial bar → `intraday_features_live.parquet`
  (one row per ticker, `provisional=true`, `asof=<utc>`).

### Phase 3 — intraday fetcher (crypto)
- ≈300 symbols via an exchange API (ccxt/binance) or YIEDL latest pvm + onchain tx. Same feature set.
- Append to `intraday_features_live.parquet`.

### Phase 4 — provisional → EOD overwrite (freshness, the key requirement)
- Daily finalize job: when the EOD bar for date D exists (collector ran for D), **recompute D's features
  from EOD and overwrite** the provisional row in the hist store (dedup on (ticker, date) keep finalized,
  `provisional=false`). Idempotent. This guarantees we never train on half-day data — only the live
  inference uses the provisional same-day bar.
- Pattern to reuse: `yiedl_data.py::ingest_daily()` already does atomic dedup-keep-last in-place.

### Phase 5 — schedule + wire
- Run the intraday fetch in the **pre-deadline window** (extend `pre_deadline_prepare.sh`, ~1h pre-open)
  so live inference uses the freshest bar. Run the finalize/overwrite job daily after the EOD collector
  (e.g., post `numerai_daily_refresh`).
- Once `intraday_features_{hist,live}.parquet` exist, the enhanced NN ingests them automatically; then
  add the same join to `make_live_submission.py` for the GBM slots.

## Guardrails
- Claim the numerai lease. Real data only (no synthetic). Reuse existing modules; no new pipeline folders.
- Compute ≤3h/job, one heavy job at a time, thread-capped. Full-universe fetch is I/O-bound + rate-limited
  → batch + backoff, run in background over hours, not one blocking call.
- **Freshness invariant:** a finalized (EOD) bar must always win over a provisional (intraday) bar for the
  same (ticker, date). Never let a half-day value persist as final.
- Validate the edge before trusting it: CPCV the intraday features (CORR/RMSE/MMC, evidence contract)
  before promoting them into the staked `develuse`; research slots first.
