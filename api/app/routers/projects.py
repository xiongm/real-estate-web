
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

@router.get("/{project_id}/documents")
def list_project_documents(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    return session.exec(select(Document).where(Document.project_id == project_id).order_by(Document.created_at.desc())).all()

@router.get("/{project_id}/documents/{document_id}/pdf")
def download_document_pdf(project_id: int, document_id: int, session: Session = Depends(get_session)):
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
def list_project_final_artifacts(project_id: int, session: Session = Depends(get_session)):
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

@router.get("/{project_id}/final-artifacts/{envelope_id}/pdf")
def download_final_pdf(project_id: int, envelope_id: int, session: Session = Depends(get_session)):
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
def delete_document(project_id: int, document_id: int, session: Session = Depends(get_session)):
    doc = session.get(Document, document_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(404, "document not found")
    delete_object(doc.s3_key)
    session.delete(doc)
    session.commit()

@router.delete("/{project_id}/final-artifacts/{envelope_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_final_artifact(project_id: int, envelope_id: int, session: Session = Depends(get_session)):
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

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, session: Session = Depends(get_session)):
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
        # final artifacts
        final_artifacts = session.exec(select(FinalArtifact).where(FinalArtifact.envelope_id == env.id)).all()
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
        # fields
        fields = session.exec(select(FieldModel).where(FieldModel.envelope_id == env.id)).all()
        for field in fields:
            session.delete(field)
        # signers + dependant data
        signers = session.exec(select(Signer).where(Signer.envelope_id == env.id)).all()
        for signer in signers:
            sessions = session.exec(select(SigningSession).where(SigningSession.signer_id == signer.id)).all()
            for sess in sessions:
                session.delete(sess)
            values = session.exec(select(SignerFieldValue).where(SignerFieldValue.signer_id == signer.id)).all()
            for value in values:
                session.delete(value)
            session.delete(signer)
        # events
        events = session.exec(select(Event).where(Event.envelope_id == env.id)).all()
        for event in events:
            session.delete(event)
        session.delete(env)

    # project investors
    investors = session.exec(select(ProjectInvestor).where(ProjectInvestor.project_id == project_id)).all()
    for investor in investors:
        session.delete(investor)

    session.delete(project)
    session.commit()
