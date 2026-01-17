import os
import pytest
from sqlmodel import Session, select
from app.models import (
    Document,
    Envelope,
    Signer,
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
    b"0000000010 00000 n \n"
    b"0000000057 00000 n \n"
    b"0000000116 00000 n \n"
    b"0000000211 00000 n \n"
    b"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n300\n%%EOF\n"
)

SIMPLE_SIGNATURE_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/Pf8icQAAAABJRU5ErkJggg=="
ADMIN_HEADERS = {"X-Access-Token": os.getenv("ADMIN_ACCESS_TOKEN", "admin-test-token")}

def test_envelope_snapshot_download(client, test_engine, mock_storage):
    # 1. Create project
    resp = client.post("/api/projects?name=Snapshot Test", headers=ADMIN_HEADERS)
    assert resp.status_code == 200
    project_id = resp.json()["id"]

    # 2. Upload document
    resp = client.post(
        f"/api/projects/{project_id}/documents",
        files={"file": ("test.pdf", SIMPLE_PDF, "application/pdf")},
        headers=ADMIN_HEADERS,
    )
    assert resp.status_code == 200
    doc_id = resp.json()["id"]

    # 3. Create envelope
    payload = {
        "project_id": project_id,
        "document_id": doc_id,
        "subject": "Test Snapshot",
        "message": "Please sign",
        "signers": [{"name": "Signer 1", "email": "s1@example.com"}],
        "fields": [
            {
                "page": 1,
                "x": 50,
                "y": 50,
                "w": 100,
                "h": 40,
                "type": "signature",
                "signer_key": "s1@example.com",
                "name": "Sig",
            }
        ],
    }
    resp = client.post("/api/envelopes", json=payload, headers=ADMIN_HEADERS)
    assert resp.status_code == 200
    env_id = resp.json()["id"]

    # 4. Submit a signature
    with Session(test_engine) as session:
        signer = session.exec(select(Signer).where(Signer.envelope_id == env_id)).first()
        field = session.exec(select(FieldModel).where(FieldModel.envelope_id == env_id)).first()
    
    token = make_token({"signer_id": signer.id, "envelope_id": env_id})
    resp = client.post(f"/api/sign/{token}/complete", json={"values": {str(field.id): {"value": SIMPLE_SIGNATURE_B64}}})
    assert resp.status_code == 200

    # 5. Download snapshot as admin
    resp = client.get(f"/api/projects/{project_id}/envelopes/{env_id}/snapshot", headers=ADMIN_HEADERS)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "SNAPSHOT.pdf" in resp.headers["content-disposition"]
    # PDF should be non-empty and different from original if possible (though we just check it returns something)
    assert len(resp.content) > len(SIMPLE_PDF)
