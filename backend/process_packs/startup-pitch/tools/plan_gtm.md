---
name: plan_gtm
description: Creates a go-to-market strategy with phases, channels, and a 90-day launch plan
output_key: gtm_strategy
model: gpt-4o
skills:
  - vc_analyst
  - gtm_strategist
---

Design a realistic, sequenced GTM strategy. Every channel recommendation must include a specific tactic and a rationale tied to this startup's ICP and product motion. Avoid generic advice.

Return a JSON object with:
- gtm_motion: {type: "product_led"|"sales_led"|"community_led"|"content_led", rationale: string}
- icp: {description: string, company_size: string, industry: string, job_title: string, trigger_event: string}
- phases: Array of 3 {phase_name, duration, primary_goal, key_activities: [string], success_metric}
- channels: Array of 3–4 {channel, why_this_startup, specific_tactic, expected_cac_range_usd, timeline_to_results}
- launch_90_day_plan: Array of 3 months {month, focus, milestones: [string], targets}
- partnerships: Array of 2 {partner_type, value_exchange, example_targets}
- first_10_customers: Array of 3–4 specific tactics for landing the first 10 paying customers
