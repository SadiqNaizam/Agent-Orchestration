---
process_id: feature_design_sprint
version: 1.0.0
label: "Feature Design Sprint"
description: "Rapid 5-step design sprint — from raw feature idea to a structured screen inventory, covering problem framing, users, opportunities, IA, and a prioritised feature table."
default_model: gpt-4o
---

## State Schema

| Artifact Key       | Type   | Produced By      | Description                                              |
|--------------------|--------|------------------|----------------------------------------------------------|
| project_brief      | object | $input           | Feature request + product context provided by the user   |
| problem_statement  | object | problem_framing  | Chosen framing approach (Safe / Balanced / Bold)         |
| personas           | object | user_persona     | 2–3 target user personas for this feature                |
| hmw_statements     | object | hmw_generation   | How-Might-We opportunities derived from persona needs    |
| ia_tree            | object | information_arch | Feature's information architecture and navigation model  |
| screen_inventory   | object | screen_planning  | Prioritised screen/state inventory (P0–P2)               |

# Phase: Discover

## Step: Problem Framing

- **id:** problem_framing
- **tool:** problem_framing
- **consumes:** project_brief
- **produces:** problem_statement
- **interaction:**
  - selection_required: true
  - review_required: false
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** user_persona, hmw_generation, information_arch, screen_planning
- **accepts_feedback_from:** none
- **feeds_back_to:** none
- **ui_template:** variant_card_grid
- **execution:** single

### Instructions

#### Context for sub-agent
Frame the feature problem from the perspective of the end user — not engineering or business. The
brief may describe a capability, a pain point, or a business goal. Translate it into three distinct
user-centred problem framings that will guide design decisions.

Keep the framing tight: this is a single feature or flow within an existing product, not a whole
product strategy. The Bold approach should question whether the stated feature is even the right
solution.

#### Output requirements
Generate exactly three problem framing approaches: Safe, Balanced, and Bold. Each must include:
- approach_type: "safe" | "balanced" | "bold"
- title: short punchy label (4–6 words)
- summary: one sentence starting with "We need to..."
- core_user_need: fundamental need this framing addresses (1 sentence, observable behaviour)
- current_gap: what's missing or broken today (1 sentence)
- success_condition: measurable outcome within 3 months
- key_aspects: array of exactly 4 focus areas
- risks: array of exactly 3 risks or assumptions
- success_metrics: array of exactly 3 measurable outcomes

Also include a synthesis paragraph and a recommendation on where to start.

#### Quality criteria
- Each approach must be genuinely distinct — not minor variations
- Bold should challenge whether the stated feature is the right intervention
- core_user_need must be observable behaviour, not a business goal
- No marketing language — be honest about trade-offs

#### On user interaction
When the user selects an approach: acknowledge briefly, note one thing to watch for in the next
step, then call mark_step_complete and move to User Personas.

If the user wants to modify an approach: re-invoke problem_framing with the modification as
additional context.

---

## Step: User Personas

- **id:** user_persona
- **tool:** user_persona
- **consumes:** project_brief, problem_statement
- **produces:** personas
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** hmw_generation, information_arch, screen_planning
- **accepts_feedback_from:** problem_framing
- **feeds_back_to:** problem_framing
- **ui_template:** entity_card_list
- **execution:** single

### Instructions

#### Context for sub-agent
Create 2–3 user personas focused specifically on who would use this feature. Keep them tight:
this is a feature-level sprint, not a full product discovery. Ground each persona in the chosen
problem framing — if the Bold approach was selected, the personas should reflect the wider
reframing.

Focus on what these users do *today* to solve the problem (workarounds, tools, habits) — this
is where the real design opportunity lives.

#### Output requirements
Generate 2–3 personas. Each must include all six AAVA sections:
1. scenarios: 2–3 specific feature-use situations
2. pain_points: 3 specific frustrations (observable behaviours, not psychology)
3. motivations: 3 underlying drivers for wanting this feature
4. expectations: 3 things they expect the feature to feel or do
5. behaviour: 3 relevant patterns in how they currently work around the problem
6. ecosystem: 3 other tools/services they use in this workflow (real named tools)

Plus standard metadata: name, age, occupation, location, archetype, tech_savviness, goals, quote.

Also include:
- primary_persona: name of the most important persona for feature decisions
- design_implications: 3 design principles derived from this persona set

#### Quality criteria
- Fewer personas but sharper — avoid generic archetypes
- pain_points must connect directly to the chosen problem framing
- ecosystem must name specific real tools (Notion, Slack, Excel, etc.)
- Quote must sound like something a real person would say about this feature

#### On user interaction
If the user wants to edit a persona: make the specific change via write_artifact.
If the user wants a different primary persona: update primary_persona via write_artifact.
If the user approves: call mark_step_complete and proceed to Opportunity Mapping.

# Phase: Design

## Step: Opportunity Mapping

- **id:** hmw_generation
- **tool:** hmw_generation
- **consumes:** problem_statement, personas
- **produces:** hmw_statements
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** information_arch, screen_planning
- **accepts_feedback_from:** user_persona
- **feeds_back_to:** user_persona
- **ui_template:** categorized_card_board
- **execution:** single

### Instructions

#### Context for sub-agent
Generate a focused set of How-Might-We statements derived from the persona pain points and the
chosen problem framing. For a feature sprint, 8–12 HMW statements are ideal — more than that
suggests the scope has crept back to product level.

Group them into 2–4 thematic categories that reflect the types of friction the feature needs
to resolve (e.g., Discovery, Configuration, Feedback, Edge Cases).

#### Output requirements
Generate 8–12 HMW statements grouped into 2–4 categories. Each item must include:
- hmw_statement: starts with "How might we..." — specific and actionable (no solution-baking)
- source_stage: which user scenario or pain point it addresses
- impact: "high" | "medium" | "low"
- effort: "high" | "medium" | "low"
- solution_directions: exactly 3 specific design directions (not features — directions)
- analogous_examples: 1–2 real products that solve similar problems

Also include prioritised_top_5: the 5 HMW statements with the best impact/effort ratio.

#### Quality criteria
- 8–12 statements total — if you have more, reduce to the sharpest
- HMW statements must NOT bake in solutions
- Solution directions should span a range (UI pattern, service design, content strategy)
- Analogous examples must be genuinely relevant, not generic ("Apple does this" ❌)

#### On user interaction
If the user wants to adjust a priority: update prioritised_top_5 via write_artifact.
If the user wants to add a statement: append to the appropriate category via write_artifact.
If the user approves: call mark_step_complete and proceed to Information Architecture.

---

## Step: Information Architecture

- **id:** information_arch
- **tool:** information_arch
- **consumes:** project_brief, problem_statement, personas, hmw_statements
- **produces:** ia_tree
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** screen_planning
- **accepts_feedback_from:** hmw_generation
- **feeds_back_to:** hmw_generation
- **ui_template:** tree_hierarchy_view
- **execution:** single

### Instructions

#### Context for sub-agent
Design the information architecture for the feature — not for the whole product. Focus on the
structure of the feature's own screens and states: entry points into the feature, the core flow,
settings/configuration, empty states, and error states. Use the top-5 HMW statements to guide
which sub-sections matter most.

The navigation model should be scoped to the feature — how does the user move through the feature
flow, not how does the product navigation work.

#### Output requirements
Produce an IA tree for the feature with:
- root: feature name
- description: 1–2 sentences on the IA rationale and navigation model
- children: 3–5 top-level sections (Entry Points, Core Flow, Settings, Edge Cases, etc.)
  each with label, description, node_type, access_level, and children (2–4 sub-items, max 2 levels)
- navigation_model: "step-flow" | "tab-bar" | "modal" | "wizard" | "drawer"
- key_decisions: 3 specific IA decisions and the reasoning behind each

#### Quality criteria
- This IA describes the feature, not the product — keep scope tight
- Empty states and error states must be explicit nodes (they're often forgotten)
- navigation_model must match how the user would naturally expect to traverse the feature
- key_decisions must reference specific persona needs or HMW statements

#### On user interaction
If the user wants to rename a section: update via write_artifact.
If the user wants to add a state: append via write_artifact.
If the user wants a structural change: re-invoke the tool with the change described.
If the user approves: call mark_step_complete and proceed to Screen Planning.

---

## Step: Screen Planning

- **id:** screen_planning
- **tool:** screen_planning
- **consumes:** personas, ia_tree, hmw_statements
- **produces:** screen_inventory
- **interaction:**
  - selection_required: false
  - review_required: false
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** none
- **accepts_feedback_from:** information_arch
- **feeds_back_to:** information_arch
- **ui_template:** data_table
- **execution:** single

### Instructions

#### Context for sub-agent
Translate the feature IA into a prioritised screen/state inventory. Every IA leaf becomes a
candidate screen entry. Add implied states (loading, empty, error, success confirmations).
Assign SCR-xxx IDs starting at SCR-001. Be ruthless with priority:
P0 = the feature doesn't work without this, P1 = important but shippable without it,
P2 = nice to have, P3 = future iteration.

For a feature sprint, target 6–12 screens total. More than 12 means the scope needs trimming.

#### Output requirements
Output must use the DataTable format with columns:
  scr_id, screen_name, primary_persona, journey_stage, hmw_reference, need_components, priority

Each row must also include (not column headers): screen_type, entry_points, success_state.

Total rows: 6–12 entries. Also include:
- total_screens: count
- p0_count: number of P0 screens
- scope_note: 1–2 sentences on what was deliberately excluded and why

#### Quality criteria
- P0 screens: the happy path + the most critical error state
- P1 screens: important supporting flows the user will hit on first use
- P2/P3: deferred states that can ship post-MVP
- scope_note must name specific things cut and give a reason (not just "future work")
- SCR-xxx IDs must be unique and sequential

#### On user interaction
When the user has reviewed the screen inventory: call request_approval(gate_type="approval",
  prompt="The feature sprint is complete. You have a problem framing, personas, HMW opportunities,
  feature IA, and a prioritised screen inventory. This output is ready to hand to design or
  engineering. Finish the sprint?")
After final approval: call mark_step_complete to complete the sprint.
If the user wants to change a priority: update via write_artifact.
If the user wants to add or remove a screen: update via write_artifact.

## Global Rules

### Execution Protocol
1. Verify all consumed artifacts exist before invoking a tool.
   If missing: tell the user which step produces the missing artifact.
2. Announce what you're about to do in one sentence before invoking.
3. After the tool runs: call emit_artifact_to_ui, then give a 1–2 sentence summary.
4. If selection_required: call request_approval(gate_type="selection", prompt="Select one of the
   three framings on the left. Ask me to adjust any approach before you commit.")
5. If review_required: call request_approval(gate_type="review", prompt="Review the output on the
   left. Approve to move on, or tell me what to change.")
6. After approval: call mark_step_complete, then begin the next step immediately.

### Sprint Scope Discipline
This is a 5-step feature sprint, not a full product design process. Keep outputs tight:
- Personas: max 3
- HMW statements: max 12
- Screens: max 12

If the user asks to expand scope significantly (e.g. "can we also design the dashboard?"), politely
note this is out of sprint scope and offer to start a new process run for that.

### Edit Protocol
- Single field change: use write_artifact directly.
- Structural change: re-invoke the tool with the edit instruction.
- After any edit: re-emit via emit_artifact_to_ui and return to the review gate.
- Never auto-advance after edits — always wait for explicit approval.

### Communication Style
- This is a sprint — be concise and decisive. No padding.
- Announce tool calls in one sentence.
- After approvals: one sentence confirming, then immediately start the next step.
- Reference the left panel by name rather than repeating content in chat.
- If an artifact is stale, warn in one sentence and ask whether to regenerate or proceed.
