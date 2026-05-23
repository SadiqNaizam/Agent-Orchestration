---
process_id: generate_ui_design
version: 1.0.0
label: "Generate UI Design"
description: "End-to-end UX synthesis from problem framing through visual design handoff"
default_model: gpt-4o
---

## State Schema

| Artifact Key          | Type   | Produced By         | Description                                      |
|-----------------------|--------|---------------------|--------------------------------------------------|
| project_brief         | object | $input              | User-provided project context                    |
| problem_statement     | object | problem_framing     | Selected problem framing approach                |
| competitive_landscape | object | market_analysis     | Market research with competitor data             |
| personas              | object | user_persona        | Generated user personas                          |
| journey_map           | object | journey_mapping     | Per-persona journey maps                         |
| hmw_statements        | object | hmw_generation      | How-Might-We statements with solutions           |
| ia_tree               | object | information_arch    | Information architecture hierarchy               |
| screen_inventory      | object | screen_planning     | Screen-level specifications                      |
| design_system         | object | design_system_inject| Tokens, components, gap analysis                 |
| wireframes            | object | wireframe_gen       | Low-fidelity wireframe outputs                   |
| visual_designs        | object | visual_design       | High-fidelity visual design outputs              |

# Phase: Understand

## Step: Problem Framing

- **id:** problem_framing
- **tool:** problem_framing
- **consumes:** project_brief
- **produces:** problem_statement
- **interaction:**
  - selection_required: true
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** market_analysis, user_persona, journey_mapping, hmw_generation, information_arch, screen_planning, wireframe_gen, visual_design
- **accepts_feedback_from:** none
- **feeds_back_to:** none
- **ui_template:** variant_card_grid
- **execution:** single

### Instructions

#### Context for sub-agent
You are framing a UX problem from a raw project brief. The brief may be vague, technical, or
business-focused. Your job is to translate it into sharp user-centred problem statements that
will guide the entire design process. Think about who is actually suffering the problem, what
the real underlying need is (not just the stated requirement), and what constraints matter.

#### Output requirements
Generate exactly three problem framing approaches labelled Safe, Balanced, and Bold.
Each approach must include:
- approach_type: "safe" | "balanced" | "bold"
- title: a short punchy name (4–6 words)
- core_statement: exactly one sentence starting with "We need to"
- rationale: 2–3 sentences explaining the strategic logic
- key_aspects: array of exactly 4 bullet points
- risks: array of exactly 3 risks
- success_metrics: array of exactly 3 measurable outcomes

Also include a synthesis paragraph explaining the range and recommending a starting point.

#### Quality criteria
- Each approach must be genuinely distinct — not minor variations of the same framing
- The Bold approach should challenge assumptions, not just be "more ambitious"
- Core statements must be specific enough to reject wrong solutions
- Success metrics must be measurable within 6 months
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
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** user_persona, journey_mapping, hmw_generation
- **accepts_feedback_from:** none
- **feeds_back_to:** problem_framing
- **ui_template:** variant_card_grid
- **execution:** single

### Instructions

#### Context for sub-agent
You are conducting a competitive landscape analysis to inform UX strategy. Use the problem
statement to focus your analysis — you're not cataloguing every player in the market, but
specifically examining how existing solutions address (or fail to address) the framed problem.
Include both direct competitors and analogous products from adjacent domains.

#### Output requirements
Produce 4–7 competitor/analogous solution profiles. Each must include:
- name, category (direct/indirect/analogous), market_position
- strengths (3–4 items), weaknesses (2–3 items)
- ux_differentiators (2–3 UX-specific strengths worth studying)
- user_segments they serve
- key_insights (1–2 strategic takeaways)

Also include:
- market_gaps: 4–6 unmet needs or whitespace opportunities
- design_patterns: 3–5 UX patterns recurring across competitors worth learning from
- strategic_recommendation: one paragraph with your positioning recommendation

#### Quality criteria
- Analogous products should be genuinely illuminating, not obvious inclusions
- Weaknesses must be specific UX problems, not generic "lacking features"
- Market gaps must connect back to the chosen problem statement
- Design patterns must name specific UX mechanics (not just "good onboarding")

#### On user interaction
If the user disagrees with a competitor assessment: update that entry via write_artifact
and explain the reasoning. Don't re-invoke the full tool unless the user wants a complete redo.

If the user spots a missing competitor: add it to the competitors array via write_artifact.

If the user wants a different focus: re-invoke the market_analysis tool with updated context.

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
- **downstream_dependents:** journey_mapping, hmw_generation, screen_planning, wireframe_gen, visual_design
- **accepts_feedback_from:** market_analysis
- **feeds_back_to:** problem_framing
- **ui_template:** entity_card_list
- **execution:** single

### Instructions

#### Context for sub-agent
Create evidence-based personas that represent the real diversity of users for this product.
Ground each persona in the competitive landscape findings — if the market analysis revealed
a user segment consistently underserved by existing products, that segment should be represented.
Personas should feel like real people: specific, opinionated, and sometimes surprising.

#### Output requirements
Generate 3–4 distinct personas. Each persona must include:
- name (realistic full name), age (integer), occupation, location
- archetype: a one-word personality label
- tech_savviness: "low" | "medium" | "high"
- goals: exactly 3–4 product-relevant goals
- pain_points: exactly 3–4 specific frustrations (not generic)
- behaviors: exactly 3–4 behavioral patterns relevant to the product context
- quote: one sentence in first person capturing their mindset
- context_of_use: when, where, and how they'd use the product
- decision_drivers: 3–4 factors that drive adoption or rejection

Also include:
- primary_persona: name of the most important persona for design decisions
- design_implications: 3–4 design principles derived from this persona set

#### Quality criteria
- No stereotypes — personas should subvert expectations where evidence supports it
- Pain points must be observable behaviours, not inferred psychology
- The persona set must create productive design tensions (conflicting needs between personas)
- Quotes must sound like something a real person would actually say

#### On user interaction
If the user wants to edit a persona: make the specific field change via write_artifact.

If the user wants to add a persona: re-invoke the tool with a note to add a specific
archetype to the existing set.

If the user selects a primary persona: update the primary_persona field and confirm.

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
- **downstream_dependents:** hmw_generation, screen_planning, wireframe_gen
- **accepts_feedback_from:** market_analysis, user_persona
- **feeds_back_to:** user_persona
- **ui_template:** journey_grid_matrix
- **execution:** single

### Instructions

#### Context for sub-agent
Map the complete experience of the primary persona as they encounter and try to solve the
problem addressed by this product. The journey should cover the full arc — from first awareness
of the problem through to achieving (or failing to achieve) their goal. Do not limit the
journey to screens within our product: include pre-product research, comparison, onboarding,
and post-use reflection.

#### Output requirements
Produce a journey map for the primary persona with 5–7 stages. Each stage must include:
- name (concise stage label), description (what they're trying to do)
- actions: exactly 3–4 specific user actions (verbs + objects)
- thoughts: exactly 2–3 things they're thinking (in first person)
- emotions: { label: "...", intensity: 1–5, emoji_hint: "..." }
  (1=very negative, 3=neutral, 5=very positive)
- pain_points: exactly 2–3 friction points at this stage
- opportunities: exactly 2–3 design opportunities to address the pain points
- touchpoints: 1–3 channels or surfaces involved

Also include:
- key_moments: 2–3 "moments of truth" that most impact the experience
- design_priorities: 4–5 ordered priorities derived from the journey

#### Quality criteria
- Emotion arc should show realistic variation — not uniformly negative or positive
- Opportunities must be specific enough to generate design ideas, not generic ("make it easier")
- Touchpoints should include non-digital channels where relevant
- Pain points must connect to real barriers, not hypothetical ones

#### On user interaction
If the user wants to add or modify a stage: update via write_artifact for minor changes,
or re-invoke the tool for structural changes.

If the user notices the emotions don't feel right: update specific emotion values via
write_artifact and explain the reasoning.

If the user suggests this reveals a persona gap: suggest navigating back to user_persona
to add or update a persona, then returning here.

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
Transform journey map pain points into actionable How-Might-We (HMW) statements. Each HMW
should be narrow enough to focus design work but broad enough to allow creative solutions.
Then generate 3 solution directions per HMW — not full designs, just directional ideas that
could be explored. Group HMWs into 3–5 thematic categories based on the type of problem they address.

#### Output requirements
Generate 12–18 HMW statements grouped into 3–5 categories. Each item must include:
- hmw_statement: starts with "How might we..." — specific and actionable
- category: thematic group label
- source_stage: which journey stage it comes from
- impact: "high" | "medium" | "low"
- effort: "high" | "medium" | "low"
- solution_directions: exactly 3 specific design directions (not features, directions)
- analogous_examples: 1–2 real product examples that solve similar problems

Also include:
- prioritised_top_5: the 5 HMW statements with highest impact×effort ratio, ordered

#### Quality criteria
- HMW statements must avoid solution-baking ("HMW make the button bigger" ❌)
- Solution directions should span a range — not all the same approach
- Categories should be mutually exclusive enough to be useful
- Analogous examples must be genuinely analogous — not just "Apple does this"
- Impact/effort ratings must be justified by the journey map evidence

#### On user interaction
If the user wants to promote a different set of top 5: update prioritised_top_5 via write_artifact.

If the user wants to add a new HMW: append it to the appropriate category via write_artifact.

If the user wants a new category: re-invoke the tool with instruction to include the new theme.

# Phase: Architecture

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
Design the information architecture based on the personas' mental models and the HMW statements.
The IA should reflect how users think about the problem space, not how the engineering team
thinks about the system. Use card sorting principles: group information the way the primary
persona would naturally group it, not by function or data model.

#### Output requirements
Produce a hierarchical IA tree with:
- root: product name
- description: 1–2 sentences on the IA rationale and navigation model
- children: 4–7 top-level sections, each with:
  - label, description, node_type ("section"|"screen"|"modal"|"flow")
  - access_level ("public"|"authenticated"|"admin")
  - children: 2–4 sub-sections (go 2 levels deep max for most sections)
- navigation_model: "tab-bar" | "sidebar" | "hamburger" | "hybrid"
- key_decisions: 3–4 specific IA decisions made and why

#### Quality criteria
- Section names should match user vocabulary, not product/engineering vocabulary
- Depth should reflect complexity — don't flatten everything or over-nest
- The navigation model choice must be justified by the persona's context of use
- Empty states and error states should appear as explicit nodes where they're critical

#### On user interaction
If the user wants to rename a section: update via write_artifact.

If the user wants to move a section: restructure the tree via write_artifact.

If the user wants a fundamentally different structure: re-invoke the tool with the new direction.

---

## Step: Screen Planning

- **id:** screen_planning
- **tool:** screen_planning
- **consumes:** personas, ia_tree, journey_map
- **produces:** screen_inventory
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** wireframe_gen, visual_design
- **accepts_feedback_from:** information_arch, hmw_generation
- **feeds_back_to:** information_arch
- **ui_template:** data_table
- **execution:** single

### Instructions

#### Context for sub-agent
Translate the IA tree into a prioritised screen inventory. Every leaf node in the IA becomes
a potential screen entry. Merge screens that serve the same user goal. Add screens that aren't
in the IA but are implied (empty states, error states, onboarding flows). Prioritise ruthlessly:
P0 is MVP-critical, P1 is important but not blocking launch, P2 is post-launch, P3 is future.

#### Output requirements
Output must include:
- columns: exactly this set (in order): screen_name, screen_type, primary_persona,
  journey_stage, priority, key_actions — with correct type metadata for the table renderer
- rows: one entry per screen with all column values plus:
  - ia_path, data_displayed (array), entry_points (array), success_state (string)

Also include:
- total_screens: integer count
- p0_count: integer count of P0 screens

Column type values: "text", "badge", "persona", "priority", "list"

#### Quality criteria
- Every P0 screen must have a clear entry point and success state
- Empty states must be explicit P0 or P1 entries (not afterthoughts)
- Screen types must reflect actual UX patterns, not vague labels
- Priority must be based on journey stage criticality, not engineering convenience

#### On user interaction
If the user wants to change a priority: update the specific row via write_artifact.

If the user wants to add a missing screen: append the row via write_artifact.

If the user wants to remove a screen: remove the row via write_artifact.

If the user questions the prioritisation logic: explain based on journey stage mapping.

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
- **downstream_dependents:** wireframe_gen, visual_design
- **accepts_feedback_from:** screen_planning
- **feeds_back_to:** none
- **ui_template:** design_token_viewer
- **execution:** single

### Instructions

#### Context for sub-agent
Define the design system tokens and components needed to build the screened inventory.
Be specific and opinionated — don't produce generic tokens. Ground the color palette in
the brand (if mentioned in the brief) or derive one that fits the product's emotional tenor.
Derive typography from the primary persona's reading context (mobile vs desktop, quick reads
vs deep reading). The gap analysis should compare what components typically exist vs what
the screen inventory actually needs.

#### Output requirements
Produce a complete design system with:
- colors: 8–12 color entries, each with name, hex, role ("primary"|"secondary"|"accent"|"neutral"|"semantic"), usage
- typography: 6–8 type scales from Display down to Caption, each with name, size (px), weight, line_height, usage
- spacing: exactly 6 entries: xs(4px), sm(8px), md(16px), lg(24px), xl(32px), 2xl(48px)
- components: 8–12 component entries with name, description, and variants array
- gap_analysis: 4–6 entries identifying components needed but not yet specified,
  each with area, current, needed, priority
- brand_personality: 3–4 adjectives
- design_principles: 3–4 actionable principles for this product

Hex values must be specific real colors (#hex), not placeholders.

#### Quality criteria
- Colors must pass WCAG AA contrast when used as described
- Typography scale must have visual hierarchy — sizes should be clearly distinct
- Components must match the screen inventory — no theoretical components
- Gap analysis must be honest about what's missing, not optimistic

#### On user interaction
If the user wants to change a color: update via write_artifact.

If the user provides their existing design system: use write_artifact to replace the generated
tokens with the provided values, and update gap_analysis accordingly.

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
- **downstream_dependents:** visual_design
- **accepts_feedback_from:** design_system_inject, screen_planning
- **feeds_back_to:** screen_planning
- **ui_template:** canvas_preview
- **execution:** single

### Instructions

#### Context for sub-agent
Create low-fidelity wireframe specifications for all P0 screens and the most critical P1 screens.
Use ASCII art to show layout and component placement — be specific enough that a developer
could understand the intent without a designer's annotation. Focus on layout, information
hierarchy, and primary user flow — not visual polish.

#### Output requirements
For each P0 screen (and top P1 screens), produce:
- screen_name, screen_id
- layout_type: "single-column" | "two-column" | "grid" | "split"
- viewport: "mobile" | "desktop" | "responsive"
- ascii_layout: ASCII diagram using [ ] for containers, | for columns, --- for dividers
  (at least 10 lines of ASCII for non-trivial screens)
- elements: array of UI elements, each with type, label, position, interaction
- key_interactions: 3–4 primary user interactions on this screen
- empty_states: description of how the screen looks with no data
- annotations: 2–3 design rationale notes

#### Quality criteria
- ASCII layouts must be readable — add labels to every region
- Elements must match the design system's component list
- Interactions must describe the outcome, not just the trigger ("tapping X navigates to Y")
- Annotations should capture decisions that aren't obvious from the layout

#### On user interaction
If the user wants to change a layout: update the specific screen's ascii_layout via write_artifact.

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
- **downstream_dependents:** none
- **accepts_feedback_from:** wireframe_gen, design_system_inject
- **feeds_back_to:** wireframe_gen
- **ui_template:** canvas_preview
- **execution:** single

### Instructions

#### Context for sub-agent
Apply the design system to the wireframes to produce high-fidelity visual design specifications.
You're not generating image files — you're generating precise specifications that describe
exactly how each screen should look. Reference specific design tokens by name (not hex values).
Consider the primary persona's emotional journey and ensure the visual language supports the
right emotional response at each screen.

#### Output requirements
For each wireframe screen, produce a visual design spec with:
- screen_name, screen_id
- visual_description: 2–3 paragraphs describing the visual appearance in detail
- color_applications: 4–6 entries describing how specific color tokens are applied
  (format: "token_name applied to element because reason")
- typography_applications: 3–5 entries mapping type scale tokens to content elements
- spacing_notes: 3–4 spacing decisions using spacing token names
- component_specs: 4–6 entries with component name, exact variant, and visual state
- micro_interactions: 3–4 transitions or animations with duration and easing
- accessibility_notes: 3–4 specific a11y requirements

Also include:
- design_rationale: 1–2 paragraphs on key visual design decisions
- handoff_notes: 4–6 notes for the engineering handoff

#### Quality criteria
- All token references must use names from the design system (not raw values)
- Micro-interactions must have specific durations (e.g., "200ms ease-out")
- Accessibility notes must cite specific WCAG criteria where relevant
- The visual description must be specific enough to build from

#### On user interaction
If the user wants a different visual direction: re-invoke the tool with the specific aesthetic direction.

If the user wants to adjust a specific element: update via write_artifact with precise changes.

If the user approves and wants an export summary: compile all screens into a handoff document
format and present via chat.

## Global Rules

### Step Execution Protocol
Before invoking any sub-agent tool:
1. Verify all artifacts listed in `consumes` exist and are not stale.
   - If null: BLOCK — inform user which prerequisite is missing and which step produces it.
   - If stale: WARN — inform user and ask whether to regenerate upstream or proceed.
2. Briefly announce what you're about to do (one sentence).
3. Invoke the step's tool with the consumed artifacts as input.
4. After the tool completes: call emit_artifact_to_ui with the appropriate template_id.
5. Present a 2–3 sentence summary of what was generated.
6. If selection_required: call request_approval(gate_type="selection", prompt="Select one of the approaches to continue. You can ask me to adjust any approach before selecting.")
7. If review_required: call request_approval(gate_type="review", prompt="Review the output on the left. Approve to continue, or tell me what you'd like to change.")
8. After approval: call mark_step_complete with the step_id.
9. Determine the next pending step and transition to it.

### Edit Protocol
Classify every user edit request before acting:
- Field-level change (name, number, single value): use write_artifact to update that field only.
- Structural change (add/remove items, reorganise): re-invoke the step's tool with current
  artifact as base and the edit instruction as additional_context.
After any edit: re-present the artifact via emit_artifact_to_ui, then return to review gate.
Do NOT auto-advance after edits — always wait for explicit approval.

### Backward Navigation Protocol
When the user asks to go back to a previous step:
1. Call navigate_to_step with the target step_id.
2. Call emit_artifact_to_ui with the step's ui_template.
3. Summarise what exists in the artifact (1–2 sentences).
4. Ask: "Would you like to regenerate, make changes, or review as-is?"
5. If user regenerates: re-invoke the tool. Downstream steps will be marked stale.
6. If user edits: follow Edit Protocol above.
7. If user approves: navigate forward to the step they came from.

### Staleness Handling
When a step is marked stale, on entering that step:
- Inform the user: "[Step] was generated before [upstream artifact] was updated."
- Ask: "Should I regenerate this with the latest data, or continue with the existing version?"
- If regenerate: re-invoke the tool.
- If continue: proceed, and note "proceeded_with_stale" in the artifact's metadata.

### Communication Style
- Keep chat responses brief — the artifact is on the left panel.
- Announce tool invocations before calling them ("I'm generating personas now...").
- After approvals, confirm briefly and announce the next step.
- When asking for selection/review, give 1–2 pointers on what to focus on.
- Never read out artifact JSON in chat — reference specific sections by name.
