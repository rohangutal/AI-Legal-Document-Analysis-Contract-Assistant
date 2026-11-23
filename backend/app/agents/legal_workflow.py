"""LangGraph workflow for routed, evidence-first legal analysis.

The graph is intentionally model-provider neutral. A future LLM response node
can be injected after retrieval without changing routing, state, or evidence
validation. The default response builder is deterministic and refuses to make
unsupported legal conclusions.
"""

from __future__ import annotations

from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from app.retrieval.hybrid import build_citation, hybrid_search
from app.services.legal_analysis import extract_clauses
from app.services.llm import generate_grounded_response


Task = Literal["question", "risk", "obligation", "summary"]


class LegalWorkflowState(TypedDict, total=False):
    task: Task
    question: str
    document_text: str
    chunks: list[dict[str, object]]
    top_k: int
    retrieval_query: str
    retrieved: list[dict[str, object]]
    clauses: list[dict[str, object]]
    risks: list[dict[str, object]]
    obligations: list[dict[str, object]]
    citations: list[str]
    evidence_valid: bool
    warnings: list[str]
    answer: str


def build_legal_workflow():
    """Compile the routed legal workflow graph."""
    graph = StateGraph(LegalWorkflowState)
    graph.add_node("understand_query", understand_query)
    graph.add_node("retrieve", retrieve)
    graph.add_node("extract_clauses", extract)
    graph.add_node("analyze_risks", analyze_risks)
    graph.add_node("extract_obligations", extract_obligations)
    graph.add_node("validate_evidence", validate_evidence)
    graph.add_node("generate_response", generate_response)
    graph.add_edge(START, "understand_query")
    graph.add_conditional_edges(
        "understand_query",
        route_task,
        {"retrieve": "retrieve", "extract": "extract_clauses"},
    )
    graph.add_conditional_edges(
        "extract_clauses",
        route_extraction,
        {"risk": "analyze_risks", "obligation": "extract_obligations", "summary": "validate_evidence"},
    )
    graph.add_edge("retrieve", "validate_evidence")
    graph.add_edge("analyze_risks", "validate_evidence")
    graph.add_edge("extract_obligations", "validate_evidence")
    graph.add_edge("validate_evidence", "generate_response")
    graph.add_edge("generate_response", END)
    return graph.compile()


def run_legal_workflow(
    *,
    task: Task,
    question: str = "",
    document_text: str = "",
    chunks: list[dict[str, object]] | None = None,
    top_k: int = 5,
) -> LegalWorkflowState:
    """Run one legal task through the appropriate graph branches."""
    return build_legal_workflow().invoke(
        {
            "task": task,
            "question": question,
            "document_text": document_text,
            "chunks": chunks or [],
            "top_k": top_k,
            "warnings": [],
        }
    )


def understand_query(state: LegalWorkflowState) -> dict[str, object]:
    query = state.get("question", "").strip()
    return {"retrieval_query": query or state.get("task", "legal document analysis")}


def route_task(state: LegalWorkflowState) -> str:
    return "retrieve" if state.get("task") == "question" else "extract"


def retrieve(state: LegalWorkflowState) -> dict[str, object]:
    chunks = list(state.get("chunks", []))
    if not chunks and state.get("document_text", "").strip():
        chunks = [{
            "chunk_id": "document-text",
            "content": state["document_text"],
            "document_name": "Uploaded document",
            "page_number": None,
            "section_number": None,
            "section_title": None,
        }]
    q = state.get("retrieval_query", "")
    q_lower = q.lower()
    is_broad = any(k in q_lower for k in ("summar", "overview", "what is this", "key term", "parties", "explain", "findings", "provisions", "audit"))
    k = max(state.get("top_k", 5), 10 if is_broad else 6)
    results = hybrid_search(
        q,
        chunks,
        top_k=k,
    )
    return {"retrieved": results, "citations": [str(item["citation"]) for item in results]}


def extract(state: LegalWorkflowState) -> dict[str, object]:
    text = state.get("document_text", "")
    if not text:
        text = "\n\n".join(str(chunk.get("content", "")) for chunk in state.get("chunks", []))
    source_chunks = []
    for chunk in state.get("chunks", []):
        source = dict(chunk)
        source["citation"] = build_citation(source)
        source_chunks.append(source)
    return {"clauses": extract_clauses(text), "retrieved": source_chunks}


def route_extraction(state: LegalWorkflowState) -> str:
    task = state.get("task")
    return task if task in {"risk", "obligation", "summary"} else "summary"


def analyze_risks(state: LegalWorkflowState) -> dict[str, object]:
    risks = [
        {
            "title": f"Potential {clause['clause_type']} concern",
            "severity": clause["risk_level"],
            "reasons": clause["risk_reasons"],
            "clause": clause["text"],
        }
        for clause in state.get("clauses", [])
        if clause["risk_level"] != "low"
    ]
    return {"risks": risks}


def extract_obligations(state: LegalWorkflowState) -> dict[str, object]:
    obligations = []
    for clause in state.get("clauses", []):
        for text in clause["obligations"]:
            obligations.append(
                {
                    "text": text,
                    "source_clause": clause["clause_type"],
                    "due_date": None,
                    "requires_clarification": True,
                }
            )
    return {"obligations": obligations}


def validate_evidence(state: LegalWorkflowState) -> dict[str, object]:
    citations = state.get("citations", [])
    warnings = list(state.get("warnings", []))
    if not citations:
        warnings.append("No chunk-level source evidence was provided; review the original document.")
    return {"evidence_valid": bool(citations), "warnings": warnings}


def generate_response(state: LegalWorkflowState) -> dict[str, object]:
    task = state.get("task")
    citations = list(state.get("citations", []))
    evidence = list(state.get("retrieved", []))
    if not evidence and state.get("clauses"):
        evidence = [
            {"content": clause.get("text", ""), "citation": f"Source clause {index + 1}", "clause_category": clause.get("clause_type")}
            for index, clause in enumerate(state.get("clauses", []))
        ]
        if not citations:
            citations = [item["citation"] for item in evidence]
    llm_evidence = [item for item in evidence if item.get("citation")] or evidence
    if task == "question":
        if not evidence:
            answer = "Insufficient source evidence was retrieved to answer this question. Please ensure contract clauses are available."
        else:
            evidence_str = "\n".join(f"- {item.get('content', '')} ({item.get('citation', '')})" for item in evidence)
            fallback = f"Relevant contractual evidence:\n{evidence_str}"
            answer = generate_grounded_response(
                task=str(task),
                question=str(state.get("question", "")),
                evidence=llm_evidence,
                fallback=fallback,
            )
    elif task == "risk":
        fallback = f"Potential risks identified: {len(state.get('risks', []))}. These are review flags, not legal conclusions."
        answer = generate_grounded_response(task=str(task), question=str(state.get("question", "")), evidence=llm_evidence, fallback=fallback)
        if "not legal conclusions" not in answer:
            answer += "\n\nNote: These identified items are review flags, not legal conclusions."
    elif task == "obligation":
        fallback = f"Potential obligations identified: {len(state.get('obligations', []))}. Relative or unclear dates require clarification."
        answer = generate_grounded_response(task=str(task), question=str(state.get("question", "")), evidence=llm_evidence, fallback=fallback)
    else:
        fallback = f"The document was divided into {len(state.get('clauses', []))} analyzed clause blocks."
        answer = generate_grounded_response(task=str(task), question=str(state.get("question", "")), evidence=llm_evidence, fallback=fallback)
    if citations and "Sources:" not in answer:
        answer += "\n\nSources:\n" + "\n".join(f"- {citation}" for citation in citations)
    return {"answer": answer}
