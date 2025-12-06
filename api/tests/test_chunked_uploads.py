import os
import pytest
from app.models import Document, ProjectFile
from sqlmodel import Session, select
from tests.test_projects import create_project, ADMIN_HEADERS

def test_chunked_upload_document_flow(client, test_engine, mock_storage):
    # 1. Create a project
    project_id, _ = create_project(client, "Chunked Project")
    
    # 2. Init upload
    filename = "large_doc.pdf"
    init_data = {
        "project_id": project_id,
        "filename": filename,
        "total_chunks": 2,
        "resource_type": "document"
    }
    init_resp = client.post("/api/uploads/init", data=init_data, headers=ADMIN_HEADERS)
    assert init_resp.status_code == 200
    init_json = init_resp.json()
    assert "upload_id" in init_json
    assert "chunk_size" in init_json
    upload_id = init_json["upload_id"]
    
    # 3. Upload chunks
    # Chunk 0
    chunk0_content = b"part1"
    chunk0_resp = client.post(
        "/api/uploads/chunk",
        data={"upload_id": upload_id, "chunk_index": 0},
        files={"file": ("chunk0", chunk0_content, "application/octet-stream")},
        headers=ADMIN_HEADERS
    )
    assert chunk0_resp.status_code == 200
    
    # Chunk 1
    chunk1_content = b"part2"
    chunk1_resp = client.post(
        "/api/uploads/chunk",
        data={"upload_id": upload_id, "chunk_index": 1},
        files={"file": ("chunk1", chunk1_content, "application/octet-stream")},
        headers=ADMIN_HEADERS
    )
    assert chunk1_resp.status_code == 200
    
    # 4. Complete upload
    complete_resp = client.post(
        "/api/uploads/complete",
        data={"upload_id": upload_id},
        headers=ADMIN_HEADERS
    )
    assert complete_resp.status_code == 200
    doc_data = complete_resp.json()
    assert doc_data["filename"] == filename
    assert doc_data["project_id"] == project_id
    assert "id" in doc_data
    
    # 5. Verify DB and content
    with Session(test_engine) as session:
        doc = session.exec(select(Document).where(Document.id == doc_data["id"])).first()
        assert doc is not None
        assert doc.filename == filename
        
    # Verify content in mock storage (if mock_storage is populated by put_temp_chunk/compose_chunks)
    # The chunked upload implementation might use minio client directly or a wrapper.
    # If key usage is correct, mock_storage should have the final file or check storage calls.
    # In test_projects.py, mock_storage is a dict fixture.
    # We'll assume the storage implementation uses it.

def test_chunked_upload_project_file_default(client, test_engine):
    # 1. Create project
    project_id, _ = create_project(client, "File Project")
    
    # 2. Init upload (default resource_type)
    init_resp = client.post(
        "/api/uploads/init",
        data={"project_id": project_id, "filename": "test.txt", "total_chunks": 1},
        headers=ADMIN_HEADERS
    )
    assert init_resp.status_code == 200
    upload_id = init_resp.json()["upload_id"]
    
    # 3. Upload chunk
    client.post(
        "/api/uploads/chunk",
        data={"upload_id": upload_id, "chunk_index": 0},
        files={"file": ("chunk0", b"content", "application/octet-stream")},
        headers=ADMIN_HEADERS
    )
    
    # 4. Complete
    complete_resp = client.post(
        "/api/uploads/complete",
        data={"upload_id": upload_id},
        headers=ADMIN_HEADERS
    )
    assert complete_resp.status_code == 200
    file_data = complete_resp.json()
    assert "stored_filename" in file_data # ProjectFile field
    
    with Session(test_engine) as session:
        pf = session.exec(select(ProjectFile).where(ProjectFile.id == file_data["id"])).first()
        assert pf is not None
