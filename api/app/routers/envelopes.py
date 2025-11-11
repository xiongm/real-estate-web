from html import escape
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Envelope, Signer, Field, Document, Event, ProjectInvestor
from ..schemas import EnvelopeCreate, EnvelopeSend
from ..email import send_email
from ..utils import canonical_json, sha256_bytes, make_token
from ..auth import require_admin_access

router = APIRouter()

def _append_event(session: Session, env_id: int, actor: str, type_: str, meta: dict, ip=None, ua=None):
    last = session.exec(
        select(Event).where(Event.envelope_id == env_id).order_by(Event.id.desc())
    ).first()
    prev_hash = last.hash if last else "0" * 64
    payload = {"actor": actor, "type": type_, "meta": meta}
    event = Event(
        envelope_id=env_id,
        actor=actor,
        type=type_,
        meta_json=canonical_json(payload),
        prev_hash=prev_hash,
        ip=ip,
        ua=ua,
    )
    event.hash = sha256_bytes((prev_hash + event.meta_json).encode())
    session.add(event)
    session.commit()

@router.post("")
def create_envelope(
    data: EnvelopeCreate,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    doc = session.get(Document, data.document_id)
    if not doc or doc.project_id != data.project_id:
        raise HTTPException(400, "document mismatch")
    env = Envelope(
        project_id=data.project_id,
        document_id=data.document_id,
        subject=data.subject,
        message=data.message,
        status="draft",
    )
    session.add(env); session.commit(); session.refresh(env)

    signer_key_map = {}
    signer_role_map = {}
    for idx, s in enumerate(data.signers):
        project_investor = None
        if s.project_investor_id:
            project_investor = session.get(ProjectInvestor, s.project_investor_id)
            if not project_investor or project_investor.project_id != data.project_id:
                raise HTTPException(400, f"project investor {s.project_investor_id} invalid")
        resolved_name = s.name or (project_investor.name if project_investor else None)
        resolved_email = s.email or (project_investor.email if project_investor else None)
        if not resolved_name or not resolved_email:
            raise HTTPException(400, "Signer name/email required (supply or link to investor with values)")
        signer = Signer(
            envelope_id=env.id,
            name=resolved_name,
            email=resolved_email,
            role=s.role or (project_investor.role if project_investor else "Investor"),
            routing_order=s.routing_order or (project_investor.routing_order if project_investor else idx + 1),
        )
        session.add(signer)
        session.flush()
        key = s.client_id or s.email or f"signer-{idx}"
        signer_key_map[key] = signer.id
        if project_investor:
            signer_key_map[str(project_investor.id)] = signer.id
        signer_role_map[signer.id] = signer.role
    for f in data.fields:
        target_signer_id = None
        if f.signer_key:
            target_signer_id = signer_key_map.get(f.signer_key)
        assigned_role = f.role or (signer_role_map.get(target_signer_id) if target_signer_id else None)
        session.add(Field(
            envelope_id=env.id,
            page=f.page,
            x=f.x,
            y=f.y,
            w=f.w,
            h=f.h,
            type=f.type,
            required=f.required,
            role=assigned_role or "Signer",
            name=f.name,
            signer_id=target_signer_id,
        ))
    session.commit()
    _append_event(session, env.id, "system", "created", {"envelope_id": env.id})

    # Return a small, explicit body so curl shows it
    return {"id": env.id, "status": env.status}

@router.post("/{envelope_id}/send")
def send_envelope(
    envelope_id: int,
    payload: EnvelopeSend,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    env = session.get(Envelope, envelope_id)
    if not env:
        raise HTTPException(404, "envelope not found")
    if payload:
        if payload.message is not None:
            env.message = payload.message
        if payload.subject:
            env.subject = payload.subject
        if payload.requester_name is not None:
            env.requester_name = payload.requester_name
        if payload.requester_email is not None:
            env.requester_email = payload.requester_email
    doc = session.get(Document, env.document_id)
    if not doc:
        raise HTTPException(404, "document not found")
    env.status = "sent"; session.add(env); session.commit()

    signers = session.exec(
        select(Signer).where(Signer.envelope_id == envelope_id).order_by(Signer.routing_order)
    ).all()
    filename = doc.filename or "Document"
    requester_name = env.requester_name or "Your contact"
    requester_email = env.requester_email
    intro = env.message or f"{requester_name} invited you to review and sign this document."
    for s in signers:
        token = make_token({"signer_id": s.id, "envelope_id": envelope_id})
        link = f"http://localhost:3000/sign/{token}"
        custom_subject = env.subject.strip() if env.subject else None
        subject_core = custom_subject or filename
        subject = f"Signature Requested: {subject_core}"
        text_body = f"""{requester_name} sent you a document to review and sign.
Document: “{filename}”

{intro}

Open document: {link}
"""
        intro_html = escape(intro)
        link_html = escape(link)
        requester_html = escape(requester_name)
        requester_contact = f"{requester_html}{f' · {escape(requester_email)}' if requester_email else ''}"
        html_body = f"""
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f6f8; padding: 24px;">
    <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 10px 25px rgba(15,23,42,0.08);">
      <h2 style="margin-top: 0; font-size: 20px; color: #0f172a;">Signature requested</h2>
      <p style="font-size: 13px; color: #475569; margin-bottom: 6px;">{requester_contact}</p>
      <p style="font-size: 14px; color: #1e293b; line-height: 1.5;">
        {requester_html} sent you a document to review and sign.
      </p>
      <p style="font-size: 14px; color: #1e293b; line-height: 1.5;">{intro_html}</p>
      <div style="margin: 24px 0;">
        <a href="{link_html}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Review &amp; Sign
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b;">If the button doesn&apos;t work, copy this link into your browser:<br /><a href="{link_html}">{link_html}</a></p>
    </div>
  </body>
</html>
"""
        send_email(s.email, subject, text_body, html_body=html_body)

    _append_event(session, env.id, "system", "sent", {})
    return {"ok": True}

@router.get("/{envelope_id}")
def get_envelope(
    envelope_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    env = session.get(Envelope, envelope_id)
    if not env:
        raise HTTPException(404, "envelope not found")
    doc = session.get(Document, env.document_id)
    signers = session.exec(
        select(Signer).where(Signer.envelope_id == envelope_id).order_by(Signer.routing_order)
    ).all()
    return {
        "id": env.id,
        "project_id": env.project_id,
        "subject": env.subject,
        "message": env.message,
        "requester_name": env.requester_name,
        "requester_email": env.requester_email,
        "status": env.status,
        "document": {"id": doc.id, "filename": doc.filename} if doc else None,
        "signers": [
            {
                "id": s.id,
                "name": s.name,
                "email": s.email,
                "role": s.role,
                "routing_order": s.routing_order,
            }
            for s in signers
        ],
    }

# Dev helper: get magic links without tailing logs
@router.get("/{envelope_id}/dev-magic-links")
def dev_magic_links(
    envelope_id: int,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    env = session.get(Envelope, envelope_id)
    if not env:
        raise HTTPException(404, "envelope not found")
    signers = session.exec(
        select(Signer).where(Signer.envelope_id == envelope_id).order_by(Signer.routing_order)
    ).all()
    links = []
    for s in signers:
        token = make_token({"signer_id": s.id, "envelope_id": envelope_id})
        links.append({
            "signer": {"id": s.id, "name": s.name, "email": s.email},
            "link": f"http://localhost:3000/sign/{token}"
        })
    return {"envelope_id": envelope_id, "links": links}
