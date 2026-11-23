"""Common interface for supervisor and specialist legal agents."""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.agents import AgentResult, AgentTask


class LegalAgent(ABC):
    """Base abstraction enforcing a structured result from each agent."""

    name: str

    @abstractmethod
    def run(self, task: AgentTask) -> AgentResult:
        """Execute a task and return a serializable structured result."""
        raise NotImplementedError

