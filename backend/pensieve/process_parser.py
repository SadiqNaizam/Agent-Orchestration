"""
Process.md parser — converts a process definition markdown file into structured
Python objects that the PensieveRunner can consume.

File format expected
────────────────────
  ---
  process_id: generate_ui_design
  version: 1.0.0
  label: "Generate UI Design"
  description: "..."
  default_model: gpt-4o
  ---

  ## State Schema
  | Artifact Key | Type | Produced By | Description |
  ...

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
  - **downstream_dependents:** market_analysis, user_persona
  - **accepts_feedback_from:** none
  - **feeds_back_to:** none
  - **ui_template:** variant_card_grid
  - **execution:** single

  ### Instructions
  #### Context for sub-agent
  ...
  #### Output requirements
  ...
  #### Quality criteria
  ...
  #### On user interaction
  ...

  ## Global Rules
  ...
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import yaml


# ── Data types ─────────────────────────────────────────────────────────────────

@dataclass
class ArtifactDeclaration:
    key: str
    type: str          # object | array | string
    produced_by: str   # step_id or "$input"
    description: str


@dataclass
class InteractionConfig:
    selection_required: bool = False
    review_required: bool = True
    chat_enabled: bool = True
    auto_advance: Optional[int] = None  # seconds, None = disabled


@dataclass
class StepMetadata:
    id: str
    phase_id: str
    phase_label: str
    label: str
    tool: str
    consumes: List[str]
    produces: str
    interaction: InteractionConfig
    downstream_dependents: List[str]
    accepts_feedback_from: List[str]
    feeds_back_to: List[str]
    ui_template: str
    execution: str = "single"
    order: int = 0


@dataclass
class StepInstructions:
    context_for_sub_agent: str = ""
    output_requirements: str = ""
    quality_criteria: str = ""
    on_user_interaction: str = ""


@dataclass
class ProcessDefinition:
    process_id: str
    version: str
    label: str
    description: str
    default_model: str
    state_schema: List[ArtifactDeclaration]
    steps: List[StepMetadata]
    global_rules: str
    step_instructions: Dict[str, StepInstructions]

    @property
    def steps_by_id(self) -> Dict[str, StepMetadata]:
        return {s.id: s for s in self.steps}

    @property
    def artifact_schema_by_key(self) -> Dict[str, ArtifactDeclaration]:
        return {a.key: a for a in self.state_schema}

    @property
    def phases(self) -> List[Dict[str, Any]]:
        """Returns ordered list of {phase_id, phase_label, steps}."""
        seen: Dict[str, Dict] = {}
        for step in self.steps:
            if step.phase_id not in seen:
                seen[step.phase_id] = {
                    "phase_id": step.phase_id,
                    "phase_label": step.phase_label,
                    "steps": [],
                }
            seen[step.phase_id]["steps"].append(step)
        return list(seen.values())


class ProcessParseError(ValueError):
    pass


# ── Public entry-point ────────────────────────────────────────────────────────

def parse_process_md(content: str) -> ProcessDefinition:
    """Parse a process.md string into a ProcessDefinition."""
    header       = _parse_frontmatter(content)
    state_schema = _parse_state_schema(content)
    steps, instr = _parse_steps(content)
    global_rules = _parse_global_rules(content)

    return ProcessDefinition(
        process_id=header.get("process_id", "unknown"),
        version=str(header.get("version", "1.0.0")),
        label=header.get("label", "Unknown Process"),
        description=header.get("description", ""),
        default_model=header.get("default_model", "gpt-4o"),
        state_schema=state_schema,
        steps=steps,
        global_rules=global_rules,
        step_instructions=instr,
    )


# ── Parsers ────────────────────────────────────────────────────────────────────

def _parse_frontmatter(content: str) -> Dict[str, Any]:
    m = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if not m:
        raise ProcessParseError("Missing YAML frontmatter (--- ... ---)")
    return yaml.safe_load(m.group(1)) or {}


def _parse_state_schema(content: str) -> List[ArtifactDeclaration]:
    m = re.search(r'## State Schema\s*\n(.*?)(?=\n#)', content, re.DOTALL)
    if not m:
        return []

    artifacts: List[ArtifactDeclaration] = []
    for line in m.group(1).split('\n'):
        line = line.strip()
        if not line.startswith('|') or not line.endswith('|'):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if len(cells) < 3:
            continue
        # Skip header / separator rows
        if cells[0].lower() in ('artifact key', 'artifact_key') or re.match(r'^-+$', cells[0]):
            continue
        artifacts.append(ArtifactDeclaration(
            key=cells[0],
            type=cells[1] if len(cells) > 1 else "object",
            produced_by=cells[2] if len(cells) > 2 else "$input",
            description=cells[3] if len(cells) > 3 else "",
        ))
    return artifacts


def _parse_steps(content: str) -> Tuple[List[StepMetadata], Dict[str, StepInstructions]]:
    steps: List[StepMetadata] = []
    instructions: Dict[str, StepInstructions] = {}
    order = 0

    phase_pat  = re.compile(r'^# Phase:\s*(.+)$', re.MULTILINE)
    phase_matches = list(phase_pat.finditer(content))

    for pi, pm in enumerate(phase_matches):
        phase_label = pm.group(1).strip()
        phase_id    = _to_snake(phase_label)

        p_start = pm.end()
        p_end   = phase_matches[pi + 1].start() if pi + 1 < len(phase_matches) else len(content)
        p_body  = content[p_start:p_end]

        step_pat    = re.compile(r'^## Step:\s*(.+)$', re.MULTILINE)
        step_matches = list(step_pat.finditer(p_body))

        for si, sm in enumerate(step_matches):
            step_label = sm.group(1).strip()
            s_start    = sm.end()
            s_end      = step_matches[si + 1].start() if si + 1 < len(step_matches) else len(p_body)
            s_body     = p_body[s_start:s_end]

            meta  = _parse_step_meta(s_body, step_label, phase_id, phase_label, order)
            instr = _parse_step_instructions(s_body)
            steps.append(meta)
            instructions[meta.id] = instr
            order += 1

    return steps, instructions


def _parse_step_meta(
    body: str, label: str, phase_id: str, phase_label: str, order: int
) -> StepMetadata:

    def field(name: str, default: str = "") -> str:
        m = re.search(rf'\*\*{re.escape(name)}:\*\*\s*(.+)', body)
        return m.group(1).strip() if m else default

    def lst(name: str) -> List[str]:
        v = field(name, "")
        if not v or v.lower() in ("none", "n/a", ""):
            return []
        return [x.strip() for x in v.split(',') if x.strip() and x.strip().lower() not in ("none", "n/a")]

    # Interaction block  (indented bullet list under **interaction:**)
    ic = InteractionConfig()
    ib = re.search(r'\*\*interaction:\*\*\s*\n((?:[ \t]+- .+\n?)+)', body, re.MULTILINE)
    if ib:
        bk = ib.group(1)
        def ifield(n: str, d: str = "") -> str:
            m = re.search(rf'{re.escape(n)}:\s*(.+)', bk)
            return m.group(1).strip() if m else d
        ic.selection_required = ifield("selection_required", "false").lower() == "true"
        ic.review_required    = ifield("review_required", "true").lower() == "true"
        ic.chat_enabled       = ifield("chat_enabled", "true").lower() == "true"
        adv = ifield("auto_advance", "none")
        if adv.lower() not in ("none", ""):
            try:
                ic.auto_advance = int(adv)
            except ValueError:
                pass

    step_id = field("id") or _to_snake(label)

    return StepMetadata(
        id=step_id,
        phase_id=phase_id,
        phase_label=phase_label,
        label=label,
        tool=field("tool"),
        consumes=lst("consumes"),
        produces=field("produces"),
        interaction=ic,
        downstream_dependents=lst("downstream_dependents"),
        accepts_feedback_from=lst("accepts_feedback_from"),
        feeds_back_to=lst("feeds_back_to"),
        ui_template=field("ui_template", "generic_json"),
        execution=field("execution", "single"),
        order=order,
    )


def _parse_step_instructions(body: str) -> StepInstructions:
    instr = StepInstructions()
    m = re.search(r'### Instructions\s*\n(.*?)(?=\n##|\Z)', body, re.DOTALL)
    if not m:
        return instr

    raw = m.group(1)
    parts = re.split(r'\n#### ', raw)
    for part in parts:
        part = part.strip()
        if not part:
            continue
        lines = part.split('\n', 1)
        title = lines[0].strip().lower()
        text  = lines[1].strip() if len(lines) > 1 else ""
        if 'context' in title:
            instr.context_for_sub_agent = text
        elif 'output' in title:
            instr.output_requirements = text
        elif 'quality' in title:
            instr.quality_criteria = text
        elif 'interaction' in title or 'user' in title:
            instr.on_user_interaction = text
    return instr


def _parse_global_rules(content: str) -> str:
    m = re.search(r'^## Global Rules\s*\n(.*?)(?=\n^#[^#]|\Z)', content, re.DOTALL | re.MULTILINE)
    return m.group(1).strip() if m else ""


# ── Utilities ──────────────────────────────────────────────────────────────────

def _to_snake(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
