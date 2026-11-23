"""Deterministic specialist agents used by the Phase 2 supervisor.

Each agent uses the same structured result envelope. Provider calls remain in
the existing LLM service; these specialists are safe to run without an API key.
"""

from __future__ import annotations

from typing import Any

from app.agents.base import LegalAgent
from app.retrieval.hybrid import build_citation, hybrid_search
from app.schemas.agents import (
    AgentCitation,
    AgentConfidence,
    AgentEvidence,
    AgentFinding,
    AgentResult,
    AgentStatus,
    AgentTask,
    AgentTrace,
    AgentWarning,
)
from app.services.legal_analysis import compare_contracts, extract_clauses


def _trace(name: str) -> AgentTrace:
    return AgentTrace(agent_name=name, status=AgentStatus.COMPLETED)


def _evidence(chunk: dict[str, Any]) -> AgentEvidence:
    citation = str(chunk.get("citation") or build_citation(chunk))
    return AgentEvidence(
        chunk_id=str(chunk.get("chunk_id", "unknown")),
        content=str(chunk.get("content", "")),
        score=float(chunk["score"]) if chunk.get("score") is not None else None,
        citation=AgentCitation(
            citation_id=citation,
            chunk_id=str(chunk.get("chunk_id", "unknown")),
            document_name=str(chunk["document_name"]) if chunk.get("document_name") else None,
            page_number=chunk.get("page_number"),
            section_number=str(chunk["section_number"]) if chunk.get("section_number") else None,
            section_title=str(chunk["section_title"]) if chunk.get("section_title") else None,
        ),
        metadata={key: value for key, value in chunk.items() if key not in {"content", "embedding"}},
    )


class RetrievalAgent(LegalAgent):
    name = "retrieval"

    def run(self, task: AgentTask) -> AgentResult:
        chunks = list(task.input_data.get("chunks", []))
        results = hybrid_search(
            task.query,
            chunks,
            top_k=int(task.input_data.get("top_k", 5)),
            metadata_filters=task.input_data.get("metadata_filters"),
        ) if chunks else []
        evidence = [_evidence(item) for item in results]
        warnings = [] if evidence else [AgentWarning(code="insufficient_evidence", message="No source chunks matched the request.")]
        return AgentResult(agent_name=self.name, status=AgentStatus.COMPLETED, evidence=evidence, warnings=warnings, trace=_trace(self.name))


class ClauseAnalysisAgent(LegalAgent):
    name = "clause_analysis"

    def run(self, task: AgentTask) -> AgentResult:
        text = str(task.input_data.get("document_text", ""))
        clauses = extract_clauses(text)
        findings = [
            AgentFinding(
                finding_type="clause",
                title=str(clause.get("title") or clause["clause_type"]).title(),
                description=str(clause["text"]),
                severity=str(clause["risk_level"]),
                confidence=AgentConfidence(score=0.8, rationale="Extracted by deterministic clause rules."),
                source_agent=self.name,
                requires_human_review=clause["risk_level"] == "high",
            )
            for clause in clauses
        ]
        return AgentResult(agent_name=self.name, status=AgentStatus.COMPLETED, findings=findings, trace=_trace(self.name))


class RiskAnalysisAgent(LegalAgent):
    name = "risk_analysis"

    def run(self, task: AgentTask) -> AgentResult:
        clauses = task.input_data.get("clauses", [])
        findings = []
        for clause in clauses:
            if clause.get("risk_level") == "low":
                continue
            findings.append(AgentFinding(
                finding_type="risk",
                title=f"Potential {clause['clause_type']} concern",
                description="; ".join(clause.get("risk_reasons", [])) or str(clause["text"]),
                severity=str(clause["risk_level"]),
                confidence=AgentConfidence(score=0.8),
                source_agent=self.name,
                requires_human_review=True,
            ))
        return AgentResult(agent_name=self.name, status=AgentStatus.COMPLETED, findings=findings, trace=_trace(self.name))


class ObligationAgent(LegalAgent):
    name = "obligation"

    def run(self, task: AgentTask) -> AgentResult:
        findings = []
        for clause in task.input_data.get("clauses", []):
            for obligation in clause.get("obligations", []):
                findings.append(AgentFinding(
                    finding_type="obligation", title="Contractual obligation", description=str(obligation),
                    confidence=AgentConfidence(score=0.75), source_agent=self.name,
                    requires_human_review=True,
                    warnings=[AgentWarning(code="date_not_extracted", message="Deadline and responsible party require confirmation.")],
                ))
        return AgentResult(agent_name=self.name, status=AgentStatus.COMPLETED, findings=findings, trace=_trace(self.name))


class SummaryAgent(LegalAgent):
    name = "summary"

    def run(self, task: AgentTask) -> AgentResult:
        clauses = task.input_data.get("clauses", [])
        finding = AgentFinding(
            finding_type="summary", title="Evidence-based contract summary",
            description=f"The document contains {len(clauses)} analyzed clause block(s).",
            confidence=AgentConfidence(score=0.75), source_agent=self.name,
        )
        return AgentResult(agent_name=self.name, status=AgentStatus.COMPLETED, findings=[finding], trace=_trace(self.name))


class ComparisonAgent(LegalAgent):
    name = "comparison"

    def run(self, task: AgentTask) -> AgentResult:
        comparison = compare_contracts(str(task.input_data.get("original_text", "")), str(task.input_data.get("revised_text", "")))
        finding = AgentFinding(
            finding_type="comparison", title="Contract version comparison",
            description=f"Detected {comparison['modified_clauses']} modified clause(s).",
            confidence=AgentConfidence(score=0.9), source_agent=self.name,
        )
        return AgentResult(agent_name=self.name, status=AgentStatus.COMPLETED, findings=[finding], trace=_trace(self.name))


class ComplianceAgent(LegalAgent):
    name = "compliance"

    def run(self, task: AgentTask) -> AgentResult:
        policy = task.input_data.get("policy", {})
        text = str(task.input_data.get("document_text", "")).lower()
        missing = [name for name, phrase in policy.items() if str(phrase).lower() not in text]
        finding = AgentFinding(
            finding_type="compliance", title="Configurable policy check",
            description="Missing policy requirements: " + (", ".join(missing) if missing else "none"),
            confidence=AgentConfidence(score=0.85), source_agent=self.name,
            requires_human_review=bool(missing),
        )
        return AgentResult(agent_name=self.name, status=AgentStatus.COMPLETED, findings=[finding], trace=_trace(self.name))


class FinalResponseAgent(LegalAgent):
    name = "final_response"

    def run(self, task: AgentTask) -> AgentResult:
        findings = task.input_data.get("findings", [])
        response = "Structured findings were produced from the supplied evidence. Review the cited source text before relying on them."
        if findings:
            response += "\n\n" + "\n".join(f"- {item.title}: {item.description}" for item in findings)
        return AgentResult(agent_name=self.name, status=AgentStatus.COMPLETED, findings=findings, response=response, trace=_trace(self.name))


SPECIALIST_AGENTS: dict[str, type[LegalAgent]] = {
    agent.name: agent for agent in (
        RetrievalAgent(), ClauseAnalysisAgent(), RiskAnalysisAgent(), ObligationAgent(),
        SummaryAgent(), ComparisonAgent(), ComplianceAgent(), FinalResponseAgent(),
    )
}
