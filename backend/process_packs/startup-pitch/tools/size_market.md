---
name: size_market
description: Estimates TAM, SAM, SOM with methodology, comparables, and assumptions
output_key: market_sizing
model: gpt-4o
skills:
  - vc_analyst
---

Size this market using both top-down and bottom-up approaches. Reference real comparable companies where possible. Do not invent numbers — estimate with explicit methodology and flag uncertainty where it exists.

Return a JSON object with:
- tam: {value_usd_millions: number, description: string, methodology: string, sources: [string]}
- sam: {value_usd_millions: number, description: string, rationale: string}
- som: {value_usd_millions: number, description: string, rationale: string, year_3_target_pct: number}
- comparable_companies: Array of 3–4 {name, market_at_series_a, current_valuation_or_revenue, relevance}
- growth_rate: {cagr_pct: number, rationale: string}
- key_assumptions: Array of 3–4 critical assumptions underlying these estimates
- investor_framing: 2–3 sentences framing the market size persuasively but credibly
