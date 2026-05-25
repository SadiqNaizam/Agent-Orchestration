"""
Process parser — converts a process definition into structured Python objects.

Supports two formats:

1. Single file (process.md / agent.md)
   ─────────────────────────────────
   The classic format: one self-contained markdown file with frontmatter,
   state schema, phases/steps, an optional ## Tools section, and global rules.

2. Process pack (folder)
   ─────────────────────
   A directory with separated concerns:

     my-pack/
     ├── agent.md          ← phases, steps, state schema, global rules
     ├── tools/
     │   ├── analyze_problem.md   ← one tool per file
     │   └── plan_gtm.md
     └── skills/
         └── vc_analyst.md        ← reusable persona/expertise snippets

   Tool files: YAML frontmatter (name, description, output_key, model, skills)
               + body = system prompt text.

   Skill files: YAML frontmatter (name) + body = expertise text that gets
                prepended to any tool that lists it in `skills: [...]`.

   Tool files take precedence over an inline ## Tools section in agent.md.
   Both can coexist — agent.md ## Tools fills gaps not covered by tool files.

Public API
──────────
  parse_process_pack(files: Dict[str, str]) -> ProcessDefinition
      Primary entry-point. `files` maps relative paths to file contents,
      e.g. {"agent.md": "...", "tools/analyze.md": "..."}.

  parse_process_md(content: str) -> ProcessDefinition
      Backward-compat wrapper: treats a single string as a pack with only
      "agent.md" (or "process.md").
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
class SkillDef:
    """
    A reusable expertise / persona snippet.

    Skills are defined in skills/*.md files and referenced by tools via
    `skills: [skill_name, ...]` in their frontmatter.  The skill's content
    is prepended to the tool's system prompt at parse time.
    """
    name: str
    content: str   # raw text to prepend


@dataclass
class InlineToolDef:
    """
    A sub-agent tool whose system prompt is defined in the process pack
    (either in a tools/*.md file or in the ## Tools section of agent.md).
    """
    name: str
    description: str        # shown to the orchestrator LLM in tool choice
    output_key: str         # artifact key this tool writes (fallback if step.produces is empty)
    system_prompt: str      # complete system prompt (skills prepended at parse time)
    model_override: Optional[str] = None   # overrides process default_model for this tool
    skills: List[str] = field(default_factory=list)   # skill names that were applied


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
    inline_tools: Dict[str, InlineToolDef] = field(default_factory=dict)

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


# ── Public entry-points ────────────────────────────────────────────────────────

def parse_process_pack(files: Dict[str, str]) -> ProcessDefinition:
    """
    Parse a process pack from a dict of {relative_path: file_content}.

    Canonical layout::

        agent.md              ← required (also accepts process.md at root)
        tools/<name>.md       ← zero or more tool definitions
        skills/<name>.md      ← zero or more skill snippets

    Tools from files take precedence over the inline ## Tools section in agent.md
    (both are merged; file tools win on name conflict).
    """
    # ── Find main orchestration file ───────────────────────────────────────────
    # Accept agent.md, process.md, or any root-level *.md as fallback
    main_content = (
        files.get("agent.md") or
        files.get("process.md") or
        next(
            (v for k, v in sorted(files.items())
             if "/" not in k and k.endswith(".md")),
            None,
        )
    )
    if not main_content:
        raise ProcessParseError(
            "Process pack must contain agent.md (or process.md) at the root level."
        )

    # ── Parse skills ───────────────────────────────────────────────────────────
    skills: Dict[str, SkillDef] = {}
    for path, content in sorted(files.items()):
        if _is_under(path, "skills") and path.endswith(".md"):
            skill = _parse_skill_file(content, path)
            skills[skill.name] = skill

    # ── Parse tool files ───────────────────────────────────────────────────────
    tool_files: Dict[str, InlineToolDef] = {}
    for path, content in sorted(files.items()):
        if _is_under(path, "tools") and path.endswith(".md"):
            tool = _parse_tool_file(content, path, skills)
            tool_files[tool.name] = tool

    # ── Parse main orchestration file ─────────────────────────────────────────
    header       = _parse_frontmatter(main_content)
    state_schema = _parse_state_schema(main_content)
    steps, instr = _parse_steps(main_content)
    global_rules = _parse_global_rules(main_content)
    inline_tools = _parse_tools(main_content)   # from ## Tools section

    # Tool files win on name conflict (override inline ## Tools definitions)
    merged_tools = {**inline_tools, **tool_files}

    return ProcessDefinition(
        process_id   = header.get("process_id", "unknown"),
        version      = str(header.get("version", "1.0.0")),
        label        = header.get("label", "Unknown Process"),
        description  = header.get("description", ""),
        default_model= header.get("default_model", "gpt-4o"),
        state_schema = state_schema,
        steps        = steps,
        global_rules = global_rules,
        step_instructions = instr,
        inline_tools = merged_tools,
    )


def parse_process_md(content: str) -> ProcessDefinition:
    """
    Backward-compatible entry-point: parse a single process.md / agent.md string.
    Delegates to parse_process_pack with a single-file virtual pack.
    """
    return parse_process_pack({"agent.md": content})


# ── Tool / skill file parsers ──────────────────────────────────────────────────

def _parse_tool_file(
    content: str,
    path: str,
    skills: Dict[str, SkillDef],
) -> InlineToolDef:
    """
    Parse a tools/*.md file.

    Format::

        ---
        name: analyze_problem          # optional; derived from filename if absent
        description: One-line summary shown to the orchestrator LLM
        output_key: problem_analysis   # artifact key; derived from name if absent
        model: gpt-4o-mini             # optional model override
        skills:                        # optional list of skill names to prepend
          - vc_analyst
        ---

        Everything after the frontmatter is the system prompt.
        It may use any markdown formatting — the LLM receives the raw text.
    """
    fm, body = _split_frontmatter(content)

    filename_stem = _to_snake(path.split("/")[-1].replace(".md", ""))
    name          = _to_snake(fm.get("name", filename_stem))
    description   = fm.get("description", f"Run the {name} step")
    output_key    = _to_snake(fm.get("output_key", name))
    model_override = fm.get("model") or None
    skill_refs     = fm.get("skills") or []
    if isinstance(skill_refs, str):
        skill_refs = [s.strip() for s in skill_refs.split(",") if s.strip()]

    # Prepend referenced skills to the system prompt
    skill_content = "\n\n".join(
        skills[s].content for s in skill_refs if s in skills
    )
    system_prompt = (skill_content + "\n\n" + body).strip() if skill_content else body.strip()

    if not system_prompt:
        system_prompt = (
            f"You are an expert AI assistant performing the '{name}' step. "
            "Analyze the provided input carefully and return a detailed, "
            "well-structured JSON response."
        )

    return InlineToolDef(
        name           = name,
        description    = description,
        output_key     = output_key,
        system_prompt  = system_prompt,
        model_override = model_override,
        skills         = skill_refs,
    )


def _parse_skill_file(content: str, path: str) -> SkillDef:
    """
    Parse a skills/*.md file.

    Format::

        ---
        name: vc_analyst    # optional; derived from filename if absent
        ---

        You are a venture capital analyst with 20 years of experience…
        [rest of body = expertise text injected into tool prompts]
    """
    fm, body = _split_frontmatter(content)
    filename_stem = _to_snake(path.split("/")[-1].replace(".md", ""))
    name          = _to_snake(fm.get("name", filename_stem))
    return SkillDef(name=name, content=body.strip())


def _split_frontmatter(content: str) -> Tuple[Dict[str, Any], str]:
    """Split a markdown file into (frontmatter_dict, body_text)."""
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n?', content, re.DOTALL)
    if m:
        fm   = yaml.safe_load(m.group(1)) or {}
        body = content[m.end():]
    else:
        fm   = {}
        body = content
    return fm, body


# ── Agent.md parsers (unchanged internals) ─────────────────────────────────────

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
        if cells[0].lower() in ('artifact key', 'artifact_key') or re.match(r'^-+$', cells[0]):
            continue
        artifacts.append(ArtifactDeclaration(
            key         = cells[0],
            type        = cells[1] if len(cells) > 1 else "object",
            produced_by = cells[2] if len(cells) > 2 else "$input",
            description = cells[3] if len(cells) > 3 else "",
        ))
    return artifacts


def _parse_steps(content: str) -> Tuple[List[StepMetadata], Dict[str, StepInstructions]]:
    steps: List[StepMetadata] = []
    instructions: Dict[str, StepInstructions] = {}
    order = 0

    phase_pat     = re.compile(r'^# Phase:\s*(.+)$', re.MULTILINE)
    phase_matches = list(phase_pat.finditer(content))

    for pi, pm in enumerate(phase_matches):
        phase_label = pm.group(1).strip()
        phase_id    = _to_snake(phase_label)

        p_start = pm.end()
        p_end   = phase_matches[pi + 1].start() if pi + 1 < len(phase_matches) else len(content)
        p_body  = content[p_start:p_end]

        step_pat     = re.compile(r'^## Step:\s*(.+)$', re.MULTILINE)
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
        id                    = step_id,
        phase_id              = phase_id,
        phase_label           = phase_label,
        label                 = label,
        tool                  = field("tool"),
        consumes              = lst("consumes"),
        produces              = field("produces"),
        interaction           = ic,
        downstream_dependents = lst("downstream_dependents"),
        accepts_feedback_from = lst("accepts_feedback_from"),
        feeds_back_to         = lst("feeds_back_to"),
        ui_template           = field("ui_template", "generic_json"),
        execution             = field("execution", "single"),
        order                 = order,
    )


def _parse_step_instructions(body: str) -> StepInstructions:
    instr = StepInstructions()
    m = re.search(r'### Instructions\s*\n(.*?)(?=\n##|\Z)', body, re.DOTALL)
    if not m:
        return instr

    raw   = m.group(1)
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


def _parse_tools(content: str) -> Dict[str, InlineToolDef]:
    """Parse the optional ## Tools section in agent.md for inline tool definitions."""
    m = re.search(r'^## Tools\s*\n(.*?)(?=\n^#[^#]|\Z)', content, re.DOTALL | re.MULTILINE)
    if not m:
        return {}

    tools_body = m.group(1)
    tools: Dict[str, InlineToolDef] = {}

    tool_pat     = re.compile(r'^### Tool:\s*(.+)$', re.MULTILINE)
    tool_matches = list(tool_pat.finditer(tools_body))

    for ti, tm in enumerate(tool_matches):
        tool_name = _to_snake(tm.group(1).strip())
        t_start   = tm.end()
        t_end     = tool_matches[ti + 1].start() if ti + 1 < len(tool_matches) else len(tools_body)
        t_body    = tools_body[t_start:t_end]

        def tfield(name: str, default: str = "", _body: str = t_body) -> str:
            mx = re.search(rf'\*\*{re.escape(name)}\*\*:\s*(.+)', _body)
            return mx.group(1).strip() if mx else default

        description = tfield("description", f"Run the {tool_name} step")
        output_key  = tfield("output_key", _to_snake(tool_name))

        sp_m = re.search(r'#### System Prompt\s*\n(.*?)(?=\n####|\Z)', t_body, re.DOTALL)
        system_prompt = sp_m.group(1).strip() if sp_m else ""

        if not system_prompt:
            system_prompt = (
                f"You are an expert AI assistant performing the '{tool_name}' step. "
                "Analyze the provided input carefully and return a detailed, well-structured JSON response."
            )

        tools[tool_name] = InlineToolDef(
            name          = tool_name,
            description   = description,
            output_key    = output_key,
            system_prompt = system_prompt,
        )

    return tools


# ── Utilities ──────────────────────────────────────────────────────────────────

def _to_snake(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')


def _is_under(path: str, folder: str) -> bool:
    """Return True if `path` is directly under `folder/`."""
    parts = path.replace("\\", "/").split("/")
    return len(parts) >= 2 and parts[0] == folder
