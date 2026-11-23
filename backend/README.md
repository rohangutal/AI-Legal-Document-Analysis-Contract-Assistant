# Backend

The backend contains the FastAPI service, SQLAlchemy persistence layer, and Alembic migrations.

## Run locally

```powershell
cd backend
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload
```

Then open `http://localhost:8000/docs` or check `http://localhost:8000/api/v1/health`.

## Local persistence services

From the repository root, start PostgreSQL with pgvector and Redis:

```powershell
docker compose -f infra/docker-compose.yml up -d
cd backend
alembic upgrade head
```

Authentication, document processing, and AI integrations are intentionally deferred to later reviewed phases.

## Phase 1 agent contracts

`app.schemas.agents` contains the shared serializable contracts for agent tasks,
evidence, citations, findings, confidence, warnings, traces, supervisor plans,
verification results, and human-review requests. `app.agents.base.LegalAgent`
defines the common specialist-agent interface. The existing `/api/v1/legal/workflow`
response remains backward compatible; these contracts are the foundation for the
supervisor-led workflow in the next phase.

Phase 2 now adds `SupervisorAgent` and deterministic specialist agents in
`app/agents/supervisor.py` and `app/agents/specialists.py`. The existing
LangGraph begins with a supervisor planning node and keeps the public workflow
response unchanged while routing the supported question, risk, obligation, and
summary tasks through explicit specialist plans.

The following environment settings control the shared architecture:
`MAX_AGENT_ITERATIONS`, `MAX_EVIDENCE_CHUNKS`, `AGENT_CONFIDENCE_THRESHOLD`,
`VERIFICATION_THRESHOLD`, `LLM_TIMEOUT_SECONDS`, `TRACING_ENABLED`, and
`HUMAN_APPROVAL_REQUIRED`.
