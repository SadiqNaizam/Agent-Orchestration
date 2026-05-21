"""
Resolution Layer — expand presets into nodes/edges, validate the graph,
and produce an ExecutionPlan.

Preset patterns supported
──────────────────────────
  main_sub_agent   main orchestrator ↔ sub-agents (looping, tool-routed)
  team             parallel or sequential member execution + optional merge
  hierarchical     strict vertical supervisor/subordinate chains

After expansion all presets are gone; only nodes + edges remain.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from models import (
    AgentDefinition, EdgeCondition, EdgeConfig, HitlConfig, LoopConfig,
    ModelConfig, NodeConfig, OrchestrationConfig,
)


class ResolutionError(ValueError):
    pass


# ── ExecutionPlan ──────────────────────────────────────────────────────────────

@dataclass
class ExecutionPlan:
    nodes: Dict[str, NodeConfig] = field(default_factory=dict)
    edges: List[EdgeConfig] = field(default_factory=list)
    # from_node → outgoing edges
    adjacency: Dict[str, List[EdgeConfig]] = field(default_factory=dict)
    # agent_id → AgentDefinition for dynamic spawning (main_sub_agent only)
    spawnable_agents: Dict[str, AgentDefinition] = field(default_factory=dict)


# ── Public entry-point ────────────────────────────────────────────────────────

def resolve(config: OrchestrationConfig) -> ExecutionPlan:
    """
    1. Expand every preset into concrete nodes and edges.
    2. Merge with explicit nodes / edges from the config.
    3. Validate the resulting graph.
    4. Return a ready-to-execute ExecutionPlan.
    """
    all_nodes: List[NodeConfig] = list(config.nodes)
    all_edges: List[EdgeConfig] = list(config.edges)
    spawnable_agents: Dict[str, AgentDefinition] = {}

    for preset_raw in config.presets:
        pattern = preset_raw.get("pattern")
        if pattern == "main_sub_agent":
            ns, es, spawnables = _expand_main_sub_agent(preset_raw)
            spawnable_agents.update(spawnables)
        elif pattern == "team":
            ns, es = _expand_team(preset_raw)
        elif pattern == "hierarchical":
            ns, es = _expand_hierarchical(preset_raw)
        else:
            raise ResolutionError(f"Unknown preset pattern: '{pattern}'")
        all_nodes.extend(ns)
        all_edges.extend(es)

    # Build nodes map
    nodes_map: Dict[str, NodeConfig] = {}
    for node in all_nodes:
        if node.node_id in nodes_map:
            raise ResolutionError(f"Duplicate node_id: '{node.node_id}'")
        nodes_map[node.node_id] = node

    # Validate edge references
    valid_ids = set(nodes_map.keys()) | {"__start__", "__end__", "__router__"}
    for edge in all_edges:
        if edge.from_node not in valid_ids:
            raise ResolutionError(
                f"Edge '{edge.edge_id}': unknown from_node '{edge.from_node}'"
            )
        if edge.to_node not in valid_ids:
            raise ResolutionError(
                f"Edge '{edge.edge_id}': unknown to_node '{edge.to_node}'"
            )

    if not all_edges and nodes_map:
        raise ResolutionError("No edges defined — cannot determine execution order.")

    adjacency: Dict[str, List[EdgeConfig]] = {}
    for edge in all_edges:
        adjacency.setdefault(edge.from_node, []).append(edge)

    return ExecutionPlan(
        nodes=nodes_map,
        edges=all_edges,
        adjacency=adjacency,
        spawnable_agents=spawnable_agents,
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _agent_def(raw: dict) -> AgentDefinition:
    m = raw.get("model", {})
    return AgentDefinition(
        agent_id=raw["agent_id"],
        name=raw.get("name"),
        description=raw.get("description"),
        system_prompt=raw.get("system_prompt", ""),
        instructions=raw.get("instructions", ""),
        model=ModelConfig(
            provider=m.get("provider", "openai"),
            model_name=m.get("model_name", "gpt-4o-mini"),
            temperature=m.get("temperature"),
            max_tokens=m.get("max_tokens"),
        ),
        tools=raw.get("tools", []),
    )


def _node(
    node_id: str,
    agent: AgentDefinition,
    context_mode: str = "scoped",
    hitl: Optional[HitlConfig] = None,
) -> NodeConfig:
    return NodeConfig(node_id=node_id, agent=agent, context_mode=context_mode, hitl=hitl)


def _hitl(raw: dict) -> Optional[HitlConfig]:
    """Extract and parse an optional 'hitl' entry from a preset raw dict."""
    h = raw.get("hitl")
    if not h:
        return None
    return HitlConfig(
        prompt=h["prompt"],
        input_key=h.get("input_key", "human_input"),
        timeout_seconds=h.get("timeout_seconds"),
    )


def _edge(
    edge_id: str,
    from_node: str,
    to_node: str,
    condition: Optional[EdgeCondition] = None,
    loop: Optional[LoopConfig] = None,
    default: bool = False,
) -> EdgeConfig:
    return EdgeConfig.model_validate({
        "edge_id": edge_id,
        "from": from_node,
        "to": to_node,
        "condition": condition.model_dump() if condition else None,
        "loop": loop.model_dump() if loop else None,
        "default": default,
    })


def _route_to_sub_agent_tool(sub_agent_ids: List[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": "route_to_sub_agent",
            "description": (
                "Delegate the current task to a specialised sub-agent. "
                "Call this when you need another agent's expertise."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "enum": sub_agent_ids,
                        "description": "ID of the sub-agent to route to",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why you are routing to this sub-agent",
                    },
                },
                "required": ["agent_id"],
            },
        },
    }


def _spawn_agent_tool(spawnable_ids: List[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": "spawn_agent",
            "description": (
                "Dynamically spawn a specialised agent for a sub-task and get its output."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "enum": spawnable_ids,
                        "description": "ID of the agent to spawn",
                    },
                    "input": {
                        "type": "object",
                        "description": "Input data to pass to the spawned agent",
                    },
                },
                "required": ["agent_id", "input"],
            },
        },
    }


def _final_response_tool(exit_signal: str) -> dict:
    return {
        "type": "function",
        "function": {
            "name": "final_response",
            "description": (
                f"Call this when the overall task is complete to emit the '{exit_signal}' signal "
                "and end the orchestration."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "response": {
                        "type": "string",
                        "description": "The final response or summary",
                    },
                },
                "required": ["response"],
            },
        },
    }


# ── Preset expanders ───────────────────────────────────────────────────────────

def _expand_main_sub_agent(raw: dict):
    """
    main_sub_agent expansion
    ─────────────────────────
    The main agent uses tools to route to sub-agents or signal completion.

      __start__ → main (loop)
        main calls route_to_sub_agent → sub_N
        sub_N → main  (return)
        main calls final_response → __end__
      main → main (default loop-back)
    """
    pid         = raw["preset_id"]
    main_raw    = raw["main_agent"]
    subs_raw    = raw.get("sub_agents", [])
    spawn_raw   = raw.get("spawnable_agents", [])
    max_iter    = raw.get("max_iterations", 10)
    exit_signal = raw.get("exit_signal", "final_response")

    main_agent  = _agent_def(main_raw)
    main_id     = f"{pid}_{main_agent.agent_id}"

    # Build sub-agent list and their node IDs
    sub_agents  = [(_agent_def(s["agent"]), s.get("context_mode", "scoped")) for s in subs_raw]
    sub_ids     = [sa.agent_id for sa, _ in sub_agents]

    # Build spawnable pool
    spawnables  = {_agent_def(s).agent_id: _agent_def(s) for s in spawn_raw}
    spawn_ids   = list(spawnables.keys())

    # Inject orchestration tools into main agent
    tools = []
    if sub_ids:
        tools.append(_route_to_sub_agent_tool(sub_ids))
    if spawn_ids:
        tools.append(_spawn_agent_tool(spawn_ids))
    tools.append(_final_response_tool(exit_signal))
    main_agent.tools = tools

    nodes = [_node(main_id, main_agent, "shared", hitl=_hitl(main_raw))]
    edges = [_edge(f"{pid}_start", "__start__", main_id)]

    for (sa, cm), sub_raw in zip(sub_agents, subs_raw):
        sa_node_id = f"{pid}_{sa.agent_id}"
        nodes.append(_node(sa_node_id, sa, cm, hitl=_hitl(sub_raw)))
        # main → sub (condition: main output signals this sub-agent)
        edges.append(_edge(
            f"{pid}_to_{sa.agent_id}", main_id, sa_node_id,
            condition=EdgeCondition(
                type="deterministic",
                expression=f"$.{main_id}.output.next_agent == '{sa.agent_id}'",
            ),
        ))
        # sub → main (return)
        edges.append(_edge(f"{pid}_{sa.agent_id}_return", sa_node_id, main_id))

    # Exit edge (main calls final_response tool → output.signal == exit_signal)
    edges.append(_edge(
        f"{pid}_exit", main_id, "__end__",
        condition=EdgeCondition(
            type="deterministic",
            expression=f"$.{main_id}.output.signal == '{exit_signal}'",
        ),
    ))
    # Default loop-back
    edges.append(_edge(f"{pid}_loop", main_id, main_id, default=True))

    return nodes, edges, spawnables


def _expand_team(raw: dict):
    """
    team expansion
    ───────────────
    sequential: __start__ → m1 → m2 → … → [merge] → __end__
    parallel:   fan-out (serialised in Phase 1) → merge → __end__
    """
    pid       = raw["preset_id"]
    members   = raw.get("members", [])
    execution = raw.get("execution", "sequential")
    sharing   = raw.get("context_sharing", "shared")
    strategy  = raw.get("merge_strategy", "concatenate")
    merge_raw = raw.get("merge_agent")

    cm = "shared" if sharing == "shared" else "scoped"
    nodes, edges, member_ids = [], [], []

    for m in members:
        ma      = _agent_def(m["agent"])
        node_id = f"{pid}_{ma.agent_id}"
        member_ids.append(node_id)
        nodes.append(_node(node_id, ma, cm, hitl=_hitl(m)))

    prev = "__start__"
    for nid in member_ids:
        edges.append(_edge(f"{pid}_e_{prev}_{nid}", prev, nid))
        prev = nid

    if strategy == "summarize" and merge_raw:
        ma       = _agent_def(merge_raw)
        merge_id = f"{pid}_merge"
        nodes.append(_node(merge_id, ma, "shared", hitl=_hitl(merge_raw)))
        edges.append(_edge(f"{pid}_to_merge", prev, merge_id))
        edges.append(_edge(f"{pid}_merge_end", merge_id, "__end__"))
    else:
        edges.append(_edge(f"{pid}_end", prev, "__end__"))

    return nodes, edges


def _expand_hierarchical(raw: dict):
    """
    hierarchical expansion
    ───────────────────────
    Strict vertical: supervisor → subordinates → back to supervisor.
    """
    pid    = raw["preset_id"]
    levels = raw.get("levels", [])
    nodes, edges = [], []
    top_sup_id   = None

    for lvl_idx, lvl in enumerate(levels):
        sup    = _agent_def(lvl["supervisor"])
        sup_id = f"{pid}_{sup.agent_id}"

        if lvl_idx == 0:
            top_sup_id = sup_id
            nodes.append(_node(sup_id, sup, "shared", hitl=_hitl(lvl["supervisor"])))
            edges.append(_edge(f"{pid}_start", "__start__", sup_id))
        else:
            nodes.append(_node(sup_id, sup, "scoped", hitl=_hitl(lvl["supervisor"])))

        for sub_raw in lvl.get("subordinates", []):
            sub    = _agent_def(sub_raw["agent"])
            sub_id = f"{pid}_{sub.agent_id}"
            cm     = sub_raw.get("context_mode", "scoped")
            nodes.append(_node(sub_id, sub, cm, hitl=_hitl(sub_raw)))
            edges.append(_edge(f"{pid}_{sup.agent_id}_to_{sub.agent_id}", sup_id, sub_id))
            edges.append(_edge(f"{pid}_{sub.agent_id}_return", sub_id, sup_id))

    if top_sup_id:
        edges.append(_edge(f"{pid}_end", top_sup_id, "__end__", default=True))

    return nodes, edges
