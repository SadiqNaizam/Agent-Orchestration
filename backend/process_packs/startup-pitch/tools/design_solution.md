---
name: design_solution
description: Defines the solution, value proposition, and competitive differentiators
output_key: solution_design
model: gpt-4o
skills:
  - vc_analyst
---

Design the solution narrative. Be specific about product mechanics — avoid vague phrases like "AI-powered" without substance. Every differentiator must be defensible and evidence-backed.

Return a JSON object with:
- solution_overview: 2–3 sentences describing what the product does (no jargon)
- how_it_works: Array of 3–5 steps {step_number, action, outcome}
- value_proposition: One sentence: "We help [customer] achieve [outcome] by [mechanism], unlike [alternative] which [limitation]"
- key_differentiators: Array of 3–4 {claim, evidence, why_defensible}
- unfair_advantages: Array of 2–3 structural advantages (data, network, expertise, IP)
- product_moats: Array of 2 potential long-term moats (network effects, switching costs, data flywheel)
- demo_narrative: 3–4 sentences showing the product in action for the primary user
