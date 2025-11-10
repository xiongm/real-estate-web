
import os
import secrets
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Response, status
from sqlmodel import Session, select
from minio.error import S3Error
from ..db import get_session
from ..models import (
    Project,
    Document,
    Envelope,
    FinalArtifact,
    Signer,
    Field as FieldModel,
    ProjectInvestor,
    SigningSession,
    SignerFieldValue,
    Event,
)
from ..storage import put_bytes, get_bytes, delete_object
from ..utils import sha256_bytes, make_token
from ..auth import require_admin_access, require_project_or_admin

def _serialize_document(doc: Document):
    return {
        "id": doc.id,
        "filename": doc.filename,
        "created_at": doc.created_at,
    }

def _serialize_final(entry):
    final, envelope, document = entry
    return {
        "envelope_id": envelope.id,
        "document_id": document.id,
        "document_name": document.filename,
        "completed_at": final.completed_at,
        "sha256_final": final.sha256_final,
    }

router = APIRouter()

@router.post("")
def create_project(
    name: str,
    tenant_id: int = 1,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    existing = session.exec(select(Project).where(Project.name == name)).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "project name already exists")
    p = Project(name=name, tenant_id=tenant_id, access_token=secrets.token_urlsafe(32))
    session.add(p)
    session.commit()
    session.refresh(p)
    return p

@router.get("")
def list_projects(
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    return session.exec(select(Project)).all()

@router.post("/{project_id}/documents")
async def upload_document(
    project_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    data = await file.read()
    sha = sha256_bytes(data)
    doc = Document(project_id=project_id, filename=file.filename, sha256=sha, s3_key="pending")
    session.add(doc)
    session.flush()
    key = f"projects/{project_id}/uploads/{doc.id}-{file.filename}"
    put_bytes(key, data, content_type=file.content_type or "application/pdf")
    doc.s3_key = key
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc

@router.get("/{project_id}/documents")
def list_project_documents(
    project_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_project_or_admin),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    return session.exec(select(Document).where(Document.project_id == project_id).order_by(Document.created_at.desc())).all()

@router.get("/{project_id}/documents/{document_id}/pdf")
def download_document_pdf(
    project_id: int,
    document_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_project_or_admin),
):
    document = session.get(Document, document_id)
    if not document or document.project_id != project_id:
        raise HTTPException(404, "document not found")
    try:
        pdf_bytes = get_bytes(document.s3_key)
    except S3Error:
        raise HTTPException(404, "stored file missing for this document")
    filename = document.filename or f"document-{document_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get("/{project_id}/final-artifacts")
def list_project_final_artifacts(
    project_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_project_or_admin),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    stmt = (
        select(FinalArtifact, Envelope, Document)
        .where(
            FinalArtifact.envelope_id == Envelope.id,
            Envelope.document_id == Document.id,
            Envelope.project_id == project_id,
        )
        .order_by(FinalArtifact.completed_at.desc())
    )
    results = session.exec(stmt).all()
    response = []
    for fa, env, doc in results:
        response.append(
            {
                "envelope_id": env.id,
                "document_id": doc.id,
                "document_name": doc.filename,
                "completed_at": fa.completed_at,
                "sha256_final": fa.sha256_final,
                "s3_key_pdf": fa.s3_key_pdf,
            }
        )
    return response

@router.get("/{project_id}/summary")
def project_summary(
    project_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_project_or_admin),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    documents = session.exec(
        select(Document).where(Document.project_id == project_id).order_by(Document.created_at.desc())
    ).all()
    investors = session.exec(select(ProjectInvestor).where(ProjectInvestor.project_id == project_id)).all()
    finals_stmt = (
        select(FinalArtifact, Envelope, Document)
        .where(
            FinalArtifact.envelope_id == Envelope.id,
            Envelope.document_id == Document.id,
            Envelope.project_id == project_id,
        )
        .order_by(FinalArtifact.completed_at.desc())
    )
    final_rows = session.exec(finals_stmt).all()
    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "status": project.status,
        },
        "documents": [_serialize_document(doc) for doc in documents],
        "signed_documents": [_serialize_final(row) for row in final_rows],
        "investors": [
            {
                "id": inv.id,
                "name": inv.name,
                "email": inv.email,
                "units_invested": inv.units_invested,
            }
            for inv in investors
        ],
    }

@router.get("/{project_id}/final-artifacts/{envelope_id}/pdf")
def download_final_pdf(
    project_id: int,
    envelope_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_project_or_admin),
):
    env = session.get(Envelope, envelope_id)
    if not env or env.project_id != project_id:
        raise HTTPException(404, "envelope not found")
    fa = session.exec(select(FinalArtifact).where(FinalArtifact.envelope_id == envelope_id)).first()
    if not fa:
        raise HTTPException(404, "final artifact not found")
    doc = session.get(Document, env.document_id)
    try:
        pdf_bytes = get_bytes(fa.s3_key_pdf)
    except S3Error:
        raise HTTPException(404, "stored file missing for this envelope")
    filename_base = doc.filename if doc and doc.filename else f"envelope-{envelope_id}"
    filename = filename_base if filename_base.lower().endswith(".pdf") else f"{filename_base}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.delete("/{project_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    project_id: int,
    document_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    doc = session.get(Document, document_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(404, "document not found")
    delete_object(doc.s3_key)
    session.delete(doc)
    session.commit()

@router.delete("/{project_id}/final-artifacts/{envelope_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_final_artifact(
    project_id: int,
    envelope_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    env = session.get(Envelope, envelope_id)
    if not env or env.project_id != project_id:
        raise HTTPException(404, "envelope not found")
    fa = session.exec(select(FinalArtifact).where(FinalArtifact.envelope_id == envelope_id)).first()
    if not fa:
        raise HTTPException(404, "final artifact not found")
    delete_object(fa.s3_key_pdf)
    delete_object(fa.s3_key_audit_json)
    session.delete(fa)
    session.commit()

@router.get("/{project_id}/envelopes")
def list_project_envelopes(
    project_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_project_or_admin),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    envelopes = session.exec(
        select(Envelope).where(Envelope.project_id == project_id).order_by(Envelope.created_at.desc())
    ).all()
    doc_map = {}
    link_base = os.getenv("WEB_BASE_URL") or os.getenv("NEXT_PUBLIC_WEB_BASE") or "http://localhost:3000"
    results = []
    for env in envelopes:
        if env.document_id not in doc_map:
            doc_map[env.document_id] = session.get(Document, env.document_id)
        doc = doc_map.get(env.document_id)
        signers = session.exec(select(Signer).where(Signer.envelope_id == env.id).order_by(Signer.routing_order)).all()
        completed = sum(1 for s in signers if s.status == "completed")
        results.append(
            {
                "id": env.id,
                "subject": env.subject,
                "status": env.status,
                "created_at": env.created_at,
                "document": {"id": doc.id if doc else None, "filename": doc.filename if doc else None},
                "total_signers": len(signers),
                "completed_signers": completed,
                "signers": [
                    {
                        "id": s.id,
                        "name": s.name,
                        "email": s.email,
                        "status": s.status,
                        "role": s.role,
                        "routing_order": s.routing_order,
                        "magic_link": f"{link_base}/sign/{make_token({'signer_id': s.id, 'envelope_id': env.id})}",
                    }
                    for s in signers
                ],
            }
        )
    return results

def _delete_envelope(session: Session, envelope: Envelope):
    final_artifacts = session.exec(select(FinalArtifact).where(FinalArtifact.envelope_id == envelope.id)).all()
    for fa in final_artifacts:
        try:
            delete_object(fa.s3_key_pdf)
        except Exception:
            pass
        try:
            delete_object(fa.s3_key_audit_json)
        except Exception:
            pass
        session.delete(fa)
    fields = session.exec(select(FieldModel).where(FieldModel.envelope_id == envelope.id)).all()
    for field in fields:
        session.delete(field)
    signers = session.exec(select(Signer).where(Signer.envelope_id == envelope.id)).all()
    for signer in signers:
        sessions = session.exec(select(SigningSession).where(SigningSession.signer_id == signer.id)).all()
        for sess in sessions:
            session.delete(sess)
        values = session.exec(select(SignerFieldValue).where(SignerFieldValue.signer_id == signer.id)).all()
        for value in values:
            session.delete(value)
        session.delete(signer)
    events = session.exec(select(Event).where(Event.envelope_id == envelope.id)).all()
    for event in events:
        session.delete(event)
    session.delete(envelope)

@router.delete("/{project_id}/envelopes/{envelope_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_envelope(
    project_id: int,
    envelope_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    envelope = session.get(Envelope, envelope_id)
    if not envelope or envelope.project_id != project_id:
        raise HTTPException(404, "envelope not found")
    _delete_envelope(session, envelope)
    session.commit()

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")

    # delete documents + files
    documents = session.exec(select(Document).where(Document.project_id == project_id)).all()
    for doc in documents:
        try:
            delete_object(doc.s3_key)
        except Exception:
            pass
        session.delete(doc)

    # delete envelopes and related data
    envelopes = session.exec(select(Envelope).where(Envelope.project_id == project_id)).all()
    for env in envelopes:
        _delete_envelope(session, env)

    # project investors
    investors = session.exec(select(ProjectInvestor).where(ProjectInvestor.project_id == project_id)).all()
    for investor in investors:
        session.delete(investor)

    session.delete(project)
    session.commit()

@router.post("/{project_id}/access-token")
def regenerate_project_token(
    project_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    project.access_token = secrets.token_urlsafe(32)
    session.add(project)
    session.commit()
    session.refresh(project)
    return {"access_token": project.access_token}
