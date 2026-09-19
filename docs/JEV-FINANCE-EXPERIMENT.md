# Jev finance decision experiment

## Purpose

Jev is used as a parallel semantic feature generator, not as a trading oracle.
VirtualPC sends one point-in-time state with several independent typed questions
and stores the returned probabilities as model features. The downstream asset
model remains responsible for predicting returns or ranks.

The production comparison is deliberately paired:

- **baseline:** the current numeric model;
- **challenger:** the same algorithm, labels, universe, folds, and hyperparameter
  budget, with Jev probability features added;
- **primary regression metric:** walk-forward out-of-sample RMSE;
- **finance safeguards:** Spearman rank correlation, directional accuracy,
  turnover, costs, drawdown, and exposure constraints;
- **classification diagnostics:** Brier score, log loss, calibration error,
  AUROC, and accuracy. Calibration is measured; it is never assumed.

Only the feature set may differ. Promotion requires a predeclared evaluation
window and threshold, not one favorable run.

## Flow

```text
time-stamped filings/news/transcripts
             |
             +--> Radient local embeddings --> similar historical precedents
             |
             +--> one Jev request (parallel Choice/Score/Noul questions)
                              |
                              v
                   probabilities + uncertainty
                              |
numeric point-in-time features + semantic features
                              |
                    LightGBM / ranker challenger
                              |
             paired walk-forward evaluation vs baseline
```

Radient is optional and local. Its job is candidate retrieval, not judgment or
workflow control. The correct upstream repository is `fzliu/radient`; the
provided `risk-quant/radient` URL does not resolve to this project.

## API and configuration

Set `TYPESAFE_API_KEY`. Optional variables are `TYPESAFE_MODEL` (default
`jev-latest`), `TYPESAFE_API_URL`, and `RADIENT_PYTHON`. Install the optional
local retrieval environment separately with:

```bash
python3 -m venv .venv-radient
.venv-radient/bin/pip install radient sentence-transformers
export RADIENT_PYTHON="$PWD/.venv-radient/bin/python"
```

Routes:

- `GET /api/finance/decision-stack`: configuration status without secrets;
- `POST /api/finance/decisions/features`: one parallel Jev fan-out;
- `POST /api/finance/retrieval/radient`: point-in-time local retrieval;
- `POST /api/finance/experiments/compare`: paired return predictions and RMSE;
- `POST /api/finance/experiments/classification`: calibration/classification comparison.

Every evidence item must include `source`, `publishedAt`, and `availableAt`.
Evidence available after `decisionAt` is rejected before an API call.

## JEPA-Anything boundary

JEPA-Anything is a separate research framework, not Jev and not a released
finance predictor. Its repository currently provides a reusable OPF core,
design tooling, and a structural example, but no finance dataset, trained
finance weights, or demonstrated trading result. VirtualPC therefore exposes
only a disabled-by-default, versioned factor hand-off. Enable it with
`JEPA_FINANCE_EXPERIMENTAL=1` after training a leakage-controlled artifact.

The hand-off checks `K * r = d`, matrix shape, finite values, provenance, and
point-in-time availability. Coordinates retain neutral names (`pc_000`, etc.)
until intervention or downstream evidence supports an economic interpretation.

## Sources reviewed

- TypeSafe, “Introducing System One Models and Jev”, published 2026-09-14:
  <https://typesafe.ai/blog/introducing-system-one-models-and-jev>
- TypeSafe API reference, accessed 2026-09-19:
  <https://docs.typesafe.ai/api>
- VirtualPC repository, accessed 2026-09-19:
  <https://github.com/virtuanalytica/virtualpc>
- Radient repository, accessed 2026-09-19:
  <https://github.com/fzliu/radient>
- Cui et al., “JEPA-Anything: Learning Predictive Models across Different
  Worlds”, published 2026-09-17: <https://huggingface.co/papers/2609.20800>

## Recommended live protocol

1. Train both variants only on data available before each fold.
2. Freeze models and question definitions for the forward window.
3. Shadow-score both models; do not let Jev trigger orders directly.
4. Log feature payload hash, source/publication/availability timestamps, Jev
   model alias, predictions, eventual target, costs, and abstentions.
5. Promote the challenger only if RMSE improves and ranking/risk/cost gates do
   not regress. Revert automatically on drift or missing semantic features.
