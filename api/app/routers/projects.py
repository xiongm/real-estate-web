
import os
import secrets
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Response, status
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
    ProjectFile,
    SigningSession,
    SignerFieldValue,
    Event,
)
from ..storage import put_bytes, get_bytes, delete_object
from ..utils import sha256_bytes, make_token
from ..auth import require_admin_access, require_project_or_admin
from ..schemas import ProjectUpdate

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

def _serialize_project_file(doc: ProjectFile):
    return {
        "id": doc.id,
        "display_name": doc.display_name,
        "stored_filename": doc.stored_filename,
        "content_type": doc.content_type,
        "uploaded_at": doc.uploaded_at,
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


@router.patch("/{project_id}")
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return project
    if "name" in data:
        existing = session.exec(
            select(Project).where(Project.name == data["name"], Project.id != project_id)
        ).first()
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "project name already exists")
    for key, value in data.items():
        setattr(project, key, value)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project

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

@router.get("/{project_id}/files")
def list_project_files(
    project_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    files = session.exec(
        select(ProjectFile)
        .where(ProjectFile.project_id == project_id)
        .order_by(ProjectFile.uploaded_at.desc())
    ).all()
    return [_serialize_project_file(doc) for doc in files]

@router.post("/{project_id}/files", status_code=201)
async def upload_project_file(
    project_id: int,
    file: UploadFile = File(...),
    label: str = Form(""),
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    data = await file.read()
    display_name = label.strip() or file.filename or "Project document"
    stored_filename = file.filename or "upload.bin"
    project_file = ProjectFile(
        project_id=project_id,
        display_name=display_name,
        stored_filename=stored_filename,
        content_type=file.content_type,
        s3_key="pending",
    )
    session.add(project_file)
    session.flush()
    key = f"projects/{project_id}/files/{project_file.id}-{stored_filename}"
    put_bytes(key, data, content_type=file.content_type or "application/octet-stream")
    project_file.s3_key = key
    session.add(project_file)
    session.commit()
    session.refresh(project_file)
    return _serialize_project_file(project_file)

@router.get("/{project_id}/files/{file_id}/download")
def download_project_file(
    project_id: int,
    file_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_project_or_admin),
):
    project_file = session.get(ProjectFile, file_id)
    if not project_file or project_file.project_id != project_id:
        raise HTTPException(404, "file not found")
    try:
        file_bytes = get_bytes(project_file.s3_key)
    except S3Error:
        raise HTTPException(404, "stored file missing for this document")
    download_name = project_file.display_name or project_file.stored_filename or f"project-file-{file_id}"
    if "." not in download_name and "." in (project_file.stored_filename or ""):
        extension = project_file.stored_filename.rsplit(".", 1)[-1]
        download_name = f"{download_name}.{extension}"
    return Response(
        content=file_bytes,
        media_type=project_file.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )

@router.delete("/{project_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_file(
    project_id: int,
    file_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    project_file = session.get(ProjectFile, file_id)
    if not project_file or project_file.project_id != project_id:
        raise HTTPException(404, "file not found")
    delete_object(project_file.s3_key)
    session.delete(project_file)
    session.commit()

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
    project_files = session.exec(
        select(ProjectFile).where(ProjectFile.project_id == project_id).order_by(ProjectFile.uploaded_at.desc())
    ).all()
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
        "project_files": [_serialize_project_file(pf) for pf in project_files],
        "investors": [
            {
                "id": inv.id,
                "name": inv.name,
                "email": inv.email,
                "units_invested": inv.units_invested,
                "mailing_address": inv.mailing_address,
                "bank_name": inv.bank_name,
                "bank_account_number": inv.bank_account_number,
                "bank_routing_number": inv.bank_routing_number,
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
                        "completed_at": s.completed_at,
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
