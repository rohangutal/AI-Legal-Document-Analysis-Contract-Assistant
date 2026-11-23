"""Shared, serializable contracts for the legal agent architecture.

These models describe agent communication only. They do not make legal
determinations; generated findings remain review assistance and should be
validated against the cited source evidence.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class AgentStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class AgentTask(BaseModel):
    """A unit of work passed to a supervisor or specialist agent."""

    model_config = ConfigDict(extra="forbid")

    task_id: UUID = Field(default_factory=uuid4)
    task_type: str = Field(min_length=1)
    query: str = ""
    contract_id: UUID | None = None
    input_data: dict[str, Any] = Field(default_factory=dict)
    requested_agents: list[str] = Field(default_factory=list)


class AgentCitation(BaseModel):
    """Stable source reference attached to an agent claim."""

    model_config = ConfigDict(extra="forbid")

    citation_id: str = Field(min_length=1)
    chunk_id: str = Field(min_length=1)
    document_name: str | None = None
    page_number: int | None = None
    section_number: str | None = None
    section_title: str | None = None


class AgentEvidence(BaseModel):
    """A source chunk available to support a finding."""

    model_config = ConfigDict(extra="forbid")

    chunk_id: str = Field(min_length=1)
    content: str = Field(min_length=1)
    score: float | None = Field(default=None, ge=0.0, le=1.0)
    citation: AgentCitation
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentConfidence(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    rationale: str | None = None


class AgentWarning(BaseModel):
    code: str = Field(min_length=1)
    message: str = Field(min_length=1)
    severity: str = "warning"


class AgentFinding(BaseModel):
    """A structured claim produced by an agent, with evidence and review flags."""

    model_config = ConfigDict(extra="forbid")

    finding_type: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    severity: str | None = None
    confidence: AgentConfidence
    evidence: list[AgentEvidence] = Field(default_factory=list)
    citations: list[AgentCitation] = Field(default_factory=list)
    requires_human_review: bool = False
    source_agent: str = Field(min_length=1)
    warnings: list[AgentWarning] = Field(default_factory=list)


class AgentTrace(BaseModel):
    """Provider-neutral, privacy-conscious execution metadata."""

    trace_id: UUID = Field(default_factory=uuid4)
    request_id: str | None = None
    agent_name: str = Field(min_length=1)
    status: AgentStatus = AgentStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None
    latency_ms: float | None = Field(default=None, ge=0.0)
    model_name: str | None = None
    token_usage: int | None = Field(default=None, ge=0)
    error: str | None = None


class SupervisorPlan(BaseModel):
    """The supervisor's explicit execution plan for a user request."""

    task_id: UUID
    task_type: str = Field(min_length=1)
    selected_agents: list[str] = Field(default_factory=list)
    execution_order: list[str] = Field(default_factory=list)
    rationale: str = ""
    max_iterations: int = Field(default=3, ge=1)


class VerificationResult(BaseModel):
    passed: bool
    score: float = Field(ge=0.0, le=1.0)
    unsupported_claims: list[str] = Field(default_factory=list)
    missing_citations: list[str] = Field(default_factory=list)
    invalid_citations: list[str] = Field(default_factory=list)
    evidence_conflicts: list[str] = Field(default_factory=list)
    required_regeneration: bool = False
    warnings: list[AgentWarning] = Field(default_factory=list)


class HumanReviewRequest(BaseModel):
    finding_id: str = Field(min_length=1)
    finding_type: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    requested_by: str | None = None
    status: str = "pending_review"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AgentResult(BaseModel):
    """Common return envelope for every specialist agent."""

    agent_name: str = Field(min_length=1)
    status: AgentStatus
    findings: list[AgentFinding] = Field(default_factory=list)
    evidence: list[AgentEvidence] = Field(default_factory=list)
    warnings: list[AgentWarning] = Field(default_factory=list)
    trace: AgentTrace
    response: str | None = None

