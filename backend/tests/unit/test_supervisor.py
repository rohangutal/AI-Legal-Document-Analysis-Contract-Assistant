from app.agents.supervisor import SupervisorAgent
from app.schemas.agents import AgentTask


def test_supervisor_selects_only_question_agents() -> None:
    plan = SupervisorAgent().plan(AgentTask(task_type="question", query="Who can terminate?"))

    assert plan.selected_agents == ["retrieval", "final_response"]
    assert plan.execution_order == plan.selected_agents


def test_supervisor_routes_risk_through_clause_and_risk_agents() -> None:
    plan = SupervisorAgent().plan(AgentTask(task_type="risk", query="Find material risks"))

    assert plan.selected_agents == ["retrieval", "clause_analysis", "risk_analysis", "final_response"]


def test_specialists_return_structured_results() -> None:
    from app.agents.specialists import RetrievalAgent

    result = RetrievalAgent().run(AgentTask(
        task_type="question", query="termination",
        input_data={"chunks": [{"chunk_id": "c1", "content": "Termination requires notice."}]},
    ))

    assert result.agent_name == "retrieval"
    assert result.evidence[0].citation.chunk_id == "c1"
