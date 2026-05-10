"""
Definition Layer — parse and validate the OrchestrationConfig.

Responsibilities
────────────────
  - Ensure at least one node+edge pair or preset is present.
  - Validate required agent fields (system_prompt, instructions, model.model_name).
  - Validate compaction config if enabled.

The layer never executes anything; it only raises DefinitionError on invalid input.
"""

from models import OrchestrationConfig


class DefinitionError(ValueError):
    pass


def validate_config(config: OrchestrationConfig) -> None:
    """Raise DefinitionError if the config is structurally invalid."""

    has_explicit = bool(config.nodes) or bool(config.edges)
    has_presets  = bool(config.presets)

    if not has_explicit and not has_presets:
        raise DefinitionError(
            "Config must define at least one node + edge pair, or one preset."
        )

    for node in config.nodes:
        agent = node.agent
        if not agent.system_prompt.strip():
            raise DefinitionError(
                f"Node '{node.node_id}': agent.system_prompt is required."
            )
        if not agent.instructions.strip():
            raise DefinitionError(
                f"Node '{node.node_id}': agent.instructions is required."
            )
        if not agent.model.model_name.strip():
            raise DefinitionError(
                f"Node '{node.node_id}': agent.model.model_name is required."
            )

    if config.compaction and config.compaction.enabled:
        if not config.compaction.compaction_agent:
            raise DefinitionError(
                "compaction.enabled is true but compaction_agent is not defined."
            )
