import pytest
from pydantic import ValidationError

from app.agents.base import LegalAgent
from app.schemas.agents import (
    AgentCitation,
    AgentConfidence,
    AgentEvidence,
    AgentFinding,
    AgentResult,
    AgentStatus,
    AgentTask,
    AgentTrace,
)


def test_agent_finding_is_structured_and_serializable() -> None:
    citation = AgentCitation(citation_id="Vendor.pdf:p8:s12.2", chunk_id="c-1", page_number=8)
    evidence = AgentEvidence(chunk_id="c-1", content="Either party may terminate.", citation=citation)
    finding = AgentFinding(
        finding_type="termination",
        title="Termination right",
        description="The clause provides a termination right.",
        confidence=AgentConfidence(score=0.91),
        evidence=[evidence],
        citations=[citation],
        source_agent="retrieval",
    )

    payload = finding.model_dump(mode="json")

    assert payload["confidence"]["score"] == 0.91
    assert payload["citations"][0]["chunk_id"] == "c-1"


def test_agent_contracts_reject_invalid_confidence() -> None:
    with pytest.raises(ValidationError):
        AgentConfidence(score=1.1)


def test_common_agent_result_envelope() -> None:
    task = AgentTask(task_type="question", query="What can terminate the agreement?")
    result = AgentResult(
        agent_name="retrieval",
        status=AgentStatus.COMPLETED,
        trace=AgentTrace(agent_name="retrieval", status=AgentStatus.COMPLETED),
    )

    assert task.task_id
    assert result.model_dump(mode="json")["status"] == "completed"
    assert issubclass(LegalAgent, object)


def test_agent_task_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        AgentTask(task_type="question", unsupported_field=True)
