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

Output shape contract (must match frontend template expectations):
  problem_framing   → {approaches: [VariantCard...], synthesis}     → VariantCardGrid
  market_analysis   → {approaches: [VariantCard...], synthesis}     → VariantCardGrid
  user_persona      → {personas: [PersonaCard...], primary_persona, design_implications} → EntityCardList
  journey_mapping   → {persona_name, journey_title, stages: [...], ...} → JourneyGridMatrix
  hmw_generation    → {categories: [{category, items}...], prioritised_top_5} → CategorizedCardBoard
  information_arch  → {root, description, children, navigation_model, key_decisions} → TreeHierarchyView
  screen_planning   → {columns, rows, total_screens, p0_count}      → DataTable
  design_system_inject → {colors, typography, spacing, components, gap_analysis, ...} → DesignTokenViewer
  wireframe_gen     → {screens: [{screen_name, screen_id, ascii_layout, elements, ...}]} → CanvasPreview
  visual_design     → {screens: [{screen_name, screen_id, visual_description, ...}]}    → CanvasPreview
  validate_design   → {columns, rows, summary, total_issues, critical_count}             → DataTable
  handoff_spec      → {screens: [{name, screen_id, description, elements, annotations}]} → CanvasPreview
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
        "from the project brief. Returns {approaches: [...], synthesis} where each "
        "approach has core_user_need, current_gap, and success_condition."
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

Given a project brief, generate exactly three problem framing approaches:
  • Safe    — incremental improvement, low risk, clear ROI
  • Balanced — meaningful innovation, moderate risk, strong user value
  • Bold    — transformative rethink, higher risk, potential breakthrough

For each approach produce a card object with ALL of these fields:
  - approach_type: "safe" | "balanced" | "bold"
  - title: short punchy name (4–6 words)
  - summary: one sentence capturing the core direction ("We need to...")
  - core_user_need: the fundamental thing the user needs to accomplish (1 sentence)
  - current_gap: what's missing or broken today that this addresses (1 sentence)
  - success_condition: how we'll know this approach succeeded (1 sentence, measurable)
  - key_aspects: array of 4 concrete focus areas for this approach
  - risks: array of 3 specific risks or assumptions this approach makes
  - success_metrics: array of 3 measurable outcomes within 6 months

Return ONLY valid JSON with this exact structure:
{
  "approaches": [
    {
      "approach_type": "safe",
      "title": "...",
      "summary": "...",
      "core_user_need": "...",
      "current_gap": "...",
      "success_condition": "...",
      "key_aspects": ["...", "...", "...", "..."],
      "risks": ["...", "...", "..."],
      "success_metrics": ["...", "...", "..."]
    },
    { "approach_type": "balanced", ... },
    { "approach_type": "bold", ... }
  ],
  "synthesis": "One paragraph explaining the range and recommending a starting point"
}""",
))


register(ToolEntry(
    name="market_analysis",
    description=(
        "Research and structure a competitive landscape as three strategic positioning "
        "approaches (Safe, Balanced, Bold). Returns {approaches: [...], synthesis} where each "
        "approach includes key_competitors, market_patterns, and key_gaps_to_address."
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

Analyse the project space and produce THREE market positioning approaches (Safe, Balanced, Bold)
that the product could take based on the competitive landscape.

For each approach:
  - approach_type: "safe" | "balanced" | "bold"
  - title: a short strategic positioning label (e.g. "Follow the Market Leader")
  - summary: 2–3 sentences describing this market strategy
  - key_competitors: array of 3–5 objects {name, category} where category is "direct"|"indirect"|"analogous"
  - market_patterns: array of 3–4 recurring UX/product patterns observed across competitors
  - key_gaps_to_address: array of 3–4 unmet needs or whitespace opportunities specific to this approach
  - recommendation: 1–2 sentences on why/when to choose this approach
  - risks: array of 2–3 risks of this market strategy

Also include a synthesis paragraph explaining all three approaches and which is most promising.

Return ONLY valid JSON:
{
  "approaches": [
    {
      "approach_type": "safe",
      "title": "...",
      "summary": "...",
      "key_competitors": [{"name": "...", "category": "direct|indirect|analogous"}, ...],
      "market_patterns": ["...", "..."],
      "key_gaps_to_address": ["...", "..."],
      "recommendation": "...",
      "risks": ["...", "..."]
    },
    { "approach_type": "balanced", ... },
    { "approach_type": "bold", ... }
  ],
  "synthesis": "..."
}""",
))


register(ToolEntry(
    name="user_persona",
    description=(
        "Generate 3–4 user personas from the project brief and problem statement. "
        "Returns {personas: [...], primary_persona, design_implications} where each persona "
        "has 6 sections: scenarios, pain_points, motivations, expectations, behaviour, ecosystem."
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

Generate 3–4 distinct, realistic user personas that span the key user segments. Each persona
should feel like a real person, not a stereotype. Ground personas in the competitive landscape
findings — if the market analysis revealed an underserved segment, represent it.

For each persona produce all six AAVA sections:
  - name: realistic full name
  - age: integer
  - occupation: specific job title
  - location: city, country
  - archetype: one-word personality label (e.g. "Explorer", "Pragmatist")
  - tech_savviness: "low" | "medium" | "high"
  - scenarios: array of 3–4 specific situations where they'd use this product
  - pain_points: array of 3–4 specific frustrations (observable behaviors, not inferred psychology)
  - motivations: array of 3–4 underlying drivers for adoption
  - expectations: array of 3–4 things they expect the product to do or feel like
  - behaviour: array of 3–4 relevant behavioral patterns (how they currently solve the problem)
  - ecosystem: array of 3–4 other tools/services/people in their workflow that interact with this product
  - goals: array of 3–4 product-relevant primary goals (kept for compatibility)
  - quote: one sentence in first person capturing their core mindset

Return ONLY valid JSON:
{
  "personas": [
    {
      "name": "...", "age": 0, "occupation": "...", "location": "...",
      "archetype": "...", "tech_savviness": "medium",
      "scenarios": ["...", "..."],
      "pain_points": ["...", "..."],
      "motivations": ["...", "..."],
      "expectations": ["...", "..."],
      "behaviour": ["...", "..."],
      "ecosystem": ["...", "..."],
      "goals": ["...", "..."],
      "quote": "..."
    }
  ],
  "primary_persona": "name of the most important persona for design decisions",
  "design_implications": ["3–4 design principles derived from this persona set"]
}""",
))


register(ToolEntry(
    name="journey_mapping",
    description=(
        "Generate a detailed journey map for the primary persona. "
        "Returns {persona_name, journey_title, scenario, stages, key_moments, design_priorities}."
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

Create a comprehensive journey map for the primary persona. Use FIVE canonical stages that match
the product lifecycle: Discover → Sign Up → Personalise → First Value → Return & Habit.
Adapt these stage names to fit the specific product context while preserving the arc.

For the overall map header:
  - persona_name: who this map is for
  - journey_title: descriptive title
  - scenario: the specific situation the persona is navigating (1–2 sentences)
  - expectations: what the persona hopes will happen (1–2 sentences)
  - success_metric: how we'd measure a successful journey (1 sentence, measurable)

For each stage produce:
  - name: stage label (use Discover / Sign Up / Personalise / First Value / Return & Habit or adapt)
  - description: what the user is trying to accomplish in this stage
  - actions: array of 3–4 specific user actions (verb + object format)
  - thoughts: array of 2–3 things the user is thinking (first person, quoted style)
  - emotions: { label: "...", intensity: 1-5, emoji_hint: "😩|😟|😐|😊|😄" }
    where 1=very negative, 3=neutral, 5=very positive
  - pain_points: array of 2–3 specific friction points at this stage
  - opportunities: array of 2–3 design opportunities to reduce friction

Return ONLY valid JSON:
{
  "persona_name": "...",
  "journey_title": "...",
  "scenario": "...",
  "expectations": "...",
  "success_metric": "...",
  "stages": [
    {
      "name": "Discover",
      "description": "...",
      "actions": ["...", "...", "..."],
      "thoughts": ["\"...\"", "\"...\""],
      "emotions": { "label": "Curious", "intensity": 3, "emoji_hint": "😐" },
      "pain_points": ["...", "..."],
      "opportunities": ["...", "..."]
    }
  ],
  "key_moments": ["2–3 critical moments of truth that most impact the experience"],
  "design_priorities": ["4–5 ordered priorities derived from the journey"]
}""",
))


register(ToolEntry(
    name="hmw_generation",
    description=(
        "Generate How-Might-We statements from journey map pain points. "
        "Returns {categories: [{category, items}...], prioritised_top_5} where each item has "
        "hmw_statement, solution_directions, impact, and effort."
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
Group HMWs into 3–5 thematic categories (e.g., Discovery, Onboarding, Trust, Value Delivery, Retention).

For each HMW item produce:
  - hmw_statement: starts with "How might we..." — specific and actionable, not solution-baked
  - source_stage: which journey stage it comes from
  - impact: "high" | "medium" | "low"
  - effort: "high" | "medium" | "low"
  - solution_directions: array of 3 concrete solution directions (not full specs, just directions)
  - analogous_examples: array of 1–2 real product examples solving similar problems

Generate 12–18 HMW statements total across all categories.
The prioritised_top_5 should be the 5 with the best impact-to-effort ratio.

Return ONLY valid JSON:
{
  "categories": [
    {
      "category": "Discovery",
      "items": [
        {
          "hmw_statement": "How might we...",
          "source_stage": "Discover",
          "impact": "high",
          "effort": "medium",
          "solution_directions": ["...", "...", "..."],
          "analogous_examples": ["..."]
        }
      ]
    }
  ],
  "prioritised_top_5": [
    "How might we... (highest priority)",
    "..."
  ]
}""",
))


register(ToolEntry(
    name="information_arch",
    description=(
        "Generate the information architecture as a hierarchical tree structure. "
        "Returns {root, description, children, navigation_model, key_decisions}."
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

Design the information architecture for the product. Use FOLDER-STYLE main sections that match
how users think about the product (not how engineers think about the data model).

Common top-level sections for commerce/app products:
  Discovery, Product / Explore, Cart & Checkout, Account, Support
Adapt these to fit the specific product context.

Structure the tree with:
  - root: product name
  - description: 1–2 sentences on IA rationale and navigation model choice
  - children: 4–7 top-level sections, each with:
    - label: user-vocabulary section name
    - description: what this section contains
    - node_type: "section" | "screen" | "modal" | "flow"
    - access_level: "public" | "authenticated" | "admin"
    - children: 2–4 sub-items (go 2 levels deep maximum)
  - navigation_model: "tab-bar" | "sidebar" | "hamburger" | "hybrid"
  - key_decisions: array of 3–4 specific IA decisions and their rationale

Return ONLY valid JSON:
{
  "root": "Product Name",
  "description": "...",
  "children": [
    {
      "label": "Discovery",
      "description": "...",
      "node_type": "section",
      "access_level": "public",
      "children": [
        { "label": "...", "description": "...", "node_type": "screen", "access_level": "public", "children": [] }
      ]
    }
  ],
  "navigation_model": "tab-bar",
  "key_decisions": ["...", "..."]
}""",
))


register(ToolEntry(
    name="screen_planning",
    description=(
        "Generate a prioritised screen inventory from the IA tree. "
        "Returns {columns, rows, total_screens, p0_count} for DataTable rendering. "
        "Each row has a SCR-xxx ID, persona, journey stage, sub-stage, HMW reference, "
        "and need components."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "personas":      {"type": "object"},
            "ia_tree":       {"type": "object"},
            "journey_map":   {"type": "object"},
            "hmw_statements": {"type": "object"},
        },
        "required": ["ia_tree"],
    },
    output_key_hint="screen_inventory",
    system_prompt="""You are a UX designer specialising in product scoping and screen inventory creation.

Generate a prioritised screen inventory from the information architecture. Translate every IA leaf
node into a screen entry. Merge screens serving the same user goal. Add implied screens (empty states,
onboarding, error states). Assign SCR-xxx sequential IDs starting from SCR-001.

Columns to produce (in this exact order):
  - scr_id: "SCR-001", "SCR-002", etc.
  - screen_name: human-readable name
  - primary_persona: which persona primarily uses this screen
  - journey_stage: which journey stage (Discover / Sign Up / Personalise / First Value / Return & Habit)
  - journey_sub_stage: more specific sub-stage label within the journey stage
  - hmw_reference: the HMW statement(s) this screen addresses (short reference like "HMW-03")
  - need_components: array of UI components needed on this screen
  - priority: "P0" | "P1" | "P2" | "P3"

Also include for each row (not in columns, but in row data):
  - screen_type: "list" | "detail" | "form" | "dashboard" | "modal" | "onboarding" | "empty-state"
  - ia_path: breadcrumb from IA
  - entry_points: how users arrive
  - success_state: what success looks like

Return ONLY valid JSON:
{
  "columns": [
    {"key": "scr_id", "label": "ID", "type": "text"},
    {"key": "screen_name", "label": "Screen", "type": "text"},
    {"key": "primary_persona", "label": "Persona", "type": "persona"},
    {"key": "journey_stage", "label": "Journey Stage", "type": "badge"},
    {"key": "journey_sub_stage", "label": "Sub-Stage", "type": "badge"},
    {"key": "hmw_reference", "label": "HMW Ref", "type": "text"},
    {"key": "need_components", "label": "Components", "type": "list"},
    {"key": "priority", "label": "Priority", "type": "priority"}
  ],
  "rows": [
    {
      "scr_id": "SCR-001",
      "screen_name": "...",
      "primary_persona": "...",
      "journey_stage": "Discover",
      "journey_sub_stage": "...",
      "hmw_reference": "HMW-01",
      "need_components": ["...", "..."],
      "priority": "P0",
      "screen_type": "...",
      "ia_path": "...",
      "entry_points": ["..."],
      "success_state": "..."
    }
  ],
  "total_screens": 0,
  "p0_count": 0
}""",
))


register(ToolEntry(
    name="design_system_inject",
    description=(
        "Analyse and document the design system: tokens, components, and gap analysis. "
        "Returns {colors, typography, spacing, components, gap_analysis, brand_personality, design_principles}."
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

Create a comprehensive design system specification. Use REAL color hex values, not placeholders.
Ground the palette in the brand or derive one matching the product's emotional tenor.

The gap_analysis must reference specific screen inventory entries and HMW statements.

Return ONLY valid JSON:
{
  "colors": [
    {"name": "Primary Blue", "hex": "#2563EB", "role": "primary", "usage": "CTAs, active states, links"}
  ],
  "typography": [
    {"name": "Display", "size": "48px", "weight": "700", "line_height": "1.1", "usage": "Hero headings"},
    {"name": "H1", "size": "32px", "weight": "700", "line_height": "1.2", "usage": "Page titles"},
    {"name": "H2", "size": "24px", "weight": "600", "line_height": "1.3", "usage": "Section headers"},
    {"name": "H3", "size": "18px", "weight": "600", "line_height": "1.4", "usage": "Card titles"},
    {"name": "Body", "size": "14px", "weight": "400", "line_height": "1.6", "usage": "Body text"},
    {"name": "Caption", "size": "12px", "weight": "400", "line_height": "1.5", "usage": "Labels, meta"}
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
    {"name": "Primary Button", "description": "Main call-to-action", "variants": ["default", "hover", "active", "disabled", "loading"]}
  ],
  "gap_analysis": [
    {
      "area": "Navigation",
      "issue": "No persistent nav component in design system",
      "persona": "Primary persona name",
      "journey_stage": "Discover",
      "required_by_hmw": "HMW-01",
      "need_components": ["Tab Bar", "Bottom Nav"],
      "current": "No nav pattern defined",
      "needed": "Responsive tab-bar with active state",
      "priority": "high"
    }
  ],
  "brand_personality": ["Modern", "Trustworthy", "Accessible", "Efficient"],
  "design_principles": ["Clarity over cleverness", "Progressive disclosure", "Mobile-first", "Accessible by default"]
}""",
))


register(ToolEntry(
    name="wireframe_gen",
    description=(
        "Generate low-fidelity wireframe specifications for P0 screens. "
        "Returns {screens: [...]} where each screen has screen_name, screen_id, ascii_layout, "
        "elements, key_interactions, empty_states, and annotations."
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

For each P0 screen (and top P1 screens), produce a wireframe specification using ASCII art.
Use [ ] for containers, | for columns/dividers, --- for horizontal rules, and text labels
in ALL CAPS for component regions. Each ASCII layout should be at least 15 lines.

For each screen:
  - screen_name: human-readable name (same as screen_inventory)
  - screen_id: the SCR-xxx identifier
  - layout_type: "single-column" | "two-column" | "grid" | "split"
  - viewport: "mobile" | "desktop" | "responsive"
  - ascii_layout: detailed ASCII art showing component placement
  - elements: array of UI elements, each with {type, label, position, interaction}
  - key_interactions: array of 3–4 primary interactions (describe action + outcome)
  - empty_states: how the screen looks with no data
  - annotations: array of 2–3 design rationale notes

Return ONLY valid JSON:
{
  "screens": [
    {
      "screen_name": "Home Screen",
      "screen_id": "SCR-001",
      "layout_type": "single-column",
      "viewport": "mobile",
      "ascii_layout": "┌─────────────────────┐\\n│  [STATUS BAR]       │\\n│─────────────────────│\\n│  [NAV: Logo  Search]│\\n│─────────────────────│\\n│  [HERO BANNER]      │\\n│  Title text         │\\n│  Subtitle text      │\\n│  [CTA BUTTON]       │\\n│─────────────────────│\\n│  SECTION HEADER     │\\n│  [CARD][CARD][CARD] │\\n│─────────────────────│\\n│  [BOTTOM TAB BAR]   │\\n└─────────────────────┘",
      "elements": [
        {"type": "nav-bar", "label": "Top Navigation", "position": "top", "interaction": "Tapping logo returns to home"},
        {"type": "card", "label": "Feature Card", "position": "body", "interaction": "Tapping navigates to detail screen"}
      ],
      "key_interactions": [
        "Tapping search icon opens search overlay",
        "Scrolling down loads more content via pagination"
      ],
      "empty_states": "Shows skeleton cards while loading; zero-state shows illustration with CTA",
      "annotations": [
        "Hero banner height capped at 40vh to keep content above fold on small screens",
        "Cards use 3-column grid only on tablets; single column on mobile"
      ]
    }
  ]
}""",
))


register(ToolEntry(
    name="visual_design",
    description=(
        "Generate high-fidelity visual design specifications applying design tokens to wireframes. "
        "Returns {screens: [...], design_rationale, handoff_notes}."
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

Apply the design system tokens to the wireframes. For each screen, describe exactly how it should
look with specific token references (never use raw hex values — reference token names).

For each screen:
  - screen_name: same as wireframe
  - screen_id: the SCR-xxx identifier
  - visual_description: 2–3 paragraphs describing the visual appearance in detail
  - color_applications: array of {element, token, reason} (how specific tokens are applied)
  - typography_applications: array of {element, style_token, content_type}
  - spacing_notes: array of {context, token, rationale}
  - component_specs: array of {component, variant, state, notes}
  - micro_interactions: array of {trigger, animation, duration, easing}
  - accessibility_notes: array of specific a11y requirements (cite WCAG where relevant)

Return ONLY valid JSON:
{
  "screens": [
    {
      "screen_name": "...",
      "screen_id": "SCR-001",
      "visual_description": "...",
      "color_applications": [
        {"element": "CTA Button", "token": "Primary Blue", "reason": "Draws attention to primary action"}
      ],
      "typography_applications": [
        {"element": "Page title", "style_token": "H1", "content_type": "heading"}
      ],
      "spacing_notes": [
        {"context": "Card padding", "token": "md (16px)", "rationale": "Sufficient breathing room on mobile"}
      ],
      "component_specs": [
        {"component": "Primary Button", "variant": "default", "state": "active", "notes": "Full-width on mobile"}
      ],
      "micro_interactions": [
        {"trigger": "Button tap", "animation": "Scale to 0.97", "duration": "100ms", "easing": "ease-out"}
      ],
      "accessibility_notes": [
        "CTA button meets WCAG AA 4.5:1 contrast on Primary Blue background",
        "Touch targets minimum 44×44pt per WCAG 2.5.8"
      ]
    }
  ],
  "design_rationale": "...",
  "handoff_notes": ["...", "...", "...", "...", "..."]
}""",
))


register(ToolEntry(
    name="validate_design",
    description=(
        "Run a structured usability and accessibility review of the visual designs against "
        "personas and journey maps. Returns {columns, rows, summary, total_issues, critical_count} "
        "for DataTable rendering."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "visual_designs":  {"type": "object"},
            "personas":        {"type": "object"},
            "journey_map":     {"type": "object"},
            "design_system":   {"type": "object"},
            "screen_inventory": {"type": "object"},
        },
        "required": ["visual_designs"],
    },
    output_key_hint="validation_report",
    system_prompt="""You are a UX evaluator and accessibility specialist conducting a structured design review.

Evaluate the visual designs against Nielsen's 10 usability heuristics and WCAG 2.1 AA criteria.
Cross-reference against persona pain points and journey map friction points to prioritise findings.

For each issue found, classify by:
  - heuristic: the violated usability heuristic or WCAG criterion (e.g., "H1: Visibility", "WCAG 1.4.3")
  - severity: "critical" | "high" | "medium" | "low"
  - severity maps to P0–P3 priority for DataTable rendering (critical=P0, high=P1, medium=P2, low=P3)

Produce 10–20 actionable findings. Use the DataTable output shape so the frontend can render it.

Return ONLY valid JSON:
{
  "columns": [
    {"key": "scr_id", "label": "Screen", "type": "badge"},
    {"key": "heuristic", "label": "Heuristic / Criterion", "type": "badge"},
    {"key": "persona_affected", "label": "Persona", "type": "persona"},
    {"key": "severity", "label": "Severity", "type": "priority"},
    {"key": "issue", "label": "Issue", "type": "text"},
    {"key": "recommendation", "label": "Recommendation", "type": "text"}
  ],
  "rows": [
    {
      "scr_id": "SCR-001",
      "heuristic": "H1: Visibility",
      "persona_affected": "...",
      "severity": "P1",
      "issue": "Loading state not communicated to user",
      "recommendation": "Add skeleton screen or spinner with ARIA live region"
    }
  ],
  "summary": "Brief paragraph summarising overall design quality and top 3 areas to fix",
  "total_issues": 0,
  "critical_count": 0
}""",
))


register(ToolEntry(
    name="handoff_spec",
    description=(
        "Generate the final developer handoff specification: annotated screen specs, "
        "component inventory, and implementation notes. Returns {screens: [...]} for CanvasPreview."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "visual_designs":      {"type": "object"},
            "design_system":       {"type": "object"},
            "screen_inventory":    {"type": "object"},
            "validation_report":   {"type": "object"},
        },
        "required": ["visual_designs", "design_system"],
    },
    output_key_hint="handoff_document",
    system_prompt="""You are a design technologist creating a developer handoff specification.

Produce a handoff document that gives engineers everything they need to build the product exactly
as designed. Each screen entry should contain the full spec as a structured text block that
developers can follow step-by-step.

For each screen, compose a detailed spec document in the `elements` field (as a multi-line string)
using this structure:
  SCREEN: [Name] [ID]
  ─────────────────────────────────
  LAYOUT: [layout_type] | VIEWPORT: [viewport]

  COMPONENTS:
  • [Component name] — [variant] — [state]
    Token: [color/typography/spacing tokens]
    Interaction: [what happens on interaction]
    A11y: [accessibility requirements]

  SPACING:
  • [Element pair]: [spacing_token] between them

  ANIMATIONS:
  • [Trigger] → [animation] [duration] [easing]

  ASSETS:
  • [Any icons, images, or other assets needed]

  NOTES:
  • [Any implementation-specific notes]

Return ONLY valid JSON:
{
  "screens": [
    {
      "name": "Screen Name",
      "screen_id": "SCR-001",
      "description": "1–2 sentence screen purpose for the developer",
      "elements": "SCREEN: Home  SCR-001\\n─────────────────────\\nLAYOUT: single-column | VIEWPORT: mobile\\n\\nCOMPONENTS:\\n• Top Nav Bar — default — sticky\\n  Token: background=Surface-Dark, text=Text-Primary\\n  Interaction: Scroll causes shadow elevation change\\n  A11y: role=navigation, aria-label=Main navigation\\n\\nSPACING:\\n• Nav to hero content: lg (24px)\\n\\nANIMATIONS:\\n• Page enter → fade-in 200ms ease-out\\n\\nNOTES:\\n• Use React Navigation for routing",
      "annotations": [
        "Token values are defined in design_system artifact",
        "Validate contrast ratios before shipping"
      ]
    }
  ],
  "component_inventory": [
    {"name": "...", "count": 0, "screens": ["SCR-001", "SCR-002"]}
  ],
  "implementation_notes": ["...", "...", "..."],
  "design_debt": ["...", "..."]
}""",
))
