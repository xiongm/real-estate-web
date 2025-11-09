
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Project, Document
from ..storage import put_bytes
from ..utils import sha256_bytes

router = APIRouter()

@router.post("")
def create_project(name: str, tenant_id: int = 1, session: Session = Depends(get_session)):
    p = Project(name=name, tenant_id=tenant_id)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p

@router.get("")
def list_projects(session: Session = Depends(get_session)):
    return session.exec(select(Project)).all()

@router.post("/{project_id}/documents")
async def upload_document(project_id: int, file: UploadFile = File(...), session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    data = await file.read()
    sha = sha256_bytes(data)
    key = f"projects/{project_id}/uploads/{file.filename}"
    put_bytes(key, data, content_type=file.content_type or "application/pdf")
    doc = Document(project_id=project_id, filename=file.filename, s3_key=key, sha256=sha)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc
