import logging
from io import BytesIO
from threading import Thread
from typing import Optional

from openai import OpenAI
from pypdf import PdfReader
from sqlmodel import Session

from .config import (
    DOC_SUMMARY_CHAR_LIMIT,
    DOC_SUMMARY_MODEL,
    DOC_SUMMARY_TIMEOUT,
    ENABLE_DOC_SUMMARY,
    OPENAI_API_KEY,
)
from . import db
from .models import Document, Envelope
from .storage import get_bytes

logger = logging.getLogger(__name__)
_client: Optional[OpenAI] = None


def _get_client() -> Optional[OpenAI]:
    global _client
    if not OPENAI_API_KEY:
        logger.warning("Doc summary skipped: OPENAI_API_KEY not set")
        return None
    if _client is None:
        try:
            _client = OpenAI(api_key=OPENAI_API_KEY)
        except Exception as exc:  # pragma: no cover - defensive guard
            logger.warning("Failed to initialize OpenAI client: %s", exc)
            return None
    return _client


def _extract_text(pdf_bytes: bytes, max_pages: int = 5, max_chars: int = 6000) -> str:
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        chunks: list[str] = []
        for idx, page in enumerate(reader.pages):
            if idx >= max_pages:
                break
            text = page.extract_text() or ""
            if text:
                chunks.append(text.strip())
            if sum(len(chunk) for chunk in chunks) >= max_chars:
                break
        combined = "\n\n".join(chunks)
        return combined[:max_chars]
    except Exception as exc:
        logger.warning("PDF text extraction failed: %s", exc)
        return ""


def _trim_to_sentence(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    snippet = text[:limit]
    for sep in (". ", "! ", "? ", ".\n", "!\n", "?\n"):
        idx = snippet.rfind(sep)
        if idx != -1 and idx >= int(limit * 0.5):
            return snippet[: idx + 1].strip()
    last_space = snippet.rfind(" ")
    if last_space != -1 and last_space >= int(limit * 0.5):
        trimmed = snippet[:last_space].rstrip()
        return f"{trimmed}…"
    return snippet.rstrip()


def _summarize_text(text: str, *, limit: int) -> tuple[Optional[str], Optional[str]]:
    client = _get_client()
    if not client:
        return None, None
    prompt_text = text.strip() or "No readable text was extracted from this PDF. Provide a brief summary based on common signing documents."

    def _model_opts(model: str):
        is_gpt5 = model.lower().startswith("gpt-5")
        if is_gpt5:
            return {"max_completion_tokens": 10000}
        return {"max_tokens": 256, "temperature": 0.0}

    def _call_model(model: str) -> Optional[str]:
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You summarize signing documents for signers. "
                            "Return a concise summary in plain English that helps a signer understand what they are signing. "
                            f"The output MUST be no more than {limit} characters. If needed, abbreviate to stay under {limit} characters."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Summarize the document in at most {limit} characters. "
                            "Focus on the subject, key obligations, deadlines, and notable amounts. "
                            "Avoid speculation and keep it neutral. Do not exceed the character limit.\n\n"
                            f"Document text:\n{prompt_text}"
                        ),
                    },
                ],
                **_model_opts(model),
                timeout=DOC_SUMMARY_TIMEOUT,
            )
        except Exception as exc:
            logger.warning("OpenAI summary request failed for %s: %s", model, exc)
            return None
        choice = response.choices[0] if response.choices else None
        raw_content = choice.message.content if choice and choice.message else None
        content: str | None = None
        if isinstance(raw_content, str):
            content = raw_content
        elif isinstance(raw_content, list):
            parts: list[str] = []
            for part in raw_content:
                if isinstance(part, dict):
                    if isinstance(part.get("text"), str):
                        parts.append(part["text"])
                    elif "content" in part and isinstance(part["content"], str):
                        parts.append(part["content"])
                elif part:
                    parts.append(str(part))
            content = " ".join(parts).strip() if parts else None
        if not content:
            logger.warning("Doc summary returned empty content for model %s", model)
            return None
        cleaned = " ".join(content.split()).strip()
        if not cleaned:
            logger.warning("Doc summary content blank after cleaning")
            return None
        return _trim_to_sentence(cleaned, limit)

    primary = DOC_SUMMARY_MODEL or "gpt-5-mini"
    summary = _call_model(primary)
    if summary:
        return summary, primary
    if primary != "gpt-4o-mini":
        logger.warning("Doc summary falling back to gpt-4o-mini after empty result from %s", primary)
        fallback = _call_model("gpt-4o-mini")
        if fallback:
            return fallback, "gpt-4o-mini"
    return None, primary


def summarize_pdf(pdf_bytes: bytes, *, limit: Optional[int] = None) -> tuple[Optional[str], Optional[str]]:
    text = _extract_text(pdf_bytes)
    target_limit = limit if limit is not None else DOC_SUMMARY_CHAR_LIMIT
    return _summarize_text(text, limit=target_limit)


def generate_envelope_summary(session: Session, envelope: Envelope, document: Document, *, force: bool = False) -> Optional[str]:
    if not ENABLE_DOC_SUMMARY and not force:
        logger.warning("Doc summary disabled via flag; skipping envelope %s", envelope.id)
        return envelope.summary
    if envelope.summary:
        return envelope.summary
    try:
        pdf_bytes = get_bytes(document.s3_key)
    except Exception as exc:
        logger.warning("Failed to fetch PDF for summary (doc %s): %s", document.id, exc)
        return None
    summary, used_model = summarize_pdf(pdf_bytes)
    if not summary:
        logger.warning("Doc summary generation returned no result for envelope %s", envelope.id)
        return None
    envelope.summary = summary[:DOC_SUMMARY_CHAR_LIMIT]
    session.add(envelope)
    session.commit()
    session.refresh(envelope)
    logger.info(
        "Doc summary stored for envelope %s via %s (len=%s)",
        envelope.id,
        used_model,
        len(envelope.summary or ""),
    )
    return envelope.summary


def kickoff_envelope_summary(envelope_id: int) -> None:
    if not ENABLE_DOC_SUMMARY or not OPENAI_API_KEY:
        return

    def _run():
        with Session(db.engine) as session:
            env = session.get(Envelope, envelope_id)
            if not env or env.summary:
                return
            doc = session.get(Document, env.document_id)
            if not doc:
                return
            try:
                generate_envelope_summary(session, env, doc)
            except Exception as exc:  # pragma: no cover - defensive guard
                logger.warning("Envelope summary generation failed for %s: %s", envelope_id, exc)

    Thread(target=_run, daemon=True).start()
