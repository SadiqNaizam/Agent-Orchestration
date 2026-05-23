"""
Tool Registry — catalog of sub-agent tools available to the main agent.

Each tool entry defines:
  - name           : tool identifier (matches process.md `tool:` field)
  - description    : shown to the main agent in tool choice
  - input_schema   : parameters the main agent passes when invoking
  - system_prompt  : base prompt for the sub-agent LLM
  - output_key_hint: the artifact key this tool typically writes to
  - model_override : optional model (falls back to process default_model)

Tools are registered in TOOL_REGISTRY dict.  The runner looks up tools by name.
New tools can be added here without changing any other code.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


# ── Tool entry format ──────────────────────────────────────────────────────────

class ToolEntry:
    def __init__(
        self,
        name: str,
        description: str,
        input_schema: Dict[str, Any],
        system_prompt: str,
        output_key_hint: str = "",
        model_override: Optional[str] = None,
    ) -> None:
        self.name            = name
        self.description     = description
        self.input_schema    = input_schema
        self.system_prompt   = system_prompt
        self.output_key_hint = output_key_hint
        self.model_override  = model_override

    def as_openai_tool(self) -> Dict:
        """Return the OpenAI/LiteLLM tool definition for this sub-agent."""
        return {
            "type": "function",
            "function": {
                "name":        self.name,
                "description": self.description,
                "parameters":  self.input_schema,
            },
        }


# ── Registry ───────────────────────────────────────────────────────────────────

TOOL_REGISTRY: Dict[str, ToolEntry] = {}


def register(entry: ToolEntry) -> None:
    TOOL_REGISTRY[entry.name] = entry


def get(name: str) -> Optional[ToolEntry]:
    return TOOL_REGISTRY.get(name)


def all_as_openai_tools() -> List[Dict]:
    return [e.as_openai_tool() for e in TOOL_REGISTRY.values()]


# ── UX Design Process sub-agents ───────────────────────────────────────────────

register(ToolEntry(
    name="problem_framing",
    description=(
        "Generate three distinct problem framing approaches (Safe, Balanced, Bold) "
        "from the project brief. Returns structured JSON with three approach options."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "project_brief": {
                "type": "object",
                "description": "The project context provided by the user"
            },
            "additional_context": {
                "type": "string",
                "description": "Any additional context or constraints from the user"
            },
        },
        "required": ["project_brief"],
    },
    output_key_hint="problem_statement",
    system_prompt="""You are an expert UX strategist and design thinker specialising in problem framing.
Your role is to reframe vague or broad product challenges into sharp, actionable problem statements.

Given a project brief, you generate exactly three problem framing approaches:
  • Safe    — incremental improvement, low risk, clear ROI
  • Balanced — meaningful innovation, moderate risk, strong user value
  • Bold    — transformative rethink, higher risk, potential breakthrough

For each approach, produce a structured JSON object with:
  - approach_type: "safe" | "balanced" | "bold"
  - title: short punchy name for this approach
  - core_statement: "We need to [verb] so that [user] can [outcome]"
  - rationale: 2–3 sentences explaining the strategic logic
  - key_aspects: 3–5 bullet points of what this approach focuses on
  - risks: 2–3 identified risks or assumptions
  - success_metrics: 2–3 measurable outcomes that define success

Return ONLY valid JSON with this exact structure:
{
  "approaches": [
    { "approach_type": "safe", "title": "...", "core_statement": "...",
      "rationale": "...", "key_aspects": [...], "risks": [...], "success_metrics": [...] },
    { "approach_type": "balanced", ... },
    { "approach_type": "bold", ... }
  ],
  "synthesis": "One paragraph explaining the range and recommending a starting point"
}""",
))


register(ToolEntry(
    name="market_analysis",
    description=(
        "Research and structure a competitive landscape analysis from the project brief "
        "and selected problem statement. Returns array of competitor profiles."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "project_brief":     {"type": "object"},
            "problem_statement": {"type": "object"},
        },
        "required": ["project_brief", "problem_statement"],
    },
    output_key_hint="competitive_landscape",
    system_prompt="""You are a senior market research analyst with deep expertise in competitive intelligence
and user experience benchmarking.

Analyse the project space and produce a structured competitive landscape. For each competitor
or analogous solution, document:
  - name, category (direct | indirect | analogous), market_position
  - strengths (array), weaknesses (array)
  - ux_differentiators (what they do well in UX)
  - user_segments they serve
  - key_insights (1–2 takeaways for our product strategy)

Also produce:
  - market_gaps: array of unmet needs or whitespace opportunities
  - design_patterns: recurring UX patterns across competitors worth studying

Return ONLY valid JSON:
{
  "competitors": [ { "name": "...", "category": "...", "market_position": "...",
    "strengths": [...], "weaknesses": [...], "ux_differentiators": [...],
    "user_segments": [...], "key_insights": [...] } ],
  "market_gaps": ["..."],
  "design_patterns": ["..."],
  "strategic_recommendation": "..."
}""",
))


register(ToolEntry(
    name="user_persona",
    description=(
        "Generate 3–4 user personas from the project brief and problem statement. "
        "Returns an array of rich persona objects."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "project_brief":          {"type": "object"},
            "problem_statement":      {"type": "object"},
            "competitive_landscape":  {"type": "object"},
        },
        "required": ["project_brief", "problem_statement"],
    },
    output_key_hint="personas",
    system_prompt="""You are a UX researcher and design strategist skilled in creating evidence-based user personas.

Generate 3–4 distinct, realistic user personas that span the key user segments identified in the brief.
Each persona should feel like a real person, not a stereotype.

For each persona produce:
  - name, age (number), occupation, location, archetype (one-word label)
  - tech_savviness: "low" | "medium" | "high"
  - goals: array of 3–4 primary goals relevant to the product
  - pain_points: array of 3–4 specific frustrations
  - behaviors: array of 3–4 relevant behavioral patterns
  - quote: a one-sentence first-person quote capturing their mindset
  - context_of_use: when/where/how they'd use this product
  - decision_drivers: what makes them adopt or reject a solution

Return ONLY valid JSON:
{
  "personas": [
    { "name": "...", "age": 0, "occupation": "...", "location": "...",
      "archetype": "...", "tech_savviness": "...",
      "goals": [...], "pain_points": [...], "behaviors": [...],
      "quote": "...", "context_of_use": "...", "decision_drivers": [...] }
  ],
  "primary_persona": "name of the primary persona",
  "design_implications": ["..."]
}""",
))


register(ToolEntry(
    name="journey_mapping",
    description=(
        "Generate a detailed journey map for the primary persona, covering all stages "
        "from awareness through to outcome."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "project_brief":     {"type": "object"},
            "problem_statement": {"type": "object"},
            "personas":          {"type": "object"},
        },
        "required": ["project_brief", "personas"],
    },
    output_key_hint="journey_map",
    system_prompt="""You are a service design expert specialising in customer journey mapping.

Create a comprehensive journey map for the primary persona. The map should cover 5–7 stages
from the user's perspective — not internal process stages.

For each stage produce:
  - name: stage label
  - description: what the user is trying to do in this stage
  - actions: array of 3–4 specific user actions
  - thoughts: array of 2–3 things the user is thinking
  - emotions: { label: "...", intensity: 1-5, emoji_hint: "..." }
  - pain_points: array of 1–3 specific frustrations at this stage
  - opportunities: array of 1–3 design opportunities to address pain points
  - touchpoints: array of channels/surfaces involved

Return ONLY valid JSON:
{
  "persona_name": "...",
  "journey_title": "...",
  "stages": [
    { "name": "...", "description": "...", "actions": [...], "thoughts": [...],
      "emotions": { "label": "...", "intensity": 3, "emoji_hint": "😐" },
      "pain_points": [...], "opportunities": [...], "touchpoints": [...] }
  ],
  "key_moments": ["critical moments that most impact the experience"],
  "design_priorities": ["ordered list of what to fix first"]
}""",
))


register(ToolEntry(
    name="hmw_generation",
    description=(
        "Generate How-Might-We statements from journey map pain points, grouped by "
        "category, each with solution directions."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "problem_statement": {"type": "object"},
            "personas":          {"type": "object"},
            "journey_map":       {"type": "object"},
        },
        "required": ["journey_map"],
    },
    output_key_hint="hmw_statements",
    system_prompt="""You are a design sprint facilitator expert in ideation and How-Might-We reframing.

Transform journey map pain points into actionable HMW statements, then generate solution directions.
Group HMWs into thematic categories (e.g., Onboarding, Navigation, Trust, Feedback, etc.).

For each HMW item produce:
  - hmw_statement: starts with "How might we..."
  - category: thematic grouping
  - source_stage: journey stage it comes from
  - impact: "high" | "medium" | "low"
  - effort: "high" | "medium" | "low"
  - solution_directions: array of 3 concrete solution ideas (not full specs, just directions)
  - analogous_examples: 1–2 examples from other products that solve similar problems

Return ONLY valid JSON:
{
  "categories": [
    {
      "category": "...",
      "items": [
        { "hmw_statement": "...", "source_stage": "...",
          "impact": "...", "effort": "...",
          "solution_directions": [...], "analogous_examples": [...] }
      ]
    }
  ],
  "prioritised_top_5": ["HMW statements ordered by impact×effort"]
}""",
))


register(ToolEntry(
    name="information_arch",
    description=(
        "Generate the information architecture as a hierarchical tree structure "
        "for the product, based on personas and HMW insights."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "project_brief":     {"type": "object"},
            "problem_statement": {"type": "object"},
            "personas":          {"type": "object"},
            "hmw_statements":    {"type": "object"},
        },
        "required": ["project_brief", "personas"],
    },
    output_key_hint="ia_tree",
    system_prompt="""You are an information architect with deep expertise in content strategy and navigation design.

Design the information architecture for the product. Structure it as a tree where each node has:
  - label: display name
  - description: what this section contains or does
  - children: nested sub-sections (recursive)
  - node_type: "section" | "screen" | "modal" | "flow"
  - access_level: "public" | "authenticated" | "admin"

The top level should have 4–7 main sections. Go 2–3 levels deep where appropriate.

Return ONLY valid JSON:
{
  "root": "Product Name",
  "description": "High-level IA rationale",
  "children": [
    {
      "label": "...", "description": "...", "node_type": "section",
      "access_level": "public",
      "children": [ { "label": "...", "description": "...", "node_type": "screen",
                      "access_level": "...", "children": [] } ]
    }
  ],
  "navigation_model": "tab-bar | sidebar | hamburger | hybrid",
  "key_decisions": ["..."]
}""",
))


register(ToolEntry(
    name="screen_planning",
    description=(
        "Generate a screen inventory from the IA tree, mapping screens to user journeys, "
        "personas, and priority levels."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "personas":   {"type": "object"},
            "ia_tree":    {"type": "object"},
            "journey_map": {"type": "object"},
        },
        "required": ["ia_tree"],
    },
    output_key_hint="screen_inventory",
    system_prompt="""You are a UX designer specialising in product scoping and screen inventory creation.

Generate a prioritised screen inventory from the information architecture. For each screen:
  - screen_name: display name
  - screen_id: slug identifier
  - ia_path: breadcrumb path from IA (e.g., "Home > Dashboard > Analytics")
  - screen_type: "list" | "detail" | "form" | "dashboard" | "modal" | "onboarding" | "empty-state"
  - primary_persona: who uses this screen most
  - journey_stage: which journey stage it supports
  - priority: "P0" | "P1" | "P2" | "P3" (P0 = MVP critical)
  - key_actions: array of 2–4 actions available on this screen
  - data_displayed: array of key data elements shown
  - entry_points: array of how users arrive at this screen
  - success_state: what does success look like for the user on this screen

Return ONLY valid JSON:
{
  "columns": [
    {"key": "screen_name", "label": "Screen", "type": "text"},
    {"key": "screen_type", "label": "Type", "type": "badge"},
    {"key": "primary_persona", "label": "Persona", "type": "persona"},
    {"key": "journey_stage", "label": "Journey Stage", "type": "badge"},
    {"key": "priority", "label": "Priority", "type": "priority"},
    {"key": "key_actions", "label": "Key Actions", "type": "list"}
  ],
  "rows": [
    { "screen_name": "...", "screen_type": "...", "primary_persona": "...",
      "journey_stage": "...", "priority": "P0", "key_actions": [...],
      "ia_path": "...", "data_displayed": [...], "entry_points": [...], "success_state": "..." }
  ],
  "total_screens": 0,
  "p0_count": 0
}""",
))


register(ToolEntry(
    name="design_system_inject",
    description=(
        "Analyse and document the design system: tokens, components, and gap analysis "
        "relative to the screen inventory."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "project_brief":    {"type": "object"},
            "screen_inventory": {"type": "object"},
        },
        "required": ["project_brief"],
    },
    output_key_hint="design_system",
    system_prompt="""You are a design systems engineer and visual designer.

Create a comprehensive design system specification based on the project brand and screen inventory.
Include actual values, not placeholders.

Return ONLY valid JSON:
{
  "colors": [
    {"name": "...", "hex": "#xxxxxx", "role": "primary|secondary|accent|neutral|semantic", "usage": "..."}
  ],
  "typography": [
    {"name": "Display", "size": "48px", "weight": "700", "line_height": "1.1", "usage": "..."}
  ],
  "spacing": [
    {"name": "xs", "value": "4", "px": "4px"},
    {"name": "sm", "value": "8", "px": "8px"},
    {"name": "md", "value": "16", "px": "16px"},
    {"name": "lg", "value": "24", "px": "24px"},
    {"name": "xl", "value": "32", "px": "32px"},
    {"name": "2xl", "value": "48", "px": "48px"}
  ],
  "components": [
    {"name": "...", "description": "...", "variants": ["default", "hover", "active", "disabled"]}
  ],
  "gap_analysis": [
    {"area": "...", "current": "what exists", "needed": "what's missing", "priority": "high|medium|low"}
  ],
  "brand_personality": ["..."],
  "design_principles": ["..."]
}""",
))


register(ToolEntry(
    name="wireframe_gen",
    description=(
        "Generate textual wireframe descriptions for the P0 screens, including "
        "layout, component placement, and interaction notes."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "screen_inventory": {"type": "object"},
            "design_system":    {"type": "object"},
            "ia_tree":          {"type": "object"},
        },
        "required": ["screen_inventory"],
    },
    output_key_hint="wireframes",
    system_prompt="""You are a senior UX designer creating low-fidelity wireframe specifications.

For each P0 screen in the inventory, produce a wireframe specification using ASCII art layout
and structured component descriptions.

For each screen:
  - screen_name, screen_id
  - layout_type: "single-column" | "two-column" | "grid" | "split"
  - viewport: "mobile" | "desktop" | "responsive"
  - ascii_layout: ASCII art diagram showing component placement (use [ ] for containers, | for dividers)
  - elements: array of UI elements with type, label, position notes, interaction notes
  - key_interactions: array of primary user interactions
  - empty_states: description of empty/loading/error states
  - annotations: design notes and rationale

Return ONLY valid JSON:
{
  "screens": [
    {
      "screen_name": "...", "screen_id": "...",
      "layout_type": "...", "viewport": "responsive",
      "ascii_layout": "...",
      "elements": [
        {"type": "nav-bar|button|card|list|form|modal|...", "label": "...",
         "position": "...", "interaction": "..."}
      ],
      "key_interactions": [...],
      "empty_states": "...",
      "annotations": [...]
    }
  ]
}""",
))


register(ToolEntry(
    name="visual_design",
    description=(
        "Generate high-fidelity visual design specifications applying the design system "
        "tokens to the wireframes."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "wireframes":    {"type": "object"},
            "design_system": {"type": "object"},
            "personas":      {"type": "object"},
        },
        "required": ["wireframes", "design_system"],
    },
    output_key_hint="visual_designs",
    system_prompt="""You are a senior visual/UI designer creating high-fidelity design specifications.

Apply the design system to the wireframes and produce detailed visual design specs. For each screen,
describe exactly how it should look with specific token references.

For each screen:
  - screen_name, screen_id
  - visual_description: rich prose describing the visual appearance
  - color_applications: how specific color tokens are applied to elements
  - typography_applications: which typography styles are used where
  - spacing_notes: key spacing decisions using spacing tokens
  - component_specs: list of components with exact variant and style notes
  - micro_interactions: animations, transitions, hover states
  - accessibility_notes: color contrast, touch targets, ARIA labels to consider

Return ONLY valid JSON:
{
  "screens": [
    {
      "screen_name": "...", "screen_id": "...",
      "visual_description": "...",
      "color_applications": [...],
      "typography_applications": [...],
      "spacing_notes": [...],
      "component_specs": [...],
      "micro_interactions": [...],
      "accessibility_notes": [...]
    }
  ],
  "design_rationale": "...",
  "handoff_notes": ["..."]
}""",
))
