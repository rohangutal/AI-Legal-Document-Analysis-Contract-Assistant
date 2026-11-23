from app.agents.legal_workflow import run_legal_workflow


def test_question_workflow_retrieves_and_validates_evidence() -> None:
    state = run_legal_workflow(
        task="question",
        question="What are the termination conditions?",
        chunks=[
            {
                "chunk_id": "c-1",
                "document_name": "Vendor.pdf",
                "content": "Either party may terminate for cause on thirty days notice.",
                "page_number": 8,
                "section_number": "12.2",
            }
        ],
    )

    assert state["evidence_valid"] is True
    assert state["citations"]
    assert "terminate" in state["answer"].lower()
    assert state["supervisor_plan"]["selected_agents"] == ["retrieval", "final_response"]
    assert state["agent_results"]["retrieval"]["status"] == "completed"


def test_risk_workflow_uses_review_language_and_extracts_risk() -> None:
    state = run_legal_workflow(
        task="risk",
        document_text="The supplier has unlimited liability for all losses.",
    )

    assert len(state["risks"]) == 1
    assert state["risks"][0]["severity"] == "high"
    assert "not legal conclusions" in state["answer"]
    assert state["evidence_valid"] is False
    assert state["supervisor_plan"]["selected_agents"] == ["retrieval", "clause_analysis", "risk_analysis", "final_response"]
