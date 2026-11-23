"""Supervisor planning and specialist-agent selection."""

from __future__ import annotations

from app.schemas.agents import AgentTask, SupervisorPlan


class SupervisorAgent:
    """Select only the specialists needed for a supported legal task."""

    name = "supervisor"

    def plan(self, task: AgentTask) -> SupervisorPlan:
        routes = {
            "question": ["retrieval", "final_response"],
            "risk": ["retrieval", "clause_analysis", "risk_analysis", "final_response"],
            "obligation": ["retrieval", "clause_analysis", "obligation", "final_response"],
            "summary": ["retrieval", "clause_analysis", "summary", "final_response"],
            "comparison": ["comparison", "final_response"],
            "compliance": ["retrieval", "clause_analysis", "compliance", "final_response"],
        }
        selected = routes.get(task.task_type, ["retrieval", "final_response"])
        return SupervisorPlan(
            task_id=task.task_id, task_type=task.task_type, selected_agents=selected,
            execution_order=selected, rationale=f"Selected specialists for {task.task_type}.",
        )
