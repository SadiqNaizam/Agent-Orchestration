from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal


# ── Model / Agent primitives ───────────────────────────────────────────────────

class ModelConfig(BaseModel):
    provider: str = "openai"           # openai | anthropic | gemini | azure | ollama
    model_name: str = "gpt-4o-mini"    # LiteLLM model identifier
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None


class AgentDefinition(BaseModel):
    agent_id: str
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: str
    instructions: str
    model: ModelConfig = Field(default_factory=ModelConfig)
    tools: List[Dict[str, Any]] = []
    output_schema: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


# ── Node ──────────────────────────────────────────────────────────────────────

class NodeErrorPolicy(BaseModel):
    policy: Literal["retry", "fallback", "skip", "fail"] = "fail"
    max_attempts: int = 3
    backoff: Literal["none", "linear", "exponential"] = "none"
    backoff_base_seconds: float = 1.0
    fallback_node: Optional[str] = None
    emit_warning: bool = True


class NodeConfig(BaseModel):
    node_id: str
    agent: AgentDefinition
    context_mode: Literal["shared", "scoped"] = "scoped"
    input_mapping: Dict[str, str] = {}   # local_key → JSONPath expression
    output_mapping: Dict[str, str] = {}  # blackboard_key → (reserved for future use)
    error_policy: Optional[NodeErrorPolicy] = None
    hitl: Optional["HitlConfig"] = None


# ── Edge ──────────────────────────────────────────────────────────────────────

class EdgeCondition(BaseModel):
    type: Literal["deterministic", "llm_router"] = "deterministic"
    expression: Optional[str] = None          # JSONPath boolean expression
    router_agent_ref: Optional[str] = None    # for llm_router
    candidates: Optional[List[str]] = None
    routing_context_keys: Optional[List[str]] = None


class LoopConfig(BaseModel):
    loop_id: str
    max_iterations: int
    exit_condition: str   # JSONPath boolean expression


class EdgeConfig(BaseModel):
    """
    Uses 'from' / 'to' aliases to match the JSON schema spec.
    Python code accesses edges via .from_node / .to_node.
    """
    model_config = ConfigDict(populate_by_name=True)

    edge_id: str
    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")
    condition: Optional[EdgeCondition] = None
    default: bool = False
    loop: Optional[LoopConfig] = None


# ── Global error policy ────────────────────────────────────────────────────────

class GlobalErrorPolicy(BaseModel):
    default: Literal["retry", "fallback", "skip", "fail"] = "fail"
    per_node: Optional[Dict[str, NodeErrorPolicy]] = None


# ── Compaction ─────────────────────────────────────────────────────────────────

class CompactionAgentDef(BaseModel):
    agent_id: str = "context_compactor"
    name: Optional[str] = None
    system_prompt: str = "You are a context compression specialist. Preserve all key facts and decisions."
    instructions: str = "Summarise the provided context entries into a compact form while preserving all key facts."
    model: ModelConfig = Field(default_factory=ModelConfig)


class CompactionConfig(BaseModel):
    enabled: bool = False
    token_threshold: int = 80000
    compaction_agent: Optional[CompactionAgentDef] = None
    strategy: str = "summarize_oldest"
    preserve_keys: List[str] = Field(default_factory=lambda: ["__input__"])
    min_recency_window: int = 2


# ── HITL ───────────────────────────────────────────────────────────────────────

class HitlConfig(BaseModel):
    prompt: str                           # Message shown to the human reviewer
    input_key: str = "human_input"        # Blackboard key suffix for the response
    timeout_seconds: Optional[int] = None # None = wait indefinitely


# Resolve forward reference in NodeConfig now that HitlConfig is defined
NodeConfig.model_rebuild()


# ── Streaming ─────────────────────────────────────────────────────────────────

class StreamingConfig(BaseModel):
    chunk_size_chars: int = 500
    provenance_enabled: bool = False


# ── Presets ────────────────────────────────────────────────────────────────────

class SubAgentEntry(BaseModel):
    agent: AgentDefinition
    context_mode: Literal["shared", "scoped"] = "scoped"


# ── Top-level orchestration config ─────────────────────────────────────────────

class OrchestrationConfig(BaseModel):
    orchestration_id: str = "orch-001"
    name: Optional[str] = None
    description: Optional[str] = None
    input_schema: Optional[Dict[str, Any]] = None

    nodes: List[NodeConfig] = []
    edges: List[EdgeConfig] = []
    presets: List[Dict[str, Any]] = []   # raw dicts; Resolution Layer parses them

    error_policy: Optional[GlobalErrorPolicy] = None
    compaction: Optional[CompactionConfig] = None
    streaming: Optional[StreamingConfig] = None

    # Runtime credentials — not stored, sent per-request for demo use
    api_key: Optional[str] = None
    api_key_type: Optional[str] = "openai"    # openai | anthropic | gemini | azure
    azure_endpoint: Optional[str] = None
    azure_api_version: Optional[str] = "2024-02-01"

    # Input data for this orchestration run
    input: Optional[Dict[str, Any]] = {}


# ── API response ───────────────────────────────────────────────────────────────

class JobResponse(BaseModel):
    job_id: str
    status: str = "queued"


class HitlResumeRequest(BaseModel):
    input: Dict[str, Any]


# ── Chat ───────────────────────────────────────────────────────────────────────

class ChatCreateRequest(BaseModel):
    agent: AgentDefinition
    compaction: Optional[CompactionConfig] = None
    api_key: Optional[str] = None
    api_key_type: str = "openai"
    azure_endpoint: Optional[str] = None
    azure_api_version: str = "2024-02-01"


class ChatSession(BaseModel):
    session_id: str
    agent: AgentDefinition
    messages: List[Dict[str, Any]] = []   # [{role: "user"|"assistant"|"system", content}]
    total_tokens: int = 0
    created_at: str
    compaction: Optional[CompactionConfig] = None
    api_key: Optional[str] = None
    api_key_type: str = "openai"
    azure_endpoint: Optional[str] = None
    azure_api_version: str = "2024-02-01"


class ChatMessageRequest(BaseModel):
    content: str


class ChatSessionInfo(BaseModel):
    session_id: str
    agent_id: str
    agent_name: Optional[str] = None
    created_at: str
    message_count: int
    total_tokens: int
