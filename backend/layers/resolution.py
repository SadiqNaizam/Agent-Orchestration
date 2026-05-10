"""
Resolution Layer — expand presets into nodes/edges, validate the graph,
and produce an ExecutionPlan.

Preset patterns supported
──────────────────────────
  main_sub_agent   main orchestrator ↔ sub-agents (looping)
  team             parallel or sequential member execution + optional merge
  hierarchical     strict vertical supervisor/subordinate chains

After expansion all presets are gone; only nodes + edges remain.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from models import (
    AgentDefinition, EdgeCondition, EdgeConfig, LoopConfig,
    ModelConfig, NodeConfig, NodeErrorPolicy, OrchestrationConfig,
)


class ResolutionError(ValueError):
    pass


# ── ExecutionPlan ──────────────────────────────────────────────────────────────

@dataclass
class ExecutionPlan:
    nodes: Dict[str, NodeConfig] = field(default_factory=dict)
    edges: List[EdgeConfig] = field(default_factory=list)
    # from_node → outgoing edges (built once; read-only during execution)
    adjacency: Dict[str, List[EdgeConfig]] = field(default_factory=dict)


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

    for preset_raw in config.presets:
        pattern = preset_raw.get("pattern")
        if pattern == "main_sub_agent":
            ns, es = _expand_main_sub_agent(preset_raw)
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
    valid_ids = set(nodes_map.keys()) | {"__start__", "__end__"}
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
        raise ResolutionError(
            "No edges defined — cannot determine execution order."
        )

    # Build adjacency
    adjacency: Dict[str, List[EdgeConfig]] = {}
    for edge in all_edges:
        adjacency.setdefault(edge.from_node, []).append(edge)

    return ExecutionPlan(nodes=nodes_map, edges=all_edges, adjacency=adjacency)


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
    )


def _node(node_id: str, agent: AgentDefinition, context_mode: str = "scoped") -> NodeConfig:
    return NodeConfig(node_id=node_id, agent=agent, context_mode=context_mode)


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


# ── Preset expanders ───────────────────────────────────────────────────────────

def _expand_main_sub_agent(raw: dict):
    """
    main_sub_agent expansion
    ─────────────────────────
      __start__ → main (loop until exit_signal)
        main → sub_N  (condition: main output selects sub by agent_id)
        sub_N → main  (return edge)
      main → __end__  (condition: exit_signal present)
      main → main     (default — keep looping)
    """
    pid = raw["preset_id"]
    main_agent  = _agent_def(raw["main_agent"])
    subs_raw    = raw.get("sub_agents", [])
    max_iter    = raw.get("max_iterations", 10)
    exit_signal = raw.get("exit_signal", "final_response")

    main_id = f"{pid}_{main_agent.agent_id}"

    sub_ids = [_agent_def(s["agent"]).agent_id for s in subs_raw]
    if sub_ids:
        main_agent.instructions += (
            f"\n\nAvailable sub-agents: {sub_ids}. "
            f"To route, output JSON with 'next_agent': '<agent_id>'. "
            f"When the task is complete, output JSON with 'signal': '{exit_signal}'."
        )

    nodes = [_node(main_id, main_agent, "shared")]
    edges = [_edge(f"{pid}_start", "__start__", main_id)]

    for s_raw in subs_raw:
        sa      = _agent_def(s_raw["agent"])
        sa_id   = f"{pid}_{sa.agent_id}"
        cm      = s_raw.get("context_mode", "scoped")
        nodes.append(_node(sa_id, sa, cm))
        edges.append(_edge(
            f"{pid}_to_{sa.agent_id}", main_id, sa_id,
            condition=EdgeCondition(
                type="deterministic",
                expression=f"$.{main_id}.output.next_agent == '{sa.agent_id}'",
            ),
        ))
        edges.append(_edge(f"{pid}_{sa.agent_id}_return", sa_id, main_id))

    edges.append(_edge(
        f"{pid}_exit", main_id, "__end__",
        condition=EdgeCondition(
            type="deterministic",
            expression=f"$.{main_id}.output.signal == '{exit_signal}'",
        ),
    ))
    edges.append(_edge(f"{pid}_loop", main_id, main_id, default=True))

    return nodes, edges


def _expand_team(raw: dict):
    """
    team expansion
    ───────────────
    sequential: __start__ → m1 → m2 → … → [merge] → __end__
    parallel:   fan-out from __start__ → all members, then merge → __end__
                (Phase 1: serialised — true async.gather in Phase 2)
    """
    pid       = raw["preset_id"]
    members   = raw.get("members", [])
    execution = raw.get("execution", "sequential")
    sharing   = raw.get("context_sharing", "shared")
    strategy  = raw.get("merge_strategy", "concatenate")
    merge_raw = raw.get("merge_agent")

    cm = "shared" if sharing == "shared" else "scoped"

    nodes, edges = [], []
    member_ids   = []

    for m in members:
        ma      = _agent_def(m["agent"])
        node_id = f"{pid}_{ma.agent_id}"
        member_ids.append(node_id)
        nodes.append(_node(node_id, ma, cm))

    if execution == "sequential":
        prev = "__start__"
        for nid in member_ids:
            edges.append(_edge(f"{pid}_e_{prev}_{nid}", prev, nid))
            prev = nid
        tail = prev
    else:
        # Parallel (serialised in Phase 1)
        prev = "__start__"
        for nid in member_ids:
            edges.append(_edge(f"{pid}_fan_{nid}", prev, nid))
            prev = nid
        tail = prev

    if strategy == "summarize" and merge_raw:
        ma       = _agent_def(merge_raw)
        merge_id = f"{pid}_merge"
        nodes.append(_node(merge_id, ma, "shared"))
        edges.append(_edge(f"{pid}_to_merge", tail, merge_id))
        edges.append(_edge(f"{pid}_merge_end", merge_id, "__end__"))
    else:
        edges.append(_edge(f"{pid}_end", tail, "__end__"))

    return nodes, edges


def _expand_hierarchical(raw: dict):
    """
    hierarchical expansion
    ───────────────────────
    Strict vertical: supervisor → subordinates → back to supervisor.
    Cross-branch communication must travel through the common supervisor.

    __start__ → top_supervisor (loop until done)
      supervisor → subordinate (delegation)
      subordinate → supervisor (report back)
    top_supervisor → __end__ (default)
    """
    pid    = raw["preset_id"]
    levels = raw.get("levels", [])

    nodes, edges   = [], []
    top_sup_id     = None

    for lvl_idx, lvl in enumerate(levels):
        sup    = _agent_def(lvl["supervisor"])
        sup_id = f"{pid}_{sup.agent_id}"

        if lvl_idx == 0:
            top_sup_id = sup_id
            nodes.append(_node(sup_id, sup, "shared"))
            edges.append(_edge(f"{pid}_start", "__start__", sup_id))
        else:
            nodes.append(_node(sup_id, sup, "scoped"))

        for sub_raw in lvl.get("subordinates", []):
            sub    = _agent_def(sub_raw["agent"])
            sub_id = f"{pid}_{sub.agent_id}"
            cm     = sub_raw.get("context_mode", "scoped")
            nodes.append(_node(sub_id, sub, cm))
            edges.append(_edge(f"{pid}_{sup.agent_id}_to_{sub.agent_id}", sup_id, sub_id))
            edges.append(_edge(f"{pid}_{sub.agent_id}_return", sub_id, sup_id))

    if top_sup_id:
        edges.append(_edge(f"{pid}_end", top_sup_id, "__end__", default=True))

    return nodes, edges
