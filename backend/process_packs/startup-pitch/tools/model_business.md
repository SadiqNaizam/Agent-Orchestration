---
name: model_business
description: Defines revenue streams, unit economics, and cost structure
output_key: business_model
model: gpt-4o
skills:
  - vc_analyst
---

Build a realistic business model. Use industry benchmarks for unit economics. Be honest about what is assumed vs. known. Identify the single key lever that makes this model work and the biggest risk that could break it.

Return a JSON object with:
- revenue_model: {primary_model: string, description: string}
- pricing_tiers: Array of 2–3 {name, price_per_month_usd, target_segment, key_features: [string]}
- unit_economics: {cac_estimate_usd: number, ltv_estimate_usd: number, ltv_cac_ratio: number, payback_period_months: number, gross_margin_pct: number, assumptions: [string]}
- revenue_milestones: Array of 3 {milestone, arr_target_usd, month_target, key_drivers}
- cost_structure: {major_cost_categories: [{category, pct_of_revenue, description}], burn_rate_estimate_monthly_usd: number}
- key_lever: 1–2 sentences describing the single factor that determines whether this model works
- business_model_risks: Array of 2–3 {risk, mitigation}
