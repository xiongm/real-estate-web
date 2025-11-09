from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Project, ProjectInvestor
from ..schemas import ProjectInvestorCreate, ProjectInvestorUpdate

router = APIRouter()

def _ensure_project(session: Session, project_id: int):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    return project

@router.get("/{project_id}/investors")
def list_investors(project_id: int, session: Session = Depends(get_session)):
    _ensure_project(session, project_id)
    investors = session.exec(
        select(ProjectInvestor).where(ProjectInvestor.project_id == project_id).order_by(ProjectInvestor.routing_order, ProjectInvestor.id)
    ).all()
    return investors

@router.post("/{project_id}/investors", status_code=201)
def create_investor(project_id: int, payload: ProjectInvestorCreate, session: Session = Depends(get_session)):
    _ensure_project(session, project_id)
    investor = ProjectInvestor(
        project_id=project_id,
        name=payload.name,
        email=payload.email,
        role=payload.role,
        routing_order=payload.routing_order,
        units_invested=payload.units_invested,
        metadata_json=payload.metadata_json or "{}",
    )
    session.add(investor)
    session.commit()
    session.refresh(investor)
    return investor

@router.patch("/{project_id}/investors/{investor_id}")
def update_investor(project_id: int, investor_id: int, payload: ProjectInvestorUpdate, session: Session = Depends(get_session)):
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
    return investor

@router.delete("/{project_id}/investors/{investor_id}", status_code=204)
def delete_investor(project_id: int, investor_id: int, session: Session = Depends(get_session)):
    _ensure_project(session, project_id)
    investor = session.get(ProjectInvestor, investor_id)
    if not investor or investor.project_id != project_id:
        raise HTTPException(404, "investor not found")
    session.delete(investor)
    session.commit()
    return {"ok": True}
