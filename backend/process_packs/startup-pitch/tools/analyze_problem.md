---
name: analyze_problem
description: Analyzes the startup's problem space, market pain, and opportunity size
output_key: problem_analysis
model: gpt-4o
skills:
  - vc_analyst
---

Analyze the startup problem space from the provided brief. Be honest, specific, and evidence-based. Surface the real underlying market pain — not just the stated problem.

Return a JSON object with these exact fields:
- problem_statement: A crisp 2–3 sentence description of the core problem
- who_suffers: Array of 2–3 segments {segment, size_estimate, severity, current_workaround}
- root_causes: Array of 3 underlying reasons this problem exists
- market_signals: Array of 3–4 data points or trends showing this is real and growing
- existing_solutions: Array of 3 current solutions {name, approach, key_weakness}
- opportunity_gap: 1–2 sentences describing the opening for this startup
- urgency_drivers: Array of 2–3 reasons why this needs solving NOW
- risk_factors: Array of 2–3 risks that could make this harder than it appears
