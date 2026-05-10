from pydantic import BaseModel, Field
from typing import List, Optional, Literal


class AgentConfig(BaseModel):
    id: str
    name: str
    role: str
    goal: str
    backstory: Optional[str] = ""
    llm: str = "openai/gpt-4o-mini"
    verbose: bool = True


class TaskConfig(BaseModel):
    id: str
    description: str
    expected_output: str = "A detailed and accurate response to the task"
    agent_id: str


class FlowConfig(BaseModel):
    process: Literal["sequential", "hierarchical"] = "sequential"
    manager_llm: Optional[str] = "openai/gpt-4o-mini"


class OrchestrationPayload(BaseModel):
    agents: List[AgentConfig]
    tasks: List[TaskConfig]
    flow: FlowConfig
    api_key: Optional[str] = None
    api_key_type: Optional[str] = "openai"  # "openai" | "anthropic" | "gemini" | "azure"
    azure_endpoint: Optional[str] = None
    azure_api_version: Optional[str] = "2024-02-01"


class JobResponse(BaseModel):
    job_id: str
    status: str = "queued"
