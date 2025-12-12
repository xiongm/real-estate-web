import os
from html import escape
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from ..db import get_session
from ..models import Envelope, Signer, Field, Document, Event, ProjectInvestor, AuditEvent
from ..schemas import EnvelopeCreate, EnvelopeSend, EnvelopeSummaryUpdate, SignerUpdate
from ..email import send_email, format_sender_name
from ..utils import canonical_json, sha256_bytes, make_token
from ..summary import kickoff_envelope_summary, generate_envelope_summary
from ..config import DOC_SUMMARY_CHAR_LIMIT
from ..auth import require_admin_access

router = APIRouter()
WEB_BASE_URL = os.getenv("WEB_BASE_URL") or os.getenv("NEXT_PUBLIC_WEB_BASE") or "http://localhost:3000"

def _sign_link(token: str) -> str:
    base = WEB_BASE_URL.rstrip('/')
    return f"{base}/sign/{token}"

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

def _record_audit(
    session: Session,
    *,
    project_id: int,
    action: str,
    resource_type: str,
    resource_id: str,
    actor_type: str,
    actor_id: str | None = None,
    summary: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    payload: dict | None = None,
):
    try:
        session.add(
            AuditEvent(
                project_id=project_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                actor_type=actor_type,
                actor_id=actor_id,
                status="success",
                summary=summary,
                ip=ip,
                user_agent=user_agent,
                payload_json=json.dumps(payload) if payload else None,
            )
        )
        session.commit()
    except Exception:
        session.rollback()
        return

@router.post("")
def create_envelope(
    data: EnvelopeCreate,
    session: Session = Depends(get_session),
    request: Request = None,
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
            font_family=f.font_family or "sans",
        ))
    session.commit()
    _append_event(session, env.id, "system", "created", {"envelope_id": env.id})
    _record_audit(
        session,
        project_id=data.project_id,
        action="create",
        resource_type="envelope",
        resource_id=str(env.id),
        actor_type=ctx.role,
        summary=f"Created envelope for doc {data.document_id}",
        ip=getattr(request, "client", None).host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
    )
    kickoff_envelope_summary(env.id)

    # Return a small, explicit body so curl shows it
    return {"id": env.id, "status": env.status}

@router.post("/{envelope_id}/send")
def send_envelope(
    envelope_id: int,
    payload: EnvelopeSend,
    session: Session = Depends(get_session),
    request: Request = None,
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
        if payload.summary is not None:
            trimmed = (payload.summary or "").strip()
            env.summary = trimmed[:DOC_SUMMARY_CHAR_LIMIT] if trimmed else None
    doc = session.get(Document, env.document_id)
    if not doc:
        raise HTTPException(404, "document not found")
    enable_summary = payload.enable_summary if payload.enable_summary is not None else True
    if enable_summary and not env.summary:
        # Best-effort: try to generate summary synchronously before sending.
        try:
            generate_envelope_summary(session, env, doc, force=True)
        except Exception as exc:  # pragma: no cover - fail-soft
            # Do not block sending if summarization fails.
            import logging
            logging.getLogger(__name__).warning("Summary generation failed before send: %s", exc)
    env.status = "sent"; session.add(env); session.commit()

    signers = session.exec(
        select(Signer).where(Signer.envelope_id == envelope_id).order_by(Signer.routing_order)
    ).all()
    filename = doc.filename or "Document"
    requester_given_name = (env.requester_name or "").strip() or None
    requester_name = requester_given_name or "Your contact"
    requester_email = (env.requester_email or "").strip() or None
    intro = env.message or f"{requester_name} invited you to review and sign this document."
    for s in signers:
        token = make_token({"signer_id": s.id, "envelope_id": envelope_id})
        link = _sign_link(token)
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
        send_email(
            s.email,
            subject,
            text_body,
            html_body=html_body,
            sender_name=format_sender_name(requester_given_name),
            reply_to=requester_email,
        )

    _append_event(session, env.id, "system", "sent", {})
    _record_audit(
        session,
        project_id=env.project_id,
        action="send",
        resource_type="envelope",
        resource_id=str(env.id),
        actor_type=ctx.role,
        summary=f"Sent envelope {env.subject or env.id}",
        ip=getattr(request, "client", None).host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
        payload={"signers": [s.email for s in signers], "document_id": env.document_id},
    )
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
        "summary": env.summary,
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

@router.patch("/{envelope_id}/summary")
def update_envelope_summary(
    envelope_id: int,
    payload: EnvelopeSummaryUpdate,
    session: Session = Depends(get_session),
    ctx=Depends(require_admin_access),
):
    env = session.get(Envelope, envelope_id)
    if not env:
        raise HTTPException(404, "envelope not found")
    summary = (payload.summary or "").strip()
    env.summary = summary[:DOC_SUMMARY_CHAR_LIMIT] if summary else None
    session.add(env)
    session.commit()
    session.refresh(env)
    return {"id": env.id, "summary": env.summary}

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
            "link": _sign_link(token)
        })
    return {"envelope_id": envelope_id, "links": links}


@router.patch("/{envelope_id}/signers/{signer_id}")
def update_signer(
    envelope_id: int,
    signer_id: int,
    payload: SignerUpdate,
    session: Session = Depends(get_session),
    request: Request = None,
    ctx=Depends(require_admin_access),
):
    """Update a signer's email or name. Only allowed for pending signers on sent envelopes."""
    env = session.get(Envelope, envelope_id)
    if not env:
        raise HTTPException(404, "envelope not found")
    if env.status != "sent":
        raise HTTPException(400, "can only update signers on sent envelopes")
    
    signer = session.get(Signer, signer_id)
    if not signer or signer.envelope_id != envelope_id:
        raise HTTPException(404, "signer not found")
    if signer.status == "completed":
        raise HTTPException(400, "cannot update a completed signer")
    
    old_email = signer.email
    old_name = signer.name
    
    if payload.email is not None:
        signer.email = payload.email.strip()
    if payload.name is not None:
        signer.name = payload.name.strip()
    
    session.add(signer)
    session.commit()
    session.refresh(signer)
    
    _record_audit(
        session,
        project_id=env.project_id,
        action="update_signer",
        resource_type="signer",
        resource_id=str(signer.id),
        actor_type=ctx.role,
        summary=f"Updated signer {signer.name} ({old_email} → {signer.email})" if old_email != signer.email else f"Updated signer {signer.name}",
        ip=getattr(request, "client", None).host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
        payload={"old_email": old_email, "new_email": signer.email, "old_name": old_name, "new_name": signer.name},
    )
    
    return {"id": signer.id, "name": signer.name, "email": signer.email, "status": signer.status}


@router.post("/{envelope_id}/signers/{signer_id}/resend")
def resend_signer_link(
    envelope_id: int,
    signer_id: int,
    session: Session = Depends(get_session),
    request: Request = None,
    ctx=Depends(require_admin_access),
):
    """Resend the signing link email to a specific signer. Only for pending signers."""
    env = session.get(Envelope, envelope_id)
    if not env:
        raise HTTPException(404, "envelope not found")
    if env.status != "sent":
        raise HTTPException(400, "envelope must be sent to resend links")
    
    signer = session.get(Signer, signer_id)
    if not signer or signer.envelope_id != envelope_id:
        raise HTTPException(404, "signer not found")
    if signer.status == "completed":
        raise HTTPException(400, "signer has already completed signing")
    
    doc = session.get(Document, env.document_id)
    if not doc:
        raise HTTPException(404, "document not found")
    
    # Build and send email (same logic as send_envelope)
    filename = doc.filename or "Document"
    requester_given_name = (env.requester_name or "").strip() or None
    requester_name = requester_given_name or "Your contact"
    requester_email = (env.requester_email or "").strip() or None
    intro = env.message or f"{requester_name} invited you to review and sign this document."
    
    token = make_token({"signer_id": signer.id, "envelope_id": envelope_id})
    link = _sign_link(token)
    custom_subject = env.subject.strip() if env.subject else None
    subject_core = custom_subject or filename
    subject = f"Reminder: Signature Requested - {subject_core}"
    
    text_body = f"""{requester_name} sent you a document to review and sign.
Document: "{filename}"

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
      <h2 style="margin-top: 0; font-size: 20px; color: #0f172a;">Reminder: Signature requested</h2>
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
    send_email(
        signer.email,
        subject,
        text_body,
        html_body=html_body,
        sender_name=format_sender_name(requester_given_name),
        reply_to=requester_email,
    )
    
    _append_event(session, env.id, "system", "resent", {"signer_id": signer.id, "email": signer.email})
    _record_audit(
        session,
        project_id=env.project_id,
        action="resend",
        resource_type="signer",
        resource_id=str(signer.id),
        actor_type=ctx.role,
        summary=f"Resent signing link to {signer.name} ({signer.email})",
        ip=getattr(request, "client", None).host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
        payload={"signer_email": signer.email},
    )
    
    return {"ok": True, "email": signer.email}
