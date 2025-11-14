from datetime import datetime
from html import escape
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlmodel import Session, select, delete
from sqlalchemy.inspection import inspect as sa_inspect
from ..db import get_session
from ..models import Signer, Envelope, Field, Event, Document, FinalArtifact, SignerFieldValue
from ..schemas import SignSave, ConsentAccept
from ..utils import read_token, canonical_json, sha256_bytes
from ..storage import get_bytes, put_bytes
from ..email import send_email, format_sender_name
import json

router = APIRouter()

# ---------- helpers ----------
def _append_event(session: Session, env_id: int, actor: str, type_: str, meta: dict, ip=None, ua=None):
    last = session.exec(select(Event).where(Event.envelope_id==env_id).order_by(Event.id.desc())).first()
    prev_hash = last.hash if last else "0"*64
    payload = {"actor": actor, "type": type_, "meta": meta}
    event = Event(
        envelope_id=env_id, actor=actor, type=type_,
        meta_json=canonical_json(payload), prev_hash=prev_hash,
        ip=ip, ua=ua
    )
    event.hash = sha256_bytes((prev_hash + event.meta_json).encode())
    session.add(event); session.commit()

def sa_to_dict(obj):
    if obj is None:
        return {}
    mapper = sa_inspect(obj).mapper
    data = {}
    for col in mapper.columns:
        data[col.key] = getattr(obj, col.key)
    return data

def _persist_field_values(session: Session, signer: Signer, values: dict):
    if not values:
        return
    fields = session.exec(select(Field).where(Field.envelope_id == signer.envelope_id)).all()
    field_map = {f.id: f for f in fields}
    session.exec(delete(SignerFieldValue).where(SignerFieldValue.signer_id == signer.id))
    for field_id, meta in values.items():
        try:
            fid_int = int(field_id)
        except (TypeError, ValueError):
            continue
        field = field_map.get(fid_int)
        if not field:
            continue
        if field.role and signer.role and field.role != signer.role:
            continue
        payload = meta if isinstance(meta, dict) else {"value": meta}
        value = payload.get("value")
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        sfv = SignerFieldValue(
            signer_id=signer.id,
            field_id=fid_int,
            value_json=canonical_json(payload),
        )
        session.add(sfv)
    session.flush()

def _collect_envelope_values(session: Session, envelope_id: int):
    fields = session.exec(select(Field).where(Field.envelope_id == envelope_id)).all()
    field_map = {f.id: f for f in fields}
    signer_ids = session.exec(select(Signer.id).where(Signer.envelope_id == envelope_id)).all()
    if not signer_ids:
        return {}
    rows = session.exec(
        select(SignerFieldValue).where(SignerFieldValue.signer_id.in_(signer_ids))
    ).all()
    combined = {}
    for row in rows:
        field = field_map.get(row.field_id)
        if not field:
            continue
        try:
            data = json.loads(row.value_json or "{}")
        except json.JSONDecodeError:
            data = {}
        value = data.get("value")
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        combined[str(field.id)] = {
            "type": field.type,
            "page": field.page,
            "x": field.x,
            "y": field.y,
            "w": field.w,
            "h": field.h,
            "value": value,
            "font": data.get("font") or field.font_family or "sans",
        }
    return combined

# ---------- routes ----------

@router.get("/{token}")
def load_signing_session(token: str, request: Request, session: Session = Depends(get_session)):
    # decode token and load signer/envelope/fields
    data = read_token(token)
    signer = session.get(Signer, data.get("signer_id"))
    if not signer:
        raise HTTPException(404, "not found")
    env = session.get(Envelope, signer.envelope_id)
    if not env:
        raise HTTPException(404, "not found")
    final_artifact = session.exec(select(FinalArtifact).where(FinalArtifact.envelope_id == env.id)).first()
    all_signers = session.exec(select(Signer).where(Signer.envelope_id == env.id)).all()
    waiting_on = len([s for s in all_signers if s.status != "completed" and s.id != signer.id])
    fields = session.exec(select(Field).where(Field.envelope_id==env.id)).all()
    filtered_fields = []
    for field in fields:
        if field.signer_id and field.signer_id != signer.id:
            continue
        if field.signer_id is None and field.role and signer.role and field.role != signer.role:
            continue
        filtered_fields.append(field)
    _append_event(session, env.id, f"signer:{signer.id}", "opened", {}, ip=request.client.host, ua=request.headers.get("user-agent"))
    return {
        "envelope": sa_to_dict(env),
        "signer": sa_to_dict(signer),
        "waiting_on": waiting_on,
        "final_artifact": sa_to_dict(final_artifact) if final_artifact else None,
        "fields": [sa_to_dict(f) for f in filtered_fields],
    }

@router.get("/{token}/pdf")
def get_original_pdf(token: str, session: Session = Depends(get_session)):
    data = read_token(token)
    signer = session.get(Signer, data.get("signer_id"))
    if not signer:
        raise HTTPException(404, "not found")
    env = session.get(Envelope, signer.envelope_id)
    if not env:
        raise HTTPException(404, "not found")
    doc = session.get(Document, env.document_id)
    if not doc:
        raise HTTPException(404, "not found")
    pdf_bytes = get_bytes(doc.s3_key)
    return Response(content=pdf_bytes, media_type="application/pdf")

@router.get("/{token}/final-pdf")
def get_final_pdf(token: str, session: Session = Depends(get_session)):
    data = read_token(token)
    signer = session.get(Signer, data.get("signer_id"))
    if not signer:
        raise HTTPException(404, "not found")
    env = session.get(Envelope, signer.envelope_id)
    if not env:
        raise HTTPException(404, "not found")
    final_artifact = session.exec(select(FinalArtifact).where(FinalArtifact.envelope_id == env.id)).first()
    if not final_artifact:
        raise HTTPException(404, "final artifact not ready")
    pdf_bytes = get_bytes(final_artifact.s3_key_pdf)
    return Response(content=pdf_bytes, media_type="application/pdf")

@router.post("/{token}/save")
def save_partial(token: str, payload: SignSave, session: Session = Depends(get_session)):
    data = read_token(token)
    signer = session.get(Signer, data.get("signer_id"))
    if not signer:
        raise HTTPException(404, "not found")
    env = session.get(Envelope, signer.envelope_id)
    _persist_field_values(session, signer, payload.values or {})
    _append_event(session, env.id, f"signer:{signer.id}", "filled", {"values": payload.values})
    return {"ok": True}

@router.post("/{token}/consent")
def accept_consent(token: str, payload: ConsentAccept, session: Session = Depends(get_session)):
    data = read_token(token)
    signer = session.get(Signer, data.get("signer_id"))
    if not signer:
        raise HTTPException(404, "not found")
    env = session.get(Envelope, signer.envelope_id)
    if not payload.accepted:
        raise HTTPException(400, "consent required")
    _append_event(session, env.id, f"signer:{signer.id}", "consented", {})
    return {"ok": True}

@router.post("/{token}/complete")
def complete_signing(token: str, payload: SignSave, session: Session = Depends(get_session)):
    data = read_token(token)
    signer = session.get(Signer, data.get("signer_id"))
    if not signer:
        raise HTTPException(404, "not found")
    env = session.get(Envelope, signer.envelope_id)

    _persist_field_values(session, signer, payload.values or {})
    signer.status = "completed"
    signer.completed_at = datetime.utcnow()
    session.add(signer); session.flush()

    remaining = session.exec(
        select(Signer).where(Signer.envelope_id == env.id, Signer.status != "completed")
    ).all()
    response: dict = {"ok": True}
    _append_event(session, env.id, f"signer:{signer.id}", "completed", {"signer_id": signer.id})

    if remaining:
        session.commit()
        response["status"] = "waiting"
        response["waiting_on"] = len(remaining)
        return response

    existing = session.exec(select(FinalArtifact).where(FinalArtifact.envelope_id == env.id)).first()
    if existing:
        response["sha256_final"] = existing.sha256_final
        response["sealed"] = True
        session.commit()
        return response

    aggregate_values = _collect_envelope_values(session, env.id)
    doc = session.get(Document, env.document_id)
    original = get_bytes(doc.s3_key)
    from ..worker_stub import seal_pdf
    final_pdf, audit_json, sha_final = seal_pdf(original, env.id, aggregate_values)
    key_pdf = f"projects/{doc.project_id}/final/envelopes/{env.id}.pdf"
    key_audit = f"projects/{doc.project_id}/final/envelopes/{env.id}.audit.json"
    put_bytes(key_pdf, final_pdf, content_type="application/pdf")
    put_bytes(key_audit, audit_json.encode(), content_type="application/json")
    fa = FinalArtifact(envelope_id=env.id, s3_key_pdf=key_pdf, s3_key_audit_json=key_audit, sha256_final=sha_final)
    env.status = "completed"
    session.add(fa)
    session.add(env)
    session.commit()
    _append_event(session, env.id, "system", "sealed", {"sha256_final": sha_final})
    response["sha256_final"] = sha_final
    response["sealed"] = True

    # Notify all parties with the executed PDF attached
    signers = session.exec(select(Signer).where(Signer.envelope_id == env.id)).all()
    filename = doc.filename or f"Envelope {env.id}"
    subject = f"Completed: {filename}"
    sha_line = f"Final SHA256: {sha_final}"
    requester_given_name = (env.requester_name or "").strip() or None
    requester_email = (env.requester_email or "").strip() or None
    invited_by = requester_given_name or "Your team"
    invited_contact = f"{invited_by}{f' · {requester_email}' if requester_email else ''}"
    plain_body = (
        f"All parties have finished signing {filename}.\n"
        f"Requested by: {invited_contact}\n\n"
        f"{sha_line}\n\nA copy of the executed PDF is attached for your records."
    )
    base_name = filename[:-4] if filename.lower().endswith(".pdf") else filename
    attachment_name = f"{base_name} - executed.pdf"
    html_body = f"""
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f6f8; padding: 24px;">
    <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 10px 25px rgba(15,23,42,0.08);">
      <h2 style="margin-top: 0; font-size: 20px; color: #0f172a;">Completed</h2>
      <p style="font-size: 14px; color: #1e293b; line-height: 1.5;">
        All parties have finished signing <strong>{escape(filename)}</strong>.
      </p>
      <p style="font-size: 13px; color: #475569; margin-top: -4px;">
        Requested by {escape(invited_contact)}
      </p>
      <p style="font-size: 13px; color: #475569; background: #f8fafc; padding: 12px 16px; border-radius: 8px;">
        {escape(sha_line)}
      </p>
      <p style="font-size: 13px; color: #475569;">A copy of the executed PDF is attached for your records.</p>
    </div>
  </body>
</html>
"""
    attachments = [{
        "filename": attachment_name,
        "content": final_pdf,
        "maintype": "application",
        "subtype": "pdf",
    }]
    sender_label = format_sender_name(requester_given_name)
    for s in signers:
        send_email(
            s.email,
            subject,
            plain_body,
            html_body=html_body,
            attachments=attachments,
            sender_name=sender_label,
            reply_to=requester_email,
        )
    return response
