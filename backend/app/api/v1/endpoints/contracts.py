"""Authenticated contract resources."""

import hashlib
import uuid
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.ingestion.legal_chunker import chunk_legal_document
from app.ingestion.loaders import UnsupportedDocumentType, load_document
from app.models.entities import Contract, ContractObligation, ContractRisk, ExtractedClause, Document, DocumentChunk, User
from app.schemas.contracts import ContractAnalysisResponse, ContractCreate, ContractListResponse, ContractResponse
from app.services.contract_processing import analyze_persisted_contract

router = APIRouter(prefix="/legal/contracts", tags=["contracts"])

_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}


@router.post("/upload", response_model=ContractResponse, status_code=status.HTTP_201_CREATED)
async def upload_contract(
    file: UploadFile = File(...),
    contract_type: str = Form(..., min_length=1, max_length=80),
    name: str | None = Form(default=None, max_length=255),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Contract:
    """Store a contract and persist source-preserving legal chunks."""
    settings = get_settings()
    filename = Path(file.filename or "").name
    extension = Path(filename).suffix.lower()
    if extension not in _MIME_TYPES:
        raise HTTPException(status_code=415, detail="Only PDF, DOCX, and TXT files are supported")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds the configured upload limit")
    content_hash = hashlib.sha256(content).hexdigest()
    existing_document = db.scalar(select(Document).where(Document.content_hash == content_hash))
    if existing_document:
        contract = db.scalar(
            select(Contract).where(Contract.document_id == existing_document.id, Contract.created_by_id == user.id)
        )
        if not contract:
            contract = Contract(
                name=name or Path(filename).stem,
                contract_type=contract_type or existing_document.contract_type or "General Agreement",
                document_id=existing_document.id,
                created_by_id=user.id,
            )
            db.add(contract)
            db.commit()
            db.refresh(contract)
        
        clause_count = db.scalar(
            select(func.count()).select_from(ExtractedClause).where(ExtractedClause.contract_id == contract.id)
        ) or 0
        if clause_count == 0:
            try:
                analyze_persisted_contract(db, contract)
                db.refresh(contract)
            except Exception:
                pass
        return contract

    try:
        pages = load_document(filename, content)
        chunks = chunk_legal_document(pages)
    except (UnsupportedDocumentType, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Document could not be processed: {exc}") from exc

    document_id = uuid.uuid4()
    storage_root = Path(settings.upload_dir)
    storage_root.mkdir(parents=True, exist_ok=True)
    storage_key = f"{document_id}{extension}"
    (storage_root / storage_key).write_bytes(content)
    now = datetime.now(UTC)
    document = Document(
        id=document_id,
        name=filename,
        mime_type=file.content_type or _MIME_TYPES[extension],
        storage_key=storage_key,
        content_hash=content_hash,
        processing_status="processed",
        contract_type=contract_type,
        uploaded_by_id=user.id,
        uploaded_at=now,
    )
    db.add(document)
    for chunk in chunks:
        db.add(DocumentChunk(
            document_id=document_id,
            content=chunk.content,
            chunk_index=chunk.chunk_index,
            page_number=chunk.page_number,
            section_title=chunk.section_title,
            section_number=chunk.section_number,
            clause_category=chunk.clause_category,
            contract_type=contract_type,
        ))
    contract = Contract(name=name or Path(filename).stem, contract_type=contract_type, document_id=document_id, created_by_id=user.id)
    db.add(contract)
    db.commit()
    db.refresh(contract)
    try:
        analyze_persisted_contract(db, contract)
        db.refresh(contract)
    except Exception:
        pass
    return contract


@router.post("/{contract_id}/analyze", response_model=ContractAnalysisResponse)
def analyze_contract(contract_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ContractAnalysisResponse:
    contract = db.scalar(select(Contract).where(Contract.id == contract_id, Contract.created_by_id == user.id))
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    try:
        result = analyze_persisted_contract(db, contract)
    except ValueError as exc:
        contract.status = "error"
        db.commit()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ContractAnalysisResponse(contract_id=contract.id, **result)


@router.get("/{contract_id}/analysis")
def get_contract_analysis(contract_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    contract = db.scalar(select(Contract).where(Contract.id == contract_id, Contract.created_by_id == user.id))
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    clauses = list(db.scalars(select(ExtractedClause).where(ExtractedClause.contract_id == contract.id).order_by(ExtractedClause.page_number, ExtractedClause.created_at)))
    if not clauses and contract.document_id:
        try:
            analyze_persisted_contract(db, contract)
            clauses = list(db.scalars(select(ExtractedClause).where(ExtractedClause.contract_id == contract.id).order_by(ExtractedClause.page_number, ExtractedClause.created_at)))
        except Exception:
            pass

    risks = list(db.scalars(select(ContractRisk).where(ContractRisk.contract_id == contract.id).order_by(ContractRisk.created_at)))
    obligations = list(db.scalars(select(ContractObligation).where(ContractObligation.contract_id == contract.id).order_by(ContractObligation.due_date, ContractObligation.created_at)))
    
    categories = list(dict.fromkeys(c.category for c in clauses))
    elevated_risks = [r for r in risks if r.severity in ("high", "critical")]
    
    summary = (
        f"This {contract.contract_type} ({contract.name}) contains {len(clauses)} verified clause provisions across "
        f"{len(categories)} distinct legal categories ({', '.join(categories[:4]) if categories else 'core terms'}). "
        f"The automated audit identified {len(risks)} risk points ({len(elevated_risks)} high/critical priority) and {len(obligations)} tracked obligations. "
        "Original source section and page anchors are preserved for human review."
    )

    return {
        "contract_id": str(contract.id),
        "name": contract.name,
        "contract_type": contract.contract_type,
        "status": contract.status,
        "summary": summary,
        "effective_date": contract.effective_date.isoformat() if contract.effective_date else None,
        "expiration_date": contract.expiration_date.isoformat() if contract.expiration_date else None,
        "clauses": [{
            "id": str(clause.id),
            "category": clause.category,
            "title": clause.title,
            "text": clause.text,
            "section_number": clause.section_number,
            "page_number": clause.page_number,
            "risk_level": clause.risk_level,
        } for clause in clauses],
        "risks": [{
            "id": str(risk.id),
            "contract_id": str(risk.contract_id),
            "title": risk.title,
            "category": risk.category,
            "severity": risk.severity,
            "explanation": risk.explanation,
            "business_impact": risk.business_impact,
            "suggested_action": risk.suggested_action,
            "review_status": risk.review_status,
        } for risk in risks],
        "obligations": [{
            "id": str(obligation.id),
            "contract_id": str(obligation.contract_id),
            "responsible_party": obligation.responsible_party,
            "description": obligation.description,
            "due_date": obligation.due_date.isoformat() if obligation.due_date else None,
            "due_date_text": obligation.due_date_text,
            "priority": obligation.priority,
            "status": obligation.status,
        } for obligation in obligations],
    }


@router.post("", response_model=ContractResponse, status_code=status.HTTP_201_CREATED)
def create_contract(request: ContractCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Contract:
    contract = Contract(**request.model_dump(), created_by_id=user.id)
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


@router.get("", response_model=ContractListResponse)
def list_contracts(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContractListResponse:
    base = select(Contract).where(Contract.created_by_id == user.id)
    items = list(db.scalars(base.order_by(Contract.created_at.desc()).limit(limit).offset(offset)))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    return ContractListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{contract_id}", response_model=ContractResponse)
def get_contract(contract_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Contract:
    contract = db.scalar(select(Contract).where(Contract.id == contract_id, Contract.created_by_id == user.id))
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract


@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract(contract_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    contract = db.scalar(select(Contract).where(Contract.id == contract_id, Contract.created_by_id == user.id))
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    db.delete(contract)
    db.commit()
