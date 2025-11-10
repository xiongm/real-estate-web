from typing import Optional
from fastapi import Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, select

from .config import ADMIN_ACCESS_TOKEN
from .db import get_session
from .models import Project


class AccessContext(BaseModel):
    role: str
    project_id: Optional[int] = None


def resolve_access_context(
    x_access_token: Optional[str] = Header(default=None, alias="X-Access-Token"),
    token: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
) -> AccessContext:
    candidate = x_access_token or token
    if not candidate:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token")
    if ADMIN_ACCESS_TOKEN and candidate == ADMIN_ACCESS_TOKEN:
        return AccessContext(role="admin")
    project = session.exec(select(Project).where(Project.access_token == candidate)).first()
    if project:
        return AccessContext(role="project", project_id=project.id)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid access token")


def require_admin_access(context: AccessContext = Depends(resolve_access_context)) -> AccessContext:
    if context.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return context


def require_project_or_admin(
    project_id: int,
    context: AccessContext = Depends(resolve_access_context),
) -> AccessContext:
    if context.role == "admin":
        return context
    if context.role == "project" and context.project_id == project_id:
        return context
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this project")
