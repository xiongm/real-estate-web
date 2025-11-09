
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import projects, documents, envelopes, signing, project_investors
from .db import init_db

app = FastAPI(title="Signing API (Python stamper)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(documents.router, prefix="/api/projects", tags=["documents"])  # nested
app.include_router(project_investors.router, prefix="/api/projects", tags=["project-investors"])
app.include_router(envelopes.router, prefix="/api/envelopes", tags=["envelopes"])
app.include_router(signing.router, prefix="/api/sign", tags=["signing"])

@app.get("/")
def root():
    return {"ok": True, "service": "signing-api"}
