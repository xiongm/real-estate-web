from io import BytesIO

from pypdf import PdfWriter
from sqlmodel import Session

from app import db as db_module
from app import summary as summary_module
from app.models import Document, Envelope


def _make_pdf_bytes() -> bytes:
    buffer = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buffer)
    return buffer.getvalue()


def test_generate_envelope_summary_stores_value(client, mock_storage, monkeypatch):
    raw_summary = "This summary is definitely longer than the limit"
    monkeypatch.setattr(summary_module, "ENABLE_DOC_SUMMARY", True)
    monkeypatch.setattr(summary_module, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(summary_module, "DOC_SUMMARY_CHAR_LIMIT", 20)

    class FakeResponse:
        def __init__(self, content: str):
            self.choices = [type("Choice", (), {"message": type("Message", (), {"content": content})()})]

    class FakeCompletions:
        def create(self, **kwargs):
            return FakeResponse(raw_summary)

    class FakeChat:
        def __init__(self):
            self.completions = FakeCompletions()

    class FakeClient:
        def __init__(self):
            self.chat = FakeChat()

    monkeypatch.setattr(summary_module, "_get_client", lambda: FakeClient())

    pdf_bytes = _make_pdf_bytes()
    key = "projects/1/uploads/doc.pdf"
    mock_storage[key] = pdf_bytes

    with Session(db_module.engine) as session:
        doc = Document(project_id=1, filename="doc.pdf", s3_key=key)
        session.add(doc)
        session.commit()
        session.refresh(doc)
        env = Envelope(project_id=1, document_id=doc.id)
        session.add(env)
        session.commit()
        session.refresh(env)

        result = summary_module.generate_envelope_summary(session, env, doc)
        session.refresh(env)

    assert result
    assert env.summary
    assert len(env.summary) <= 20
    # trimmed to a whole word with ellipsis when needed
    assert env.summary.startswith("This summary is")
    assert not env.summary.endswith(" ")


def test_get_envelope_includes_summary(client):
    with Session(db_module.engine) as session:
        doc = Document(project_id=1, filename="doc.pdf", s3_key="noop.pdf")
        session.add(doc)
        session.commit()
        session.refresh(doc)
        env = Envelope(project_id=1, document_id=doc.id, summary="API summary text")
        session.add(env)
        session.commit()
        session.refresh(env)
        env_id = env.id

    resp = client.get(f"/api/envelopes/{env_id}", headers={"X-Access-Token": "admin-test-token"})
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("summary") == "API summary text"
