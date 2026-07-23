import os
from sqlmodel import Session

from app import db as db_module
from app.models import AuditEvent, Document, Envelope, FinalArtifact

ADMIN_HEADERS = {"X-Access-Token": os.getenv("ADMIN_ACCESS_TOKEN", "admin-test-token")}


def test_list_project_audit_filters(client):
    create_resp = client.post("/api/projects", params={"name": "AuditProj"}, headers=ADMIN_HEADERS)
    assert create_resp.status_code == 200
    project_id = create_resp.json()["id"]

    with Session(db_module.engine) as session:
        session.add(
            AuditEvent(
                project_id=project_id,
                action="upload",
                resource_type="document",
                resource_id="doc-1",
                actor_type="admin_token",
                actor_id="admin",
                status="success",
                summary="Uploaded document",
            )
        )
        session.add(
            AuditEvent(
                project_id=project_id,
                action="send",
                resource_type="envelope",
                resource_id="env-1",
                actor_type="admin_token",
                actor_id="admin",
                status="success",
                summary="Sent envelope",
            )
        )
        session.commit()

    resp = client.get(
        f"/api/projects/{project_id}/audit",
        headers=ADMIN_HEADERS,
    )
    assert resp.status_code == 200
    data = resp.json()
    actions = {item["action"] for item in data["items"]}
    assert "upload" in actions and "send" in actions

    filtered = client.get(
        f"/api/projects/{project_id}/audit",
        params={"action": "upload"},
        headers=ADMIN_HEADERS,
    ).json()
    assert len(filtered["items"]) == 1
    assert filtered["items"][0]["action"] == "upload"


def test_audit_export_csv(client):
    create_resp = client.post("/api/projects", params={"name": "AuditExport"}, headers=ADMIN_HEADERS)
    assert create_resp.status_code == 200
    project_id = create_resp.json()["id"]

    with Session(db_module.engine) as session:
        session.add(
            AuditEvent(
                project_id=project_id,
                action="send",
                resource_type="envelope",
                resource_id="env-99",
                actor_type="admin_token",
                status="success",
                summary="Sent envelope",
            )
        )
        session.commit()

    resp = client.get(
        f"/api/projects/{project_id}/audit",
        params={"export": "csv"},
        headers=ADMIN_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert b"Sent envelope" in resp.content


def test_document_upload_creates_audit_event(client, mock_storage):
    create_resp = client.post("/api/projects", params={"name": "AuditDoc"}, headers=ADMIN_HEADERS)
    assert create_resp.status_code == 200
    project_id = create_resp.json()["id"]

    upload_resp = client.post(
        f"/api/projects/{project_id}/documents",
        headers=ADMIN_HEADERS,
        files={"file": ("sample.pdf", b"data", "application/pdf")},
    )
    assert upload_resp.status_code == 200

    audit_resp = client.get(
        f"/api/projects/{project_id}/audit",
        headers=ADMIN_HEADERS,
    )
    assert audit_resp.status_code == 200
    items = audit_resp.json()["items"]
    assert any(item["action"] == "upload" and item["resource_type"] == "document" for item in items)


def test_signature_actions_are_audited(client, mock_storage):
    create_resp = client.post("/api/projects", params={"name": "AuditSig"}, headers=ADMIN_HEADERS)
    assert create_resp.status_code == 200
    project_id = create_resp.json()["id"]

    # Create document
    upload_resp = client.post(
        f"/api/projects/{project_id}/documents",
        headers=ADMIN_HEADERS,
        files={"file": ("packet.pdf", b"doc", "application/pdf")},
    )
    doc_id = upload_resp.json()["id"]

    # Create envelope with one signer
    envelope_payload = {
        "project_id": project_id,
        "document_id": doc_id,
        "subject": "Please sign",
        "message": "",
        "signers": [
            {
                "client_id": "sig-one",
                "name": "Sig One",
                "email": "sig1@example.com",
                "role": "Investor",
                "routing_order": 1,
            }
        ],
        "fields": [
            {
                "page": 1,
                "x": 20,
                "y": 20,
                "w": 120,
                "h": 30,
                "type": "signature",
                "signer_key": "sig-one",
            }
        ],
    }
    env_resp = client.post("/api/envelopes", json=envelope_payload, headers=ADMIN_HEADERS)
    assert env_resp.status_code == 200
    env_id = env_resp.json()["id"]

    # Send envelope
    send_resp = client.post(f"/api/envelopes/{env_id}/send", json={}, headers=ADMIN_HEADERS)
    assert send_resp.status_code == 200

    # Fetch audit and validate envelope actions
    audit_resp = client.get(f"/api/projects/{project_id}/audit", headers=ADMIN_HEADERS)
    assert audit_resp.status_code == 200
    actions = {(item["action"], item["resource_type"]) for item in audit_resp.json()["items"]}
    assert ("create", "envelope") in actions
    assert ("send", "envelope") in actions
def test_final_pdf_download_audited(client, mock_storage):
    create_resp = client.post("/api/projects", params={"name": "AuditFinal"}, headers=ADMIN_HEADERS)
    assert create_resp.status_code == 200
    project_id = create_resp.json()["id"]

    # Prepare doc/envelope/final artifact
    with Session(db_module.engine) as session:
        doc = Document(project_id=project_id, filename="final.pdf", s3_key="doc-key")
        session.add(doc)
        session.flush()
        env = Envelope(project_id=project_id, document_id=doc.id, subject="s", status="completed")
        session.add(env)
        session.flush()
        env_id = env.id
        fa = FinalArtifact(envelope_id=env_id, s3_key_pdf="final-key", s3_key_audit_json="audit-key", sha256_final="abc")
        session.add(fa)
        session.commit()
    mock_storage["final-key"] = b"pdf-bytes"

    resp = client.get(
        f"/api/projects/{project_id}/final-artifacts/{env_id}/pdf",
        headers=ADMIN_HEADERS,
    )
    assert resp.status_code == 200

    audit_resp = client.get(
        f"/api/projects/{project_id}/audit",
        headers=ADMIN_HEADERS,
    )
    items = audit_resp.json()["items"]
    assert any(item["action"] == "download" and item["resource_type"] == "final_artifact" for item in items)
