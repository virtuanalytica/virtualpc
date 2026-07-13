# Numerai F&F Cross-Asset Execution

**Owner project:** `numerai-signals`  
**Default tags inherited by items:** `project:numerai-signals`, `fama-french`, `cross-asset`, `execution`, `research`
**Execution platform:** `virtualPC`  
**Explicit separation:** this is not a MOLGANG development item. Do not route work to `molgang-web`, `roblox_molgang`, `molgang-godot`, `molgang-3d`, or MOLGANG backup/deployment tasks.  
**Source strategy:** `/media/knight2/EDS2/projects/numerai-signals/reports/FF_CROSS_ASSET_PREDICTION_WORKFLOW.md`  
**Priority:** P1 research execution  
**Created:** 2026-06-12

## Objective

VirtualPC must coordinate execution of the individual Fama/French equity and crypto prediction workflow, then feed approved prediction vectors into the final ranking model.

The core modeling principle is:

```text
feature != beta alone
feature = factor premium evolution * asset beta
expected_excess_return[a,t] = sum_k beta[a,k,t] * expected_premium[k,t]
benchmark_exposure[a,t] = beta_to_benchmark[a,t] * benchmark_excess_return_z[t]
```

Stationarity rule: raw risk premia and benchmark excess returns are not comparable across high-volatility, inflationary, and calm regimes. Agents must translate each premium and benchmark excess-return series into lag-safe rolling z-scores before computing time-series quintiles, daily cross-sectional quintiles, or beta-premium interactions.

Synthetic benchmark rule: do not block on missing MSCI-style regional, country, sector, or subsector history. When external index histories are missing, build internal benchmark returns from the tradable universe using lagged market-cap weights blended with lagged trading-volume/ADV liquidity weights.

Crypto regional rule: crypto assets are global, but their trading and adoption are regional. Agents must gather or infer exchange-region metadata, regional transaction volume, quote-currency region, venue type, and regional download/adoption proxies as separate crypto inputs before building crypto regional factor sleeves.

## Workstream Boundaries

Allowed roots:

- `/media/knight2/EDS2/projects/numerai-signals`
- `/media/knight2/EDS2/projects/numerai-signals/data`
- `/media/knight2/EDS2/projects/numerai-signals/reports`
- `/media/knight2/EDS2/projects/numerai-signals/proofs`
- `/media/knight2/EDS2/projects/numerai-signals/submissions`

Disallowed for this workstream:

- `/media/knight2/EDS2/projects/molgang-web`
- `/media/knight2/EDS2/projects/roblox_molgang`
- `/media/knight2/EDS2/projects/molgang-godot`
- `/media/knight2/EDS2/projects/molgang-3d`
- `/home/knight2/molgang-roblox`
- `/home/knight2/mnt/molgang`

## Agent Responsibilities

### Analyst

Owns feature/evaluation execution.

- Inspect equity, crypto, Fama/French, news, and cross-asset inputs.
- Gather equity and crypto benchmark return series plus RF/cash-rate inputs.
- Build synthetic region, country, sector, industry-group, subsector, region x sector, and country x sector benchmarks from lagged market cap and trading volume when external index history is unavailable.
- Build crypto exchange-region, quote-currency-region, regional transaction-volume, venue-type, and regional download/adoption panels with observed-vs-inferred source flags.
- Build lag-safe premium evolution features.
- Build rolling beta-to-factor and beta-to-benchmark feature packs.
- Build z-scored beta-times-premium and beta-to-benchmark-times-excess-return feature packs.
- Quantile benchmark exposure daily by asset class only after the premium/excess-return state has been rolling z-scored.
- Run RMSE, IC quantile, alpha, MMC, and hit-rate diagnostics.
- Produce `reports/ff_cross_asset_metrics_latest.csv`.

### Kai

Owns infrastructure and batching.

- Create sparse/partitioned batch layout for huge interaction features.
- Keep one heavy job at a time and enforce thread caps.
- Make feature manifests deterministic and hashable.
- Ensure canonical row ordering: `(date, asset_class, asset_id)`.
- Store synthetic benchmark constituents, weights, concentration, effective-name count, and data-quality flags with every benchmark artifact.
- Store crypto exchange metadata, exchange-region mappings, quote-currency mappings, transaction-volume provenance, and download/adoption provider metadata with every crypto regional artifact.

### Kimi

Owns knowledge synthesis.

- Read the strategy document and prior feature-engineering research.
- Summarize assumptions, required inputs, leakage risks, and open decisions.
- Write knowledge-pit facts after each evidence gate.

### Alexander

Owns validation gates.

- Review target alignment and lag safety.
- Approve or reject feature families based on evidence.
- Require RMSE, IC quantiles, alpha, MMC, and exposure diagnostics before promotion.

### MoneyGod

Owns compute budget and resource caps.

- Keep the jobs within the local 96-core/640GB machine limits.
- Prevent oversubscription with BLAS/thread caps.
- Track whether the feature family creates enough marginal value to justify recurring compute.

## Execution Sequence

1. Confirm input availability:
   - `data/live_current/signals_v21_train.parquet`
   - `data/live_current/crypto_v20_train.parquet`
   - `data/equity/factors/fama_french_5factor_daily.parquet`
   - equity benchmark returns, crypto benchmark returns, and RF/cash-rate inputs.
   - market-cap, price, volume, country/region, sector, industry-group, and subsector labels or proxies.
   - crypto exchange id, exchange jurisdiction/region, venue type, market type, base/quote asset, quote-currency region, USD volume, trade count/depth where available.
   - crypto regional transaction volume: observed on-chain regional volume, exchange inflow/outflow by region, stablecoin settlement volume, or exchange-region inferred volume.
   - crypto regional download/adoption data: exchange/wallet app downloads, web traffic, search interest, app-rank deltas, or signup proxies with provider and timestamp.
   - `data/universe/cross_asset_ff_groupings_latest.parquet`
   - `data/news/features/news_sparse_rows_latest.parquet`
   - `data/news/normalized/article_asset_features_latest.parquet`
2. Build synthetic regional and sector benchmarks:
   - `dollar_volume = close * volume`
   - `adv20 = rolling_mean(dollar_volume, 20)`
   - `synthetic_weight = 0.70 * lagged_market_cap_weight + 0.30 * lagged_adv20_weight`
   - groups: global, region, country, sector, industry group, subsector, region x sector, country x sector.
   - keep cap-weighted, liquidity-weighted, equal-weighted, and blended benchmark variants for diagnostics.
   - require minimum constituent count and aggregate ADV; attach data-quality and concentration flags.
3. Build crypto regional exchange and transaction layer:
   - `exchange_region_volume = sum usd_volume by asset/date/exchange_region`
   - `exchange_region_volume_share = exchange_region_volume / all_region_volume`
   - `regional_tx_volume = onchain_tx_value + exchange_inflow_value + exchange_outflow_value`
   - infer regional exposure from exchange-region volume and quote-currency region when direct regional transaction mapping is unavailable.
   - build regional download/adoption z-scores and trends only from lag-safe provider data.
   - keep observed-vs-inferred flags and source/provider/license/timestamp metadata.
4. Build factor premium evolution:
   - rolling mean, volatility, lag-safe z-score, slope, sign persistence, z-score-based quantile state.
   - do not quantile raw risk premia directly; translate to rolling z-scores first.
5. Build 5x5 factor-section premiums:
   - equity: size/value/profitability/investment/momentum sections.
   - crypto: size/liquidity/momentum/volatility/drawdown sections.
   - crypto regional sections: exchange region x momentum, quote-currency region x liquidity, regional transaction-volume quintile x momentum, regional download/adoption quintile x volatility.
6. Estimate rolling betas:
   - 60d, 252d, 756d where available.
   - fallback group beta where history is insufficient.
   - include beta to equity market benchmarks and crypto market benchmarks.
   - include beta to synthetic region, country, sector, industry-group, subsector, region x sector, and country x sector benchmarks.
   - include beta to crypto exchange-region benchmarks, regional transaction-volume premiums, and regional adoption/download premiums.
7. Generate sparse interaction features:
   - `beta * premium_state`
   - `beta_to_benchmark * benchmark_excess_return_z`
   - `beta_to_synthetic_group * synthetic_group_excess_return_z`
   - `beta_to_crypto_exchange_region * crypto_exchange_region_excess_return_z`
   - `beta_to_regional_tx_volume * regional_tx_volume_z`
   - `beta_to_regional_download_adoption * regional_adoption_z`
   - daily cross-sectional quintiles of z-scored benchmark exposure by asset class
   - daily cross-sectional quintiles of z-scored synthetic group exposure within region/sector sleeves
   - daily crypto quintiles by exchange region, quote-currency region, and venue type
   - rolling time-series quintiles of z-scored factor and benchmark premium states
   - `beta * section_premium`
   - `beta * news_relevance_weighted_sentiment`
   - cross-equity and cross-crypto aggregate spillover features.
8. Train grouped models first:
   - equity sector/region/section models.
   - equity industry-group, subsector, region x sector, and country x sector models where constituent depth is sufficient.
   - crypto large-cap/liquidity/spillover models.
   - crypto exchange-region, regional transaction-volume, and regional adoption/download models.
9. Add individual per-asset models only when history is sufficient.
10. Validate:
   - RMSE lower better.
   - mean/median IC and hedge-fund IC quantiles.
   - alpha and alpha t-stat after factor controls.
   - MMC versus existing candidate ensemble.
   - exposure/correlation to existing candidates.
   - split validation by crypto exchange region, quote-currency region, venue type, and observed-vs-inferred regional volume quality.
11. Feed approved prediction vectors to the final ranking model.

## Promotion Gate

Promote a feature/model family only if:

- RMSE improves or remains neutral while IC improves.
- `IC_q25` is not strongly negative.
- mean MMC is positive versus the current ensemble.
- alpha remains positive after factor controls.
- exposure to a single factor/news family is bounded.
- recent-era validation survives regime splits.

## Expected Outputs

- `data/features/ff_cross_asset/ff_factor_premiums_latest.parquet`
- `data/features/ff_cross_asset/ff_asset_betas_latest.parquet`
- `data/features/ff_cross_asset/ff_synthetic_group_benchmarks_latest.parquet`
- `data/features/ff_cross_asset/ff_synthetic_group_benchmark_constituents_latest.parquet`
- `data/features/ff_cross_asset/ff_regional_sector_factor_premiums_latest.parquet`
- `data/features/ff_cross_asset/ff_crypto_exchange_region_metadata_latest.parquet`
- `data/features/ff_cross_asset/ff_crypto_regional_transaction_volume_latest.parquet`
- `data/features/ff_cross_asset/ff_crypto_regional_adoption_downloads_latest.parquet`
- `data/features/ff_cross_asset/ff_crypto_regional_factor_premiums_latest.parquet`
- `data/features/ff_cross_asset/ff_benchmark_excess_returns_latest.parquet`
- `data/features/ff_cross_asset/ff_benchmark_betas_latest.parquet`
- `data/features/ff_cross_asset/ff_benchmark_exposure_quintiles_latest.parquet`
- `data/features/ff_cross_asset/ff_expected_excess_returns_latest.parquet`
- `data/features/ff_cross_asset/ff_interactions_sparse_latest.npz`
- `data/features/ff_cross_asset/ff_interactions_rows_latest.parquet`
- `data/features/ff_cross_asset/ff_interactions_columns_latest.parquet`
- `data/features/ff_cross_asset/ff_feature_manifest_latest.json`
- `reports/ff_cross_asset_metrics_latest.csv`
- `reports/ff_cross_asset_ic_quantiles_latest.csv`
- `reports/ff_cross_asset_alpha_mmc_latest.csv`

## Guardrails

- Do not touch MOLGANG code or assets for this workstream.
- Do not materialize dense all-by-all 5,500 x 5,500 interaction tables.
- Keep interactions sparse and top-K selected by asset/family.
- Run one heavy job at a time.
- Log rejected feature families so the knowledge base learns from negative evidence.
