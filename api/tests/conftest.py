import os
from typing import Dict

import pytest
from fastapi.testclient import TestClient
from minio.error import S3Error
from sqlmodel import SQLModel, Session, create_engine

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")

from app.main import app  # noqa: E402
from app import db as db_module  # noqa: E402
from app.db import get_session  # noqa: E402
from app import storage as storage_module  # noqa: E402
from app.routers import projects as projects_router  # noqa: E402
from app import email as email_module  # noqa: E402


@pytest.fixture(scope="session")
def test_engine(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("data") / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    return engine


@pytest.fixture
def setup_db(test_engine):
    SQLModel.metadata.drop_all(test_engine)
    SQLModel.metadata.create_all(test_engine)
    yield
    SQLModel.metadata.drop_all(test_engine)


@pytest.fixture
def mock_storage(monkeypatch) -> Dict[str, bytes]:
    store: Dict[str, bytes] = {}

    def fake_put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream"):
        store[key] = bytes(data)

    def fake_get_bytes(key: str) -> bytes:
        if key not in store:
            raise S3Error("NoSuchKey", "missing", f"/{key}", "test-request", "test-host")
        return store[key]

    def fake_delete_object(key: str):
        store.pop(key, None)

    from app.routers import envelopes, signing  # noqa: E402

    for target in (storage_module, projects_router, envelopes, signing):
        if hasattr(target, "put_bytes"):
            monkeypatch.setattr(target, "put_bytes", fake_put_bytes)
        if hasattr(target, "get_bytes"):
            monkeypatch.setattr(target, "get_bytes", fake_get_bytes)
        if hasattr(target, "delete_object"):
            monkeypatch.setattr(target, "delete_object", fake_delete_object)
    return store


@pytest.fixture
def sent_emails(monkeypatch):
    messages = []

    def fake_send_email(to, subject, text_body, html_body=None, attachments=None):
        messages.append(
            {
                "to": to,
                "subject": subject,
                "text": text_body,
                "html": html_body,
                "attachments": attachments or [],
            }
        )

    for target in (email_module,):
        monkeypatch.setattr(target, "send_email", fake_send_email)
    from app.routers import envelopes, signing  # noqa: E402

    monkeypatch.setattr(envelopes, "send_email", fake_send_email)
    monkeypatch.setattr(signing, "send_email", fake_send_email)
    return messages


@pytest.fixture
def client(test_engine, setup_db, mock_storage):
    db_module.engine = test_engine

    def override_session():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
