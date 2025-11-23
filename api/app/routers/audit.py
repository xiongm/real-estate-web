from datetime import datetime, timedelta
from typing import Optional
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from ..auth import require_project_or_admin
from ..db import get_session
from ..models import AuditEvent, Project
from ..config import AUDIT_RETENTION_DAYS

router = APIRouter()


@router.get("/{project_id}/audit")
def list_project_audit(
    project_id: int,
    action: Optional[str] = None,
    resource_type: Optional[str] = Query(default=None, alias="resource"),
    actor_type: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    export: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
    ctx=Depends(require_project_or_admin),
):
    retention_days = max(AUDIT_RETENTION_DAYS or 30, 1)
    retention_cutoff = datetime.utcnow() - timedelta(days=retention_days)

    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="project not found")

    base = select(AuditEvent).where(AuditEvent.project_id == project_id)
    base = base.where(AuditEvent.created_at >= retention_cutoff)
    if action:
        base = base.where(AuditEvent.action == action)
    if resource_type:
        base = base.where(AuditEvent.resource_type == resource_type)
    if actor_type:
        base = base.where(AuditEvent.actor_type == actor_type)
    if status:
        base = base.where(AuditEvent.status == status)
    if date_from:
        cutoff_from = date_from if date_from >= retention_cutoff else retention_cutoff
        base = base.where(AuditEvent.created_at >= cutoff_from)
    if date_to:
        base = base.where(AuditEvent.created_at <= date_to)
    if search:
        like = f"%{search}%"
        base = base.where(
            (AuditEvent.resource_id.ilike(like))
            | (AuditEvent.actor_id.ilike(like))
            | (AuditEvent.summary.ilike(like))
        )
    all_events = session.exec(base.order_by(AuditEvent.created_at.desc())).all()
    total = len(all_events)

    if export in {"csv", "json"}:
        if export == "json":
            return JSONResponse([ev.model_dump() for ev in all_events])
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "id",
                "project_id",
                "action",
                "resource_type",
                "resource_id",
                "actor_type",
                "actor_id",
                "status",
                "summary",
                "created_at",
            ]
        )
        for ev in all_events:
            writer.writerow(
                [
                    ev.id,
                    ev.project_id,
                    ev.action,
                    ev.resource_type,
                    ev.resource_id,
                    ev.actor_type,
                    ev.actor_id,
                    ev.status,
                    ev.summary,
                    ev.created_at.isoformat() if ev.created_at else None,
                ]
            )
        csv_bytes = output.getvalue().encode()
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=audit-{project_id}.csv"},
        )

    offset = (page - 1) * limit
    items = all_events[offset : offset + limit]
    return {
        "items": [item.model_dump() for item in items],
        "page": page,
        "limit": limit,
        "total": total,
        "retention_days": retention_days,
    }
