# Enterprise AI Knowledge Assistant

A modular enterprise knowledge assistant built around secure document ingestion, hybrid retrieval, and source grounded answers.

## Repository layout

- `backend/` — FastAPI application, domain models, services, migrations, and backend tests.
- `frontend/` — React and TypeScript application, organized by shared UI and product features.
- `infra/` — local and deployment infrastructure, container definitions, and operational scripts.
- `docs/` — architecture notes and technical decisions.
- `evaluation/` — retrieval and answer quality datasets and evaluation reports.
- `scripts/` — developer utilities and repeatable project tasks.

## Easy local start

From the repository root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

The script starts Docker Desktop, PostgreSQL, Redis, the FastAPI backend, and the Vite frontend,
then opens `http://localhost:5173`.

## Phases

Phase 1 established the repository structure. Phase 2 added the runnable FastAPI foundation. Phase 3 adds local PostgreSQL/pgvector and Redis services, SQLAlchemy models, and Alembic migrations. Phase 4 now adds document loaders, legal-aware section chunking, legal metadata persistence, hybrid keyword/vector ranking, metadata filters, similarity thresholds, and source citation construction. Authentication, file authorization, and external embedding credentials remain separate reviewed phases.

## Phase 4 API examples

The new endpoints are available under `/api/v1/legal`:

- `POST /clauses` — identify likely legal clauses, risks, and obligations from extracted text.
- `POST /compare` — return line-level additions, deletions, and replacements between versions.
- `POST /retrieve` — rank supplied chunks by query terms and return stable source citations.

Phase 4 migrations:

```powershell
cd backend
alembic upgrade head
```

Phase 5 adds the LangGraph legal workflow at `POST /api/v1/legal/workflow`. It routes question, risk, obligation, and summary tasks through only the required nodes, validates whether source evidence is available, and uses cautious review language for potential risks. The default response node is deterministic and provider-neutral; an LLM can be injected after retrieval and evidence validation without changing the workflow contract.

Phase 6 adds clause-aware contract analysis:

- `POST /api/v1/legal/compare` — compares clause categories and identifies added, removed, modified, and unchanged provisions.
- `POST /api/v1/legal/missing-clauses` — checks a contract-type-specific checklist and marks missing provisions for human review.
- `POST /api/v1/legal/summary` — returns a structured, source-preserving contract summary with dates, clauses, risks, obligations, and a professional-review notice.

The legal-domain persistence layer is also available through Alembic migration `0003_legal_domain_entities`. It stores contracts, parties, extracted clauses, risks, obligations, versions, clause comparisons, missing-clause checks, and risk-review history.

Authenticated contract APIs are available under `/api/v1/legal/contracts`. Configure `JWT_SECRET` in `backend/.env` with a random value of at least 32 characters before using registration, login, or contract resources. Registration always creates a standard analyst account; role elevation must be an administrator-controlled operation.

Review workflow APIs are available for human-controlled legal operations:

- `GET /api/v1/legal/contracts/{contract_id}/risks`
- `PATCH /api/v1/legal/risks/{risk_id}/review`
- `GET /api/v1/legal/contracts/{contract_id}/obligations`
- `GET /api/v1/legal/obligations`
- `PATCH /api/v1/legal/obligations/{obligation_id}`
- `PUT /api/v1/legal/documents/{document_id}/permissions/{user_id}`

Phase 7 adds the React/TypeScript legal dashboard in `frontend/`, including
contract intake, analysis, risk review, comparison, assistant, obligations,
and administration views.

Phase 8 adds a repeatable evaluation baseline. Run
`python .\evaluation\run_evaluation.py` from the repository root to generate
`evaluation/reports/legal_eval.json` and `evaluation/reports/legal_eval.md`.
The baseline is not a claim of legal accuracy; production evaluation requires
human-reviewed ground truth and authenticated integration/security testing.

Phase 9 adds production-like Docker packaging in `infra/docker-compose.prod.yml`,
container health checks, API readiness checks for PostgreSQL and Redis, and a
static Nginx build for the frontend. See `infra/README.md` for deployment
commands and secret requirements.

Phase 10 adds release hardening: security response headers, CI for backend and
frontend checks, and a production release checklist in
`docs/release-checklist.md`.

Phase 11 adds end-to-end launch validation through
`scripts/smoke-test.ps1` and documents the acceptance gate in
`docs/launch-validation.md`.

Phase 12 adds authenticated contract upload at
`POST /api/v1/legal/contracts/upload`. It validates PDF/DOCX/TXT files and the
configured size limit, stores originals under `UPLOAD_DIR`, creates legal-aware
source chunks, and links the uploaded document to a contract.

Phase 13 adds persisted analysis through
`POST /api/v1/legal/contracts/{contract_id}/analyze` and retrieval through
`GET /api/v1/legal/contracts/{contract_id}/analysis`. Clause, risk, and
obligation records are created from the uploaded source chunks and remain
traceable to the original document page and section metadata.

Phase 14 connects the dashboard upload screen to the real upload and analysis
endpoints. The UI now sends the selected document, waits for persisted analysis,
and shows API errors instead of creating a local demo contract.

Phase 15 finalizes acceptance and handoff documentation in
`docs/final-handoff.md`. Automated evaluation and frontend build checks pass;
backend pytest and live deployment smoke testing require the appropriate local
services and development dependencies.

For the easiest local run during development, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
```

This starts the local PostgreSQL and Redis containers, applies migrations, and
opens the backend and frontend in separate PowerShell windows.

## Planned technology

Python 3.11+, FastAPI, SQLAlchemy, Alembic, PostgreSQL with pgvector, Redis, LangChain/LangGraph, React, TypeScript, and Tailwind CSS.

## AI runtime configuration

The legal assistant uses LangGraph for task routing, clause-aware hybrid retrieval for evidence selection, and Gemini for grounded response generation when `GEMINI_API_KEY` and `LLM_ENABLED=true` are configured. If the provider is unavailable, the workflow returns a deterministic evidence-first response instead of fabricating an answer.

For a fresh checkout:

```powershell
Copy-Item .\backend\.env.example .\backend\.env
# Set JWT_SECRET and GEMINI_API_KEY in backend/.env
python -m pip install -e ".\backend[dev]"
powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
```

The frontend clears expired or invalid access tokens automatically and returns the user to sign-in. Keep `JWT_SECRET` stable across backend restarts; changing it invalidates all existing sessions.

## GenAI architecture phases

Phase 1 establishes shared structured agent contracts and runtime configuration
without changing the existing legal workflow API. The contracts live in
`backend/app/schemas/agents.py` and the common agent interface is in
`backend/app/agents/base.py`. Phase 2 will introduce supervisor-led routing and
specialized agents on top of these contracts.

Phase 2 implementation is now underway: the LangGraph starts with a supervisor
plan, selects the required specialist agents, and records structured agent
results in workflow state while preserving the existing API response contract.
