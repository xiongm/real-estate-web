import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from ..db import get_session
from ..models import Project, ProjectInvestor, AuditEvent
from ..schemas import ProjectInvestorCreate, ProjectInvestorUpdate
from ..auth import require_admin_access, require_project_or_admin

router = APIRouter()

def _ensure_project(session: Session, project_id: int):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    return project

def _serialize_investor(inv: ProjectInvestor):
    return {
        "id": inv.id,
        "project_id": inv.project_id,
        "name": inv.name,
        "email": inv.email,
        "role": inv.role,
        "routing_order": inv.routing_order,
        "units_invested": inv.units_invested,
        "mailing_address": inv.mailing_address,
        "bank_name": inv.bank_name,
        "bank_account_number": inv.bank_account_number,
        "bank_routing_number": inv.bank_routing_number,
        "metadata_json": inv.metadata_json,
        "created_at": inv.created_at,
    }

@router.get("/{project_id}/investors")
def list_investors(
    project_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_project_or_admin),
):
    _ensure_project(session, project_id)
    investors = session.exec(
        select(ProjectInvestor).where(ProjectInvestor.project_id == project_id).order_by(ProjectInvestor.routing_order, ProjectInvestor.id)
    ).all()
    return [_serialize_investor(inv) for inv in investors]

@router.post("/{project_id}/investors", status_code=201)
def create_investor(
    project_id: int,
    payload: ProjectInvestorCreate,
    session: Session = Depends(get_session),
    request: Request = None,
    ctx=Depends(require_admin_access),
):
    _ensure_project(session, project_id)
    investor = ProjectInvestor(
        project_id=project_id,
        name=payload.name,
        email=payload.email,
        role=payload.role,
        routing_order=payload.routing_order,
        units_invested=payload.units_invested,
        mailing_address=payload.mailing_address,
        bank_name=payload.bank_name,
        bank_account_number=payload.bank_account_number,
        bank_routing_number=payload.bank_routing_number,
        metadata_json=payload.metadata_json or "{}",
    )
    session.add(investor)
    session.commit()
    session.refresh(investor)
    session.add(
        AuditEvent(
            project_id=project_id,
            action="create",
            resource_type="investor",
            resource_id=str(investor.id),
            actor_type=ctx.role,
            summary=f"Created investor {investor.name}",
            ip=getattr(request, "client", None).host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
            payload_json=json.dumps(payload.model_dump()),
        )
    )
    session.commit()
    return _serialize_investor(investor)

@router.patch("/{project_id}/investors/{investor_id}")
def update_investor(
    project_id: int,
    investor_id: int,
    payload: ProjectInvestorUpdate,
    session: Session = Depends(get_session),
    request: Request = None,
    ctx=Depends(require_admin_access),
):
    _ensure_project(session, project_id)
    investor = session.get(ProjectInvestor, investor_id)
    if not investor or investor.project_id != project_id:
        raise HTTPException(404, "investor not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(investor, key, value)
    session.add(investor)
    session.commit()
    session.refresh(investor)
    session.add(
        AuditEvent(
            project_id=project_id,
            action="update",
            resource_type="investor",
            resource_id=str(investor.id),
            actor_type=ctx.role,
            summary=f"Updated investor {investor.name}",
            ip=getattr(request, "client", None).host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
            payload_json=json.dumps(data),
        )
    )
    session.commit()
    return _serialize_investor(investor)

@router.delete("/{project_id}/investors/{investor_id}", status_code=204)
def delete_investor(
    project_id: int,
    investor_id: int,
    session: Session = Depends(get_session),
    request: Request = None,
    ctx=Depends(require_admin_access),
):
    _ensure_project(session, project_id)
    investor = session.get(ProjectInvestor, investor_id)
    if not investor or investor.project_id != project_id:
        raise HTTPException(404, "investor not found")
    session.delete(investor)
    session.commit()
    session.add(
        AuditEvent(
            project_id=project_id,
            action="delete",
            resource_type="investor",
            resource_id=str(investor_id),
            actor_type=ctx.role,
            summary=f"Deleted investor {investor.name}",
            ip=getattr(request, "client", None).host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )
    )
    session.commit()
    return {"ok": True}
