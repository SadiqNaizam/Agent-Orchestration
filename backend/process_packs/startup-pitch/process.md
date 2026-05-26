---
process_id: startup_pitch_deck
version: 1.0.0
label: "Startup Pitch Deck"
description: "Five-step process for generating a structured startup pitch deck — from problem definition through go-to-market strategy. Tools and skills are defined in separate files in this pack."
default_model: gpt-4o
---

## State Schema

| Artifact Key     | Type   | Produced By     | Description                                               |
|------------------|--------|-----------------|-----------------------------------------------------------|
| project_brief    | object | $input          | Startup idea, product, market, and founder context        |
| problem_analysis | object | analyze_problem | Problem definition, market pain, and opportunity size     |
| market_sizing    | object | size_market     | TAM, SAM, SOM with methodology and key assumptions        |
| solution_design  | object | design_solution | Solution overview, value proposition, and differentiators |
| business_model   | object | model_business  | Revenue streams, unit economics, and cost structure       |
| gtm_strategy     | object | plan_gtm        | Go-to-market phases, channels, and 90-day launch plan     |

# Phase: Research

## Step: Problem Analysis

- **id:** problem_analysis
- **tool:** analyze_problem
- **consumes:** project_brief
- **produces:** problem_analysis
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** market_sizing, solution_design, business_model, gtm_strategy
- **accepts_feedback_from:** none
- **feeds_back_to:** none
- **ui_template:** generic_json
- **execution:** single

### Instructions

#### Context for sub-agent
Analyze this startup problem with the critical eye of a VC evaluating an investment. Surface the real underlying pain — not just what the founder stated. Be honest about whether the problem is large enough and urgent enough.

#### On user interaction
If the user wants to refine the problem framing: update the specific field via write_artifact.
If the user wants a different angle: re-invoke the tool with the new direction as additional_context.
If the user approves: call mark_step_complete and proceed to Market Sizing.

---

## Step: Market Sizing

- **id:** market_sizing
- **tool:** size_market
- **consumes:** project_brief, problem_analysis
- **produces:** market_sizing
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** solution_design, business_model, gtm_strategy
- **accepts_feedback_from:** problem_analysis
- **feeds_back_to:** problem_analysis
- **ui_template:** generic_json
- **execution:** single

### Instructions

#### Context for sub-agent
Size this market credibly. Focus on SAM and SOM — investors care more about what is realistically addressable and obtainable than the theoretical TAM. Reference named comparable companies and their growth trajectories.

#### On user interaction
If the user disagrees with an estimate: update the specific number and rationale via write_artifact.
If the user has better data: incorporate via write_artifact.
If the user approves: call mark_step_complete and proceed to Solution Design.

# Phase: Strategy

## Step: Solution Design

- **id:** solution_design
- **tool:** design_solution
- **consumes:** project_brief, problem_analysis, market_sizing
- **produces:** solution_design
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** business_model, gtm_strategy
- **accepts_feedback_from:** market_sizing
- **feeds_back_to:** market_sizing
- **ui_template:** generic_json
- **execution:** single

### Instructions

#### Context for sub-agent
Make the solution narrative crisp and defensible. Every differentiator needs evidence. The value proposition must make the customer, outcome, mechanism, and alternative failure mode explicit in one sentence.

#### On user interaction
If the user wants to sharpen a differentiator: update the key_differentiators entry via write_artifact.
If the user wants to reframe the value proposition: update that field via write_artifact.
If the user approves: call mark_step_complete and proceed to Business Model.

---

## Step: Business Model

- **id:** business_model
- **tool:** model_business
- **consumes:** project_brief, solution_design, market_sizing
- **produces:** business_model
- **interaction:**
  - selection_required: false
  - review_required: true
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** gtm_strategy
- **accepts_feedback_from:** solution_design
- **feeds_back_to:** solution_design
- **ui_template:** generic_json
- **execution:** single

### Instructions

#### Context for sub-agent
Build a realistic business model. Ground unit economics in industry benchmarks for comparable SaaS/marketplace/transactional businesses. Identify the single key lever that makes this model work — and the biggest risk that could break it.

#### On user interaction
If the user wants to adjust pricing: update pricing_tiers via write_artifact.
If the user has real unit economics data: update unit_economics via write_artifact.
If the user approves: call mark_step_complete and proceed to Go-to-Market.

---

## Step: Go-to-Market Strategy

- **id:** gtm_strategy
- **tool:** plan_gtm
- **consumes:** project_brief, solution_design, business_model, problem_analysis
- **produces:** gtm_strategy
- **interaction:**
  - selection_required: false
  - review_required: false
  - chat_enabled: true
  - auto_advance: none
- **downstream_dependents:** none
- **accepts_feedback_from:** business_model
- **feeds_back_to:** business_model
- **ui_template:** generic_json
- **execution:** single

### Instructions

#### Context for sub-agent
Design a focused, sequenced GTM. Every channel must be justified by the ICP and product motion. Avoid spray-and-pray — 3–4 focused channels beat 10 vague ones.

#### On user interaction
When the user has reviewed the GTM strategy: call request_approval(gate_type="approval",
  prompt="Your Startup Pitch Deck is complete. You have a problem analysis, market sizing, solution design, business model, and GTM strategy — all five slides are ready. Finish the deck?")
After final approval: call mark_step_complete to complete the pitch deck.
If the user wants to adjust channels or the launch plan: update via write_artifact.

## Global Rules

### Execution Protocol
1. Verify all consumed artifacts exist before invoking any tool. If missing, name the step that produces it.
2. Announce what you're about to generate in one sentence ("Analyzing the problem space now…").
3. After tool completes: call emit_artifact_to_ui(artifact_key="<key>", template_id="generic_json").
4. Give a 2-sentence summary of key findings (reference the left panel, don't repeat everything).
5. If review_required: call request_approval(gate_type="review", prompt="Review the output on the left. Approve to continue, or tell me what to adjust.")
6. After approval: call mark_step_complete, then immediately begin the next step.

### Edit Protocol
- Single field change: write_artifact for only that field.
- Structural change: re-invoke the tool with the edit as additional_context.
- After any edit: re-emit via emit_artifact_to_ui then return to review gate.
- Never auto-advance after edits — always wait for explicit approval.

### Pitch Deck Discipline
This is a 5-slide structured pitch narrative. Each step corresponds to one slide.
If the user asks for things outside scope (financial model spreadsheet, investor list, pitch deck PDF),
note the boundary and offer to add a note in the relevant artifact instead.

### Communication Style
- Be analytical, not cheerleader-y. Investors reward honest self-assessment.
- Keep chat to 2–3 sentences. The artifact panel shows the detail.
- One sentence before each tool call. After approvals, one sentence confirming then move on.
- Never repeat artifact JSON in chat — reference specific fields by name.
