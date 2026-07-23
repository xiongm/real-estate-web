import os
from sqlmodel import Session, select

from app.models import (
    Document,
    Envelope,
    Event,
    FinalArtifact,
    Project,
    ProjectInvestor,
    Signer,
    SignerFieldValue,
    SigningSession,
    Field as FieldModel,
)
from app.utils import make_token

SIMPLE_PDF = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n"
    b"4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 72 100 Td (Hello) Tj ET\nendstream\nendobj\n"
    b"xref\n0 5\n"
    b"0000000000 65535 f \n"
    b"0000000010 00000 n \n"
    b"0000000057 00000 n \n"
    b"0000000116 00000 n \n"
    b"0000000211 00000 n \n"
    b"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n300\n%%EOF\n"
)

SIMPLE_SIGNATURE_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/Pf8icQAAAABJRU5ErkJggg=="

ADMIN_HEADERS = {"X-Access-Token": os.getenv("ADMIN_ACCESS_TOKEN", "admin-test-token")}


def create_project(client, name="Alpha Project"):
    response = client.post(f"/api/projects?name={name}", headers=ADMIN_HEADERS)
    assert response.status_code == 200
    data = response.json()
    return data["id"], data.get("access_token")


def test_project_name_unique_constraint(client):
    first_id, _ = create_project(client, "Houston Tower")
    assert first_id
    duplicate_resp = client.post("/api/projects?name=Houston Tower", headers=ADMIN_HEADERS)
    assert duplicate_resp.status_code == 409
    assert "already exists" in duplicate_resp.text


def test_project_patch_updates_name(client):
    project_id, _ = create_project(client, "Original Plaza")
    resp = client.patch(
        f"/api/projects/{project_id}",
        json={"name": "Updated Plaza"},
        headers=ADMIN_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Updated Plaza"

    conflict_id, _ = create_project(client, "Another Plaza")
    conflict_resp = client.patch(
        f"/api/projects/{conflict_id}",
        json={"name": "Updated Plaza"},
        headers=ADMIN_HEADERS,
    )
    assert conflict_resp.status_code == 409


def upload_document(client, project_id, filename="sample.pdf", content=b"%PDF-1.4 test"):
    response = client.post(
        f"/api/projects/{project_id}/documents",
        files={"file": (filename, content, "application/pdf")},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200
    return response.json()


def test_project_summary_with_project_token(client):
    project_id, token = create_project(client, "Investor Pack")
    assert token
    document = upload_document(client, project_id, filename="pack.pdf", content=b"bytes")
    investor_payload = {
        "name": "Investor 1",
        "email": "investor1@example.com",
        "units_invested": 100,
        "mailing_address": "123 Anywhere St, Springfield",
        "bank_name": "Figma Bank",
        "bank_account_number": "123456789",
        "bank_routing_number": "021000021",
    }
    inv_response = client.post(
        f"/api/projects/{project_id}/investors",
        json=investor_payload,
        headers=ADMIN_HEADERS,
    )
    assert inv_response.status_code == 201

    file_resp = client.post(
        f"/api/projects/{project_id}/files",
        data={"label": "Offering Memo"},
        files={"file": ("memo.pdf", b"memo-data", "application/pdf")},
        headers=ADMIN_HEADERS,
    )
    assert file_resp.status_code == 201

    summary_resp = client.get(
        f"/api/projects/{project_id}/summary",
        headers={"X-Access-Token": token},
    )
    assert summary_resp.status_code == 200
    body = summary_resp.json()
    assert body["project"]["name"] == "Investor Pack"
    assert any(doc["id"] == document["id"] for doc in body["documents"])
    assert len(body["investors"]) == 1
    investor_view = body["investors"][0]
    assert investor_view["mailing_address"] == investor_payload["mailing_address"]
    assert investor_view["bank_name"] == investor_payload["bank_name"]
    assert investor_view["bank_account_number"] == investor_payload["bank_account_number"]
    assert investor_view["bank_routing_number"] == investor_payload["bank_routing_number"]
    assert len(body["project_files"]) == 1
    assert body["project_files"][0]["display_name"] == "Offering Memo"


def test_document_download_allows_query_token(client, mock_storage):
    project_id, token = create_project(client, "Query Access")
    document = upload_document(client, project_id, filename="query.pdf", content=b"doc-bytes")
    resp = client.get(
        f"/api/projects/{project_id}/documents/{document['id']}/pdf?token={token}",
    )
    assert resp.status_code == 200
    assert resp.content == b"doc-bytes"


def test_document_download_returns_original_file(client, mock_storage):
    project_id, _ = create_project(client)
    document = upload_document(client, project_id, filename="investor-pack.pdf", content=b"pdf-bytes")

    response = client.get(
        f"/api/projects/{project_id}/documents/{document['id']}/pdf",
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    assert response.content == b"pdf-bytes"
    assert "investor-pack.pdf" in response.headers.get("content-disposition", "")


def test_project_files_upload_list_delete(client, mock_storage):
    project_id, _ = create_project(client, "General Docs")
    upload_resp = client.post(
        f"/api/projects/{project_id}/files",
        data={"label": "Pitch Deck"},
        files={"file": ("deck.pdf", b"deck-bytes", "application/pdf")},
        headers=ADMIN_HEADERS,
    )
    assert upload_resp.status_code == 201
    file_doc = upload_resp.json()
    assert file_doc["display_name"] == "Pitch Deck"

    list_resp = client.get(f"/api/projects/{project_id}/files", headers=ADMIN_HEADERS)
    assert list_resp.status_code == 200
    files = list_resp.json()
    assert len(files) == 1
    file_id = files[0]["id"]

    download_resp = client.get(
        f"/api/projects/{project_id}/files/{file_id}/download",
        headers=ADMIN_HEADERS,
    )
    assert download_resp.status_code == 200
    assert download_resp.content == b"deck-bytes"

    delete_resp = client.delete(
        f"/api/projects/{project_id}/files/{file_id}",
        headers=ADMIN_HEADERS,
    )
    assert delete_resp.status_code == 204

    list_after = client.get(f"/api/projects/{project_id}/files", headers=ADMIN_HEADERS)
    assert list_after.status_code == 200
    assert list_after.json() == []


def test_project_delete_cascades_all_records(client, test_engine, mock_storage):
    project_id, _ = create_project(client)
    document = upload_document(client, project_id, filename="deal.pdf", content=b"deal-data")

    investor_payload = {"name": "Alex", "email": "alex@example.com", "units_invested": 1000}
    inv_response = client.post(
        f"/api/projects/{project_id}/investors",
        json=investor_payload,
        headers=ADMIN_HEADERS,
    )
    assert inv_response.status_code == 201

    with Session(test_engine) as session:
        doc_record = session.get(Document, document["id"])
        envelope = Envelope(project_id=project_id, document_id=doc_record.id, subject="Sign", message="Please sign")
        session.add(envelope)
        session.commit()
        session.refresh(envelope)

        signer = Signer(envelope_id=envelope.id, name="Alex", email="alex@example.com")
        session.add(signer)
        session.commit()
        session.refresh(signer)

        field = FieldModel(envelope_id=envelope.id, page=1, x=10, y=10, w=120, h=30, type="signature")
        session.add(field)
        session.commit()
        session.refresh(field)

        session.add(SigningSession(signer_id=signer.id, token_hash="tok"))
        session.add(SignerFieldValue(signer_id=signer.id, field_id=field.id, value_json="{}"))
        session.add(Event(envelope_id=envelope.id, actor="system", type="created", meta_json="{}"))

        final_pdf_key = f"projects/{project_id}/final/envelope-{envelope.id}.pdf"
        final_audit_key = f"{final_pdf_key}.audit.json"
        session.add(
            FinalArtifact(
                envelope_id=envelope.id,
                s3_key_pdf=final_pdf_key,
                s3_key_audit_json=final_audit_key,
                sha256_final="deadbeef",
            )
        )
        session.commit()

        mock_storage[doc_record.s3_key] = b"doc"
        mock_storage[final_pdf_key] = b"final"
        mock_storage[final_audit_key] = b"audit"

    delete_response = client.delete(f"/api/projects/{project_id}", headers=ADMIN_HEADERS)
    assert delete_response.status_code == 204

    with Session(test_engine) as session:
        assert session.exec(select(Project).where(Project.id == project_id)).first() is None
        for model in (Document, Envelope, ProjectInvestor, FinalArtifact, Signer, FieldModel, SigningSession, SignerFieldValue, Event):
            assert session.exec(select(model)).first() is None

    assert mock_storage == {}


def test_envelope_send_and_sign_flow(client, test_engine, mock_storage, sent_emails):
    project_id, project_token = create_project(client, "Beta Project")
    investor_payload = {"name": "Jamie Investor", "email": "jamie@example.com", "units_invested": 2500}
    inv_response = client.post(
        f"/api/projects/{project_id}/investors",
        json=investor_payload,
        headers=ADMIN_HEADERS,
    )
    assert inv_response.status_code == 201
    investor_id = inv_response.json()["id"]

    document = upload_document(client, project_id, filename="subscription.pdf", content=SIMPLE_PDF)

    envelope_payload = {
        "project_id": project_id,
        "document_id": document["id"],
        "subject": "Signature requested: subscription.pdf",
        "message": "Please review and sign.",
        "signers": [
            {
                "project_investor_id": investor_id,
                "name": "Jamie Investor",
                "email": "jamie@example.com",
            }
        ],
        "fields": [
            {
                "page": 1,
                "x": 50,
                "y": 100,
                "w": 200,
                "h": 40,
                "type": "signature",
                "signer_key": str(investor_id),
                "name": "Investor Signature",
            }
        ],
    }
    create_env_resp = client.post("/api/envelopes", json=envelope_payload, headers=ADMIN_HEADERS)
    assert create_env_resp.status_code == 200
    envelope_id = create_env_resp.json()["id"]

    send_resp = client.post(
        f"/api/envelopes/{envelope_id}/send",
        json={"requester_name": "Admin User", "requester_email": "admin@example.com"},
        headers=ADMIN_HEADERS,
    )
    assert send_resp.status_code == 200
    assert sent_emails, "Expected at least one email to be queued"
    first_email = sent_emails[0]
    assert first_email["reply_to"] == "admin@example.com"
    assert first_email["sender_name"] == "Admin User via Real Estate Signing"

    with Session(test_engine) as session:
        signer = session.exec(select(Signer).where(Signer.envelope_id == envelope_id)).first()
        assert signer is not None
        field = session.exec(select(FieldModel).where(FieldModel.envelope_id == envelope_id)).first()
        assert field is not None

    token = make_token({"signer_id": signer.id, "envelope_id": envelope_id})
    load_resp = client.get(f"/api/sign/{token}")
    assert load_resp.status_code == 200
    assert load_resp.json()["envelope"]["status"] == "sent"

    consent_resp = client.post(f"/api/sign/{token}/consent", json={"accepted": True})
    assert consent_resp.status_code == 200

    complete_payload = {"values": {str(field.id): {"value": SIMPLE_SIGNATURE_B64}}}
    complete_resp = client.post(f"/api/sign/{token}/complete", json=complete_payload)
    assert complete_resp.status_code == 200
    body = complete_resp.json()
    assert body.get("sealed") is True
    assert "sha256_final" in body

    with Session(test_engine) as session:
        final_artifact = session.exec(select(FinalArtifact).where(FinalArtifact.envelope_id == envelope_id)).first()
        assert final_artifact is not None
        assert mock_storage[final_artifact.s3_key_pdf]
    assert mock_storage[final_artifact.s3_key_audit_json]


def test_envelope_draft_save_resume_and_revision_conflict(client):
    project_id, project_token = create_project(client, "Draft Project")
    investor_response = client.post(
        f"/api/projects/{project_id}/investors",
        json={"name": "Draft Investor", "email": "draft@example.com", "units_invested": 100},
        headers=ADMIN_HEADERS,
    )
    investor_id = investor_response.json()["id"]
    document = upload_document(client, project_id, filename="draft.pdf", content=SIMPLE_PDF)
    payload = {
        "project_id": project_id,
        "document_id": document["id"],
        "subject": "Draft request",
        "message": "Review later",
        "signers": [
            {
                "client_id": f"investor-{investor_id}",
                "project_investor_id": investor_id,
                "name": "Draft Investor",
                "email": "draft@example.com",
            }
        ],
        "fields": [
            {
                "page": 1,
                "x": 40,
                "y": 50,
                "w": 120,
                "h": 30,
                "type": "initials",
                "signer_key": str(investor_id),
            }
        ],
    }

    create_response = client.post("/api/envelopes/drafts", json=payload, headers=ADMIN_HEADERS)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["status"] == "draft"
    assert created["revision"] == 1
    assert created["fields"][0]["project_investor_id"] == investor_id

    update_payload = {**payload, "revision": 1, "subject": "Updated draft request"}
    update_response = client.put(
        f"/api/envelopes/{created['id']}/draft",
        json=update_payload,
        headers=ADMIN_HEADERS,
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["revision"] == 2
    assert updated["subject"] == "Updated draft request"

    stale_response = client.put(
        f"/api/envelopes/{created['id']}/draft",
        json=update_payload,
        headers=ADMIN_HEADERS,
    )
    assert stale_response.status_code == 409

    resume_response = client.get(f"/api/envelopes/{created['id']}", headers=ADMIN_HEADERS)
    assert resume_response.status_code == 200
    assert resume_response.json()["fields"][0]["type"] == "initials"

    project_listing = client.get(
        f"/api/projects/{project_id}/envelopes",
        headers={"X-Access-Token": project_token},
    )
    assert project_listing.status_code == 200
    assert project_listing.json() == []

    incomplete_payload = {
        **payload,
        "subject": "Incomplete draft",
        "signers": [],
        "fields": [],
    }
    incomplete_response = client.post("/api/envelopes/drafts", json=incomplete_payload, headers=ADMIN_HEADERS)
    assert incomplete_response.status_code == 200
    incomplete_id = incomplete_response.json()["id"]

    failed_send = client.post(
        f"/api/envelopes/{incomplete_id}/send",
        json={"subject": "Should not persist", "message": "Should not persist"},
        headers=ADMIN_HEADERS,
    )
    assert failed_send.status_code == 400

    preserved_response = client.get(f"/api/envelopes/{incomplete_id}", headers=ADMIN_HEADERS)
    assert preserved_response.status_code == 200
    assert preserved_response.json()["subject"] == "Incomplete draft"
    assert preserved_response.json()["message"] == "Review later"
