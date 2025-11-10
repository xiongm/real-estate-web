
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text, inspect
from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

def init_db():
    from .models import Tenant, User, Project, Document, Envelope, Signer, Field, SigningSession, Event, FinalArtifact, SignerFieldValue, ProjectInvestor
    SQLModel.metadata.create_all(engine)
    _ensure_project_access_column()
    _ensure_project_name_unique_index()

def get_session():
    with Session(engine) as session:
        yield session

def _ensure_project_access_column():
    inspector = inspect(engine)
    try:
        columns = [col["name"] for col in inspector.get_columns("project")]
    except Exception:
        return
    if "access_token" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project ADD COLUMN access_token TEXT"))


def _ensure_project_name_unique_index():
    inspector = inspect(engine)
    try:
        indexes = inspector.get_indexes("project")
    except Exception:
        return
    if any(idx.get("name") == "uq_project_name" for idx in indexes):
        return
    with engine.begin() as conn:
        duplicates = conn.execute(
            text("SELECT name FROM project GROUP BY name HAVING COUNT(*) > 1")
        ).fetchall()
        if duplicates:
            names = ", ".join(row[0] for row in duplicates if row[0])
            print(
                "WARNING: duplicate project names detected; resolve before enforcing uniqueness:",
                names,
            )
            return
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_project_name ON project(name)"))
