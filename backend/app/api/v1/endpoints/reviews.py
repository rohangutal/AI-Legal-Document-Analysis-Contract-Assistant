"""Human review and obligation workflow endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.entities import Contract, ContractObligation, ContractRisk, Document, DocumentPermission, RiskReviewHistory, User
from app.schemas.review import (
    ObligationResponse,
    ObligationUpdate,
    PermissionResponse,
    PermissionUpsertRequest,
    RiskResponse,
    RiskReviewRequest,
)

router = APIRouter(prefix="/legal", tags=["review workflows"])


def _owned_contract(db: Session, contract_id: UUID, user_id: UUID) -> Contract:
    contract = db.scalar(select(Contract).where(Contract.id == contract_id, Contract.created_by_id == user_id))
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract


@router.get("/contracts/{contract_id}/risks", response_model=list[RiskResponse])
def list_contract_risks(contract_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[ContractRisk]:
    _owned_contract(db, contract_id, user.id)
    return list(db.scalars(select(ContractRisk).where(ContractRisk.contract_id == contract_id).order_by(ContractRisk.created_at)))


@router.get("/risks", response_model=list[RiskResponse])
def list_all_risks(
    contract_id: UUID | None = None,
    severity: str | None = None,
    review_status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ContractRisk]:
    """Return all risks across the current user's contracts, with optional filters."""
    stmt = select(ContractRisk).join(Contract).where(Contract.created_by_id == user.id)
    if contract_id:
        stmt = stmt.where(ContractRisk.contract_id == contract_id)
    if severity and severity != "all":
        stmt = stmt.where(ContractRisk.severity == severity)
    if review_status and review_status != "all":
        stmt = stmt.where(ContractRisk.review_status == review_status)
    return list(db.scalars(stmt.order_by(ContractRisk.created_at.desc())))


@router.patch("/risks/{risk_id}/review", response_model=RiskResponse)
def review_risk(risk_id: UUID, request: RiskReviewRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ContractRisk:
    risk = db.scalar(select(ContractRisk).join(Contract).where(ContractRisk.id == risk_id, Contract.created_by_id == user.id))
    if risk is None:
        raise HTTPException(status_code=404, detail="Risk not found")
    history = RiskReviewHistory(risk_id=risk.id, reviewer_id=user.id, from_status=risk.review_status, to_status=request.status, note=request.note)
    risk.review_status = request.status
    db.add(history)
    db.commit()
    db.refresh(risk)
    return risk


@router.get("/contracts/{contract_id}/obligations", response_model=list[ObligationResponse])
def list_contract_obligations(contract_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[ContractObligation]:
    _owned_contract(db, contract_id, user.id)
    return list(db.scalars(select(ContractObligation).where(ContractObligation.contract_id == contract_id).order_by(ContractObligation.due_date)))


@router.get("/obligations", response_model=list[ObligationResponse])
def list_obligations(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[ContractObligation]:
    return list(db.scalars(select(ContractObligation).join(Contract).where(Contract.created_by_id == user.id).order_by(ContractObligation.due_date)))


@router.patch("/obligations/{obligation_id}", response_model=ObligationResponse)
def update_obligation(obligation_id: UUID, request: ObligationUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ContractObligation:
    obligation = db.scalar(select(ContractObligation).join(Contract).where(ContractObligation.id == obligation_id, Contract.created_by_id == user.id))
    if obligation is None:
        raise HTTPException(status_code=404, detail="Obligation not found")
    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(obligation, field, value)
    db.commit()
    db.refresh(obligation)
    return obligation


@router.put("/documents/{document_id}/permissions/{user_id}", response_model=PermissionResponse)
def upsert_document_permission(document_id: UUID, user_id: UUID, request: PermissionUpsertRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> DocumentPermission:
    document = db.get(Document, document_id)
    if document is None or document.uploaded_by_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    if db.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail="Target user not found")
    permission = db.scalar(select(DocumentPermission).where(DocumentPermission.document_id == document_id, DocumentPermission.user_id == user_id))
    if permission is None:
        permission = DocumentPermission(document_id=document_id, user_id=user_id, permission=request.permission)
        db.add(permission)
    else:
        permission.permission = request.permission
    db.commit()
    db.refresh(permission)
    return permission
