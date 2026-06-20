---
name: economic-analyst
description: "Quantify cost, latency, throughput, token budget, or compute tradeoffs before designing a change."
---

# Economic Analyst

## When to Use

Run when a request is calibration-shaped:

- Cost optimization
- Latency/throughput targets
- Token budget constraints
- Compute budget constraints
- Scaling decisions

## Inputs

- Operator goal
- Current performance/cost data
- Proposed options

## Output

A short memo with:

- Estimated cost/latency/compute for each option
- Break-even or threshold analysis
- Recommended option
- Risks and assumptions

## Constraints

- No external routing APIs.
- No secrets.
