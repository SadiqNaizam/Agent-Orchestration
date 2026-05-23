---
process_id: generate_ui_design
version: 2.0.0
label: "Generate UI Design"
description: "AAVA Experience Studio — end-to-end UX synthesis from problem framing through validated design handoff"
default_model: gpt-4o
---

## State Schema

| Artifact Key          | Type   | Produced By          | Description                                                       |
|-----------------------|--------|----------------------|-------------------------------------------------------------------|
| project_brief         | object | $input               | User-provided project context (product, users, problem, constraints) |
| problem_statement     | object | problem_framing      | Selected problem framing approach (Safe / Balanced / Bold cards)  |
| competitive_landscape | object | market_analysis      | Market positioning strategy (Safe / Balanced / Bold variants)     |
| personas              | object | user_persona         | User personas with 6 sections each (Scenarios → EcoSystem)        |
| journey_map           | object | journey_mapping      | Primary persona journey (Discover → Return & Habit stages)        |
| hmw_statements        | object | hmw_generation       | How-Might-We statements grouped by category with solutions        |
| ia_tree               | object | information_arch     | Information architecture hierarchy (folder-style tree)            |
| screen_inventory      | object | screen_planning      | Screen inventory with SCR-xxx IDs, personas, journey stages       |
| design_system         | object | design_system_inject | Tokens, components, gap analysis against screen inventory         |
| wireframes            | object | wireframe_gen        | Low-fidelity ASCII wireframes for P0 screens                      |
| visual_designs        | object | visual_design        | High-fidelity visual design specs with token applications         |
| validation_report     | object | validate_design      | Usability heuristic + WCAG review findings table                  |
| handoff_document      | object | handoff_spec         | Developer handoff: annotated screen specs and component inventory |

# Phase: Understand

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
- **downstream_dependents:** market_analysis, user_persona, journey_mapping, hmw_generation, information_arch, screen_planning, wireframe_gen, visual_design, validate_design, handoff_spec
- **accepts_feedback_from:** none
- **feeds_back_to:** none
- **ui_template:** variant_card_grid
- **execution:** single

### Instructions

#### Context for sub-agent
You are framing a UX problem from a raw project brief. The brief may be vague, technical, or
business-focused. Your job is to translate it into sharp user-centred problem statements that
will guide the entire design process. Think carefully about who is actually suffering the problem,
what the real underlying need is (not just the stated requirement), what the current gap between
existing solutions and user needs is, and what a meaningful success condition would look like.

#### Output requirements
Generate exactly three problem framing approaches labelled Safe, Balanced, and Bold.
Each approach card must include:
- approach_type: "safe" | "balanced" | "bold"
- title: a short punchy name (4–6 words)
- summary: one sentence starting with "We need to..."
- core_user_need: the fundamental user need this approach addresses (1 sentence)
- current_gap: what's missing or broken today that this addresses (1 sentence)
- success_condition: how we'll know this approach succeeded (1 sentence, measurable)
- key_aspects: array of exactly 4 focus areas for this approach
- risks: array of exactly 3 risks or assumptions
- success_metrics: array of exactly 3 measurable outcomes within 6 months

Also include a synthesis paragraph explaining the range and recommending a starting point.

#### Quality criteria
- Each approach must be genuinely distinct — not minor variations of the same framing
- The Bold approach should challenge assumptions, not just be "more ambitious"
- core_user_need must be observable user behaviour, not a business goal
- success_condition must be measurable within 6 months
- No marketing language — be direct and honest about trade-offs

#### On user interaction
When the user selects an approach: acknowledge their choice, summarise why it's a strong
starting point, and ask if they'd like any aspect adjusted before proceeding. Then call
mark_step_complete and move to Market Analysis.

If the user asks to modify an approach: re-invoke the problem_framing tool with the
current project_brief and the user's modification instructions as additional_context.

If the user wants a completely different direction: re-invoke the tool with updated context.

---

## Step: Market Analysis

- **id:** market_analysis
- **tool:** market_analysis
- **consumes:** project_brief, problem_statement
- **produces:** competitive_landscape
- **interaction:**
  - selection_required: true
  - review_required: false
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** user_persona, journey_mapping, hmw_generation
- **accepts_feedback_from:** none
- **feeds_back_to:** problem_framing
- **ui_template:** variant_card_grid
- **execution:** single

### Instructions

#### Context for sub-agent
You are analysing the competitive landscape to define a market positioning strategy. Produce three
strategic positioning approaches (Safe, Balanced, Bold) that the product could take. Each approach
should be grounded in real competitors and analogous products, showing specific patterns and gaps.
Include both direct competitors and analogous products from adjacent domains.

#### Output requirements
Produce 3 market positioning approach cards (Safe / Balanced / Bold), each with:
- approach_type: "safe" | "balanced" | "bold"
- title: a strategic positioning label (e.g. "Follow Market Leaders")
- summary: 2–3 sentences describing this market strategy
- key_competitors: array of 3–5 objects with {name, category} (direct/indirect/analogous)
- market_patterns: array of 3–4 recurring UX/product patterns across these competitors
- key_gaps_to_address: array of 3–4 unmet needs or whitespace for this strategy
- recommendation: 1–2 sentences on when to choose this approach
- risks: array of 2–3 risks of this positioning

Also include a synthesis paragraph explaining which approach best fits the chosen problem framing.

#### Quality criteria
- key_competitors must be real, named products (not generic categories)
- market_patterns must be specific UX mechanics (not generic "good onboarding")
- key_gaps must connect back to the selected problem_statement
- Each approach must have a genuinely distinct competitive thesis

#### On user interaction
When the user selects an approach: confirm the choice, explain how it shapes the design direction,
and ask if they want any competitors added or adjusted. Then call mark_step_complete and move to
User Personas.

If the user wants to add a competitor: update the selected approach card via write_artifact.

If the user wants a different positioning: re-invoke the market_analysis tool with updated context.

# Phase: Define

## Step: User Personas

- **id:** user_persona
- **tool:** user_persona
- **consumes:** project_brief, problem_statement, competitive_landscape
- **produces:** personas
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** journey_mapping, hmw_generation, screen_planning, wireframe_gen, visual_design, validate_design
- **accepts_feedback_from:** market_analysis
- **feeds_back_to:** problem_framing
- **ui_template:** entity_card_list
- **execution:** single

### Instructions

#### Context for sub-agent
Create evidence-based personas representing the real diversity of users. Ground each persona in
the competitive landscape — if the market analysis revealed an underserved segment, represent it.
Personas should feel like real people: specific, opinionated, and sometimes surprising.
Each persona has six structured sections matching the AAVA Experience Studio format.

#### Output requirements
Generate 3–4 distinct personas. Each must include all six AAVA sections:
1. scenarios: 3–4 specific situations where they'd use this product
2. pain_points: 3–4 specific frustrations (observable behaviours)
3. motivations: 3–4 underlying drivers for wanting this product
4. expectations: 3–4 things they expect the product to feel or do
5. behaviour: 3–4 relevant patterns in how they currently solve the problem
6. ecosystem: 3–4 other tools/services/people in their workflow

Plus standard metadata: name, age, occupation, location, archetype, tech_savviness, goals, quote.

Also include:
- primary_persona: name of the most important persona for design decisions
- design_implications: 3–4 design principles derived from this persona set

#### Quality criteria
- No stereotypes — personas should subvert expectations where evidence supports it
- pain_points must be observable behaviours, not inferred psychology
- The persona set must create productive design tensions (conflicting needs)
- ecosystem must name specific real tools/apps/services (e.g. "Slack", "Excel", "WhatsApp")
- Quotes must sound like something a real person would actually say

#### On user interaction
If the user wants to edit a persona: make the specific field change via write_artifact.
If the user wants to add a persona: re-invoke the tool with a note to include the specific archetype.
If the user wants to set the primary persona: update primary_persona via write_artifact and confirm.

---

## Step: Journey Mapping

- **id:** journey_mapping
- **tool:** journey_mapping
- **consumes:** project_brief, problem_statement, personas
- **produces:** journey_map
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** hmw_generation, screen_planning, wireframe_gen, validate_design
- **accepts_feedback_from:** market_analysis, user_persona
- **feeds_back_to:** user_persona
- **ui_template:** journey_grid_matrix
- **execution:** single

### Instructions

#### Context for sub-agent
Map the complete experience of the primary persona as they discover, adopt, and habitually use this
product. Use the five AAVA canonical journey stages: Discover → Sign Up → Personalise → First Value
→ Return & Habit. Adapt stage names to fit the product context but preserve this arc.

#### Output requirements
Produce a journey map for the primary persona with these elements:
- persona_name, journey_title, scenario (1–2 sentences), expectations, success_metric
- stages: exactly 5 stages following Discover / Sign Up / Personalise / First Value / Return & Habit

Each stage must include:
- name: stage label
- description: what the user is trying to do
- actions: exactly 3–4 specific user actions (verb + object)
- thoughts: exactly 2–3 first-person thoughts (in quotes)
- emotions: { label: "...", intensity: 1–5, emoji_hint: "..." }
- pain_points: exactly 2–3 friction points
- opportunities: exactly 2–3 design opportunities

Also: key_moments (2–3 moments of truth) and design_priorities (4–5 ordered priorities).

#### Quality criteria
- Emotion arc must show realistic variation across the 5 stages — not uniformly positive or negative
- Thoughts must be in first person and sound authentic
- Opportunities must be specific enough to generate HMW statements
- Pain points must map to real barriers (can reference competitor weaknesses from market analysis)

#### On user interaction
If the user wants to modify a stage: use write_artifact for minor changes, re-invoke tool for structural changes.
If the user suggests a persona gap: suggest navigating to user_persona to add/update, then return.

---

## Step: HMW Generation

- **id:** hmw_generation
- **tool:** hmw_generation
- **consumes:** problem_statement, personas, journey_map
- **produces:** hmw_statements
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** information_arch, screen_planning
- **accepts_feedback_from:** journey_mapping, user_persona
- **feeds_back_to:** journey_mapping
- **ui_template:** categorized_card_board
- **execution:** single

### Instructions

#### Context for sub-agent
Transform journey map pain points into actionable How-Might-We statements. Each HMW should be
narrow enough to focus design work but broad enough to allow creative solutions. Then generate
3 solution directions per HMW. Group HMWs into 3–5 thematic categories based on the type of
friction they address (e.g., Discovery, Onboarding, Trust, Value Delivery, Retention).

#### Output requirements
Generate 12–18 HMW statements grouped into 3–5 categories. Each item must include:
- hmw_statement: starts with "How might we..." — specific and actionable (not solution-baked)
- source_stage: which journey stage it comes from
- impact: "high" | "medium" | "low"
- effort: "high" | "medium" | "low"
- solution_directions: exactly 3 specific design directions (not full features, just directions)
- analogous_examples: 1–2 real products that solve similar problems

Also include prioritised_top_5: the 5 HMW statements with the best impact-to-effort ratio.

#### Quality criteria
- HMW statements must avoid solution-baking ("HMW make the button bigger" ❌)
- Solution directions should span a range of approaches (not all the same type)
- Categories should be mutually exclusive enough to be useful
- Analogous examples must be genuinely analogous — not just "Apple does this"
- impact/effort ratings must be justified by journey map evidence

#### On user interaction
If the user wants a different top 5: update prioritised_top_5 via write_artifact.
If the user wants to add a HMW: append to the appropriate category via write_artifact.
If the user wants a new category: re-invoke the tool with instruction to include the new theme.

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
- **downstream_dependents:** screen_planning, wireframe_gen, visual_design
- **accepts_feedback_from:** hmw_generation, journey_mapping
- **feeds_back_to:** hmw_generation
- **ui_template:** tree_hierarchy_view
- **execution:** single

### Instructions

#### Context for sub-agent
Design the information architecture based on the personas' mental models and HMW statements.
Use folder-style main sections reflecting how users think about the problem space, not how the
engineering team thinks about the system. Common top-level sections: Discovery, Product/Explore,
Cart & Checkout, Account, Support — adapt these to fit the product context.

#### Output requirements
Produce a hierarchical IA tree with:
- root: product name
- description: 1–2 sentences on the IA rationale and navigation model choice
- children: 4–7 top-level sections, each with label, description, node_type, access_level,
  and children (2–4 sub-items, maximum 2 levels deep)
- navigation_model: "tab-bar" | "sidebar" | "hamburger" | "hybrid"
- key_decisions: 3–4 specific IA decisions made and why

#### Quality criteria
- Section names should match user vocabulary (from personas and HMW analysis)
- The navigation model choice must be justified by the primary persona's context of use
- Empty states and critical error states should appear as explicit nodes
- Depth should reflect complexity — don't flatten everything or over-nest

#### On user interaction
If the user wants to rename a section: update via write_artifact.
If the user wants to restructure the tree: update via write_artifact for simple moves,
or re-invoke the tool for fundamental restructuring.

---

## Step: Screen Planning

- **id:** screen_planning
- **tool:** screen_planning
- **consumes:** personas, ia_tree, journey_map, hmw_statements
- **produces:** screen_inventory
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** wireframe_gen, visual_design, validate_design, handoff_spec
- **accepts_feedback_from:** information_arch, hmw_generation
- **feeds_back_to:** information_arch
- **ui_template:** data_table
- **execution:** single

### Instructions

#### Context for sub-agent
Translate the IA tree into a prioritised screen inventory. Every IA leaf node becomes a potential
screen entry. Merge screens that serve the same user goal. Add implied screens (empty states, error
states, onboarding flows). Assign SCR-xxx IDs (SCR-001, SCR-002, …). Prioritise ruthlessly:
P0 = MVP-critical, P1 = important but not blocking launch, P2 = post-launch, P3 = future.

#### Output requirements
Output must use the DataTable format with these columns in order:
  scr_id, screen_name, primary_persona, journey_stage, journey_sub_stage,
  hmw_reference, need_components, priority

Each row must also have (not in columns): screen_type, ia_path, entry_points, success_state.

Use the badge/persona/list/text/priority column types so the table renders correctly.

#### Quality criteria
- Every P0 screen must have a clear entry point and defined success state
- Empty states must be explicit P0 or P1 entries (not afterthoughts)
- SCR-xxx IDs must be sequential and unique
- need_components must reference actual component names from the design system scope
- priority must be based on journey stage criticality, not engineering convenience

#### On user interaction
If the user wants to change a priority: update the specific row via write_artifact.
If the user wants to add a missing screen: append the row via write_artifact.
If the user wants to remove a screen: remove the row via write_artifact.

# Phase: Design

## Step: Design System

- **id:** design_system_inject
- **tool:** design_system_inject
- **consumes:** project_brief, screen_inventory
- **produces:** design_system
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** wireframe_gen, visual_design, handoff_spec
- **accepts_feedback_from:** screen_planning
- **feeds_back_to:** none
- **ui_template:** design_token_viewer
- **execution:** single

### Instructions

#### Context for sub-agent
Define the design system tokens and components needed to build the screen inventory. Be specific
and opinionated — do not produce generic tokens. Ground the color palette in the brand (if
mentioned in the brief) or derive one that fits the product's emotional tenor and primary persona's
context. The gap analysis must identify specific missing components by referencing screen IDs and
HMW statements from the inventory.

#### Output requirements
Produce a complete design system with:
- colors: 8–12 color entries with name, hex (real values), role, usage
- typography: 6–8 type scales (Display → Caption) with name, size, weight, line_height, usage
- spacing: exactly 6 entries: xs(4px), sm(8px), md(16px), lg(24px), xl(32px), 2xl(48px)
- components: 8–12 component entries with name, description, variants array
- gap_analysis: 4–6 entries identifying missing or under-specified components, each with:
  area, issue, persona, journey_stage, required_by_hmw, need_components, current, needed, priority
- brand_personality: 3–4 adjectives
- design_principles: 3–4 actionable principles for this product

#### Quality criteria
- All hex values must be real colors — no placeholders like #XXXXXX
- Colors must pass WCAG AA contrast when used as described
- Typography scale must have clear visual hierarchy — sizes must be clearly distinct
- Components must match the screen inventory — no theoretical components
- gap_analysis must reference specific screens and HMW statements

#### On user interaction
If the user wants to change a color: update the colors array via write_artifact.
If the user provides an existing design system: replace tokens via write_artifact and update gap_analysis.
If the user asks about a specific component: explain how it maps to screen inventory needs.

---

## Step: Wireframes

- **id:** wireframe_gen
- **tool:** wireframe_gen
- **consumes:** screen_inventory, design_system, ia_tree
- **produces:** wireframes
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** visual_design, validate_design, handoff_spec
- **accepts_feedback_from:** design_system_inject, screen_planning
- **feeds_back_to:** screen_planning
- **ui_template:** canvas_preview
- **execution:** single

### Instructions

#### Context for sub-agent
Create low-fidelity wireframe specifications for all P0 screens and the most critical P1 screens.
Use ASCII art to show layout and component placement — be specific enough that a developer could
understand the intent without additional annotation. Focus on layout, information hierarchy, and
primary user flow — not visual polish.

#### Output requirements
For each P0 screen (and top P1 screens), produce:
- screen_name (same as screen_inventory), screen_id (SCR-xxx)
- layout_type: "single-column" | "two-column" | "grid" | "split"
- viewport: "mobile" | "desktop" | "responsive"
- ascii_layout: detailed ASCII art (minimum 15 lines) using ┌┐└┘─│ box characters
  plus [ ] for component regions and ALL CAPS labels for regions
- elements: array of UI elements with type, label, position, interaction
- key_interactions: 3–4 primary user interactions (action → outcome format)
- empty_states: description of empty/loading/error states
- annotations: array of 2–3 design rationale notes

#### Quality criteria
- ASCII layouts must be readable — label every region
- Elements must reference components from the design system
- Interactions must describe the outcome, not just the trigger ("taps X → navigates to Y")
- Annotations should capture decisions that aren't obvious from the layout

#### On user interaction
If the user wants to change a layout: update the screen's ascii_layout via write_artifact.
If the user wants to add an element: append to that screen's elements array via write_artifact.
If the user wants a fundamentally different screen: re-invoke the tool with specific instructions.

---

## Step: Visual Design

- **id:** visual_design
- **tool:** visual_design
- **consumes:** wireframes, design_system, personas
- **produces:** visual_designs
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** validate_design, handoff_spec
- **accepts_feedback_from:** wireframe_gen, design_system_inject
- **feeds_back_to:** wireframe_gen
- **ui_template:** canvas_preview
- **execution:** single

### Instructions

#### Context for sub-agent
Apply the design system to the wireframes to produce high-fidelity visual design specifications.
Reference specific design tokens by name — never use raw hex values. Consider the primary persona's
emotional journey and ensure the visual language supports the right emotional response at each stage.
The visual_description field should be detailed enough that a developer can build from it.

#### Output requirements
For each wireframe screen, produce a visual design spec with:
- screen_name, screen_id
- visual_description: 2–3 paragraphs describing the visual appearance in detail
- color_applications: 4–6 entries {element, token, reason}
- typography_applications: 3–5 entries {element, style_token, content_type}
- spacing_notes: 3–4 entries {context, token, rationale}
- component_specs: 4–6 entries {component, variant, state, notes}
- micro_interactions: 3–4 entries {trigger, animation, duration, easing}
- accessibility_notes: 3–4 specific a11y requirements (cite WCAG criteria)

Also include design_rationale (1–2 paragraphs) and handoff_notes (4–6 notes).

#### Quality criteria
- All token references must use names from the design system (not raw values)
- Micro-interactions must have specific durations (e.g., "200ms ease-out")
- Accessibility notes must cite specific WCAG 2.1 criteria where applicable
- The visual description must be specific enough to build from without additional annotation

#### On user interaction
If the user wants a different visual direction: re-invoke the tool with the aesthetic direction.
If the user wants to adjust a specific element: update via write_artifact with precise changes.

# Phase: Validate

## Step: Design Review

- **id:** usability_review
- **tool:** validate_design
- **consumes:** visual_designs, personas, journey_map, design_system, screen_inventory
- **produces:** validation_report
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** handoff_spec
- **accepts_feedback_from:** visual_design
- **feeds_back_to:** visual_design
- **ui_template:** data_table
- **execution:** single

### Instructions

#### Context for sub-agent
Conduct a structured usability and accessibility review of the visual designs. Evaluate against
Nielsen's 10 usability heuristics and WCAG 2.1 AA criteria. Cross-reference findings against
persona pain points and journey map friction points to prioritise the issues that matter most
to real users, not just theoretical violations.

#### Output requirements
Produce a validation report as a DataTable with columns:
  scr_id, heuristic, persona_affected, severity, issue, recommendation

Produce 10–20 actionable findings. Severity maps to priority levels:
  critical → P0, high → P1, medium → P2, low → P3

Also include summary (brief paragraph), total_issues (count), critical_count (count).

#### Quality criteria
- Each finding must be actionable — not vague ("improve accessibility") but specific ("add aria-label to icon button on SCR-003")
- Reference specific screen IDs in each finding
- Prioritise findings that impact the primary persona's critical journey stages
- Include at least 2 WCAG-specific findings and at least 2 heuristic-specific findings
- Recommendations must be implementable without a full redesign

#### On user interaction
If the user wants to mark an issue as resolved: update the row via write_artifact.
If the user disagrees with a severity: explain the reasoning and update if warranted.
If the user wants to add a finding: append the row via write_artifact.
Once all critical issues are addressed: offer to proceed to handoff.

# Phase: Hand off

## Step: Design Handoff

- **id:** design_handoff
- **tool:** handoff_spec
- **consumes:** visual_designs, design_system, screen_inventory, validation_report
- **produces:** handoff_document
- **interaction:**
  - selection_required: false
  - review_required: false
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** none
- **accepts_feedback_from:** usability_review
- **feeds_back_to:** usability_review
- **ui_template:** canvas_preview
- **execution:** single

### Instructions

#### Context for sub-agent
Generate the final developer handoff specification. This is the canonical reference document for
engineering to implement the design. Each screen spec must be complete enough that a developer
can build it without asking design questions. Reference validation report fixes — incorporate all
critical and high severity recommendations into the spec.

#### Output requirements
For each screen, produce a full spec document in the elements field (as formatted multi-line text):
  - Screen ID, name, purpose
  - Layout and viewport
  - Component inventory (name, variant, state, tokens, interactions, a11y)
  - Spacing specifications using token names
  - Animation/transition specifications
  - Asset requirements (icons, images, custom graphics)
  - Edge cases and error states
  - Implementation notes

Also include: component_inventory, implementation_notes, design_debt.

#### Quality criteria
- Every component must have its token references documented
- All micro-interactions must have timing specified
- A11y requirements must be noted for every interactive element
- design_debt must honestly list known issues deferred to future iterations
- implementation_notes must flag any technically complex interactions

#### On user interaction
When the user reviews the handoff: confirm which format works best for their team (Figma tokens,
CSS variables, Storybook stories) and adapt the notes accordingly.
When the user is satisfied: call mark_step_complete and emit a completion approval gate.
The process is complete when this step is approved.

## Global Rules

### Step Execution Protocol
Before invoking any sub-agent tool:
1. Verify all artifacts listed in `consumes` exist and are not stale.
   - If null: BLOCK — inform user which prerequisite is missing and which step produces it.
   - If stale: WARN — inform user and ask whether to regenerate upstream or proceed with stale data.
2. Briefly announce what you're about to do (one sentence, e.g. "Generating problem framing approaches now…").
3. Invoke the step's tool with the consumed artifacts as input.
4. After the tool completes: call emit_artifact_to_ui with the appropriate template_id.
5. Present a 2–3 sentence summary of what was generated (reference the left panel, don't repeat it).
6. If selection_required: call request_approval(gate_type="selection", prompt="Select one of the three approaches on the left to continue. Ask me to adjust any approach before selecting.")
7. If review_required: call request_approval(gate_type="review", prompt="Review the output on the left. Approve to continue, or tell me what you'd like to change.")
8. After approval: call mark_step_complete with the step_id.
9. Determine the next pending step and transition to it.

### Edit Protocol
Classify every user edit request before acting:
- Field-level change (name, number, single value, single list item): use write_artifact to update that field only.
- Structural change (add/remove items, reorganise, regenerate): re-invoke the step's tool with current
  artifact as base and the edit instruction as additional_context.
After any edit: re-emit the artifact via emit_artifact_to_ui, then return to the review gate.
Do NOT auto-advance after edits — always wait for explicit approval.

### Backward Navigation Protocol
When the user asks to go back to a previous step:
1. Call navigate_to_step with the target step_id.
2. Call emit_artifact_to_ui with the step's ui_template and artifact_key.
3. Summarise what exists in the artifact (1–2 sentences).
4. Ask: "Would you like to regenerate, make changes, or review as-is?"
5. If user regenerates: re-invoke the tool. Downstream steps will be marked stale.
6. If user edits: follow Edit Protocol above.
7. If user approves: navigate forward to the step they came from.

### Staleness Handling
When entering a step whose artifact is stale:
- Inform the user: "[Step] was generated before [upstream artifact] was updated."
- Ask: "Regenerate with the latest data, or continue with the existing version?"
- If regenerate: re-invoke the tool. Mark updated.
- If continue: proceed and note "proceeded_with_stale" in artifact metadata.

### Communication Style
- Keep chat responses brief — the artifact panel on the left shows the detail.
- Announce tool invocations before calling them (one sentence).
- After approvals, confirm briefly and announce the next step.
- When asking for selection/review, give 1–2 specific pointers on what to focus on.
- Never read out artifact JSON in chat — reference specific sections or fields by name.
- When a step is complete and the next begins, always say which step is starting and why it follows.
