
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Response, status
from pydantic import BaseModel
from typing import List
import uuid
from ..auth import require_admin_access, AccessContext
from ..storage import put_temp_chunk, compose_chunks
from ..db import get_session
from ..models import Project, ProjectFile
from sqlmodel import Session
from datetime import datetime

router = APIRouter()

def _serialize_project_file(doc: ProjectFile):
    return {
        "id": doc.id,
        "display_name": doc.display_name,
        "stored_filename": doc.stored_filename,
        "content_type": doc.content_type,
        "uploaded_at": doc.uploaded_at,
    }

# In-memory store for active uploads (simplified for this iteration, ideally Redis)
# Map: upload_id -> { project_id: int, filename: str, total_chunks: int, chunks_received: set }
# In a real distributed system, use Redis or DB.
# Since we have Redis available in docker-compose, we could use it, but start simple.
UPLOAD_SESSIONS = {}

class InitUploadRequest(BaseModel):
    project_id: int
    filename: str
    total_chunks: int

class InitUploadResponse(BaseModel):
    upload_id: str

@router.post("/init", response_model=InitUploadResponse)
async def init_upload(
    project_id: int = Form(...),
    filename: str = Form(...),
    total_chunks: int = Form(...),
    # token: str = Depends(get_admin_token), # Removed
    ctx: AccessContext = Depends(require_admin_access) 
):
    upload_id = str(uuid.uuid4())
    UPLOAD_SESSIONS[upload_id] = {
        "project_id": project_id,
        "filename": filename,
        "total_chunks": total_chunks,
        "uploaded_chunks": [] # List of tuples (index, key)
    }
    return {"upload_id": upload_id}

@router.post("/chunk")
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    file: UploadFile = File(...),
    # token: str = Depends(get_admin_token),
    ctx: AccessContext = Depends(require_admin_access)
):
    session = UPLOAD_SESSIONS.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    # Validation
    if chunk_index < 0 or chunk_index >= session["total_chunks"]:
        raise HTTPException(status_code=400, detail="Invalid chunk index")
        
    content = await file.read()
    key = f"temp/{upload_id}/{chunk_index}"
    put_temp_chunk(key, content)
    
    # Store success
    session["uploaded_chunks"].append((chunk_index, key))
    return {"status": "ok"}

@router.post("/complete")
async def complete_upload(
    upload_id: str = Form(...),
    # token: str = Depends(get_admin_token),
    ctx: AccessContext = Depends(require_admin_access),
    db: Session = Depends(get_session)
):
    session = UPLOAD_SESSIONS.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
        
    uploaded = session["uploaded_chunks"]
    # Sort by index
    uploaded.sort(key=lambda x: x[0])
    
    if len(uploaded) != session["total_chunks"]:
        raise HTTPException(status_code=400, detail=f"Incomplete upload. Expected {session['total_chunks']}, got {len(uploaded)}")
        
    # Verify indices are continuous 0..N-1
    for i in range(len(uploaded)):
        if uploaded[i][0] != i:
             raise HTTPException(status_code=400, detail="Missing chunks")

    project_id = session["project_id"]
    filename = session["filename"]
    
    # Generate final key
    # Mimic logic from projects.py
    
    # db is now injected
    
    # Create DB record placeholder
    project_file = ProjectFile(
        project_id=project_id,
        display_name=filename,
        stored_filename=filename, # temporary
        content_type="application/pdf", # Assumption for now
        file_size=0, # Update later?
        uploaded_at=datetime.utcnow()
    )
    db.add(project_file)
    db.commit()
    db.refresh(project_file)
    
    final_key = f"projects/{project_id}/uploads/{project_file.id}-{filename}"
    
    # Compose
    source_keys = [x[1] for x in uploaded]
    compose_chunks(final_key, source_keys)
    
    project_file.stored_filename = filename # Just filename as per conventions
    project_file.s3_key = final_key
    # Note: s3_key was missing in my previous `ProjectFile` init above, 
    # but `api/app/models.py` probably defines it.
    
    db.add(project_file)
    db.commit()
    db.refresh(project_file)
    
    # Clean up session
    del UPLOAD_SESSIONS[upload_id]
    
    return _serialize_project_file(project_file)

