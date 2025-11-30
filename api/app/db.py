
from datetime import datetime, timedelta
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text, inspect, delete
from .config import DATABASE_URL, AUDIT_RETENTION_DAYS

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

def init_db():
    from .models import Tenant, User, Project, Document, Envelope, Signer, Field, SigningSession, Event, FinalArtifact, SignerFieldValue, ProjectInvestor, ProjectFile, AuditEvent
    SQLModel.metadata.create_all(engine)
    _ensure_project_access_column()
    _ensure_project_name_unique_index()
    _ensure_investor_contact_columns()
    _ensure_envelope_summary_column()
    _prune_audit_events(AUDIT_RETENTION_DAYS)

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


def _ensure_investor_contact_columns():
    inspector = inspect(engine)
    try:
        columns = [col["name"] for col in inspector.get_columns("projectinvestor")]
    except Exception:
        return
    required = {
        "mailing_address": "TEXT",
        "bank_name": "TEXT",
        "bank_account_number": "TEXT",
        "bank_routing_number": "TEXT",
    }
    missing = [col for col in required if col not in columns]
    if not missing:
        return
    with engine.begin() as conn:
        for column, column_type in required.items():
            if column not in columns:
                conn.execute(text(f"ALTER TABLE projectinvestor ADD COLUMN {column} {column_type}"))


def _ensure_envelope_summary_column():
    inspector = inspect(engine)
    try:
        columns = [col["name"] for col in inspector.get_columns("envelope")]
    except Exception:
        return
    if "summary" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE envelope ADD COLUMN summary TEXT"))


def _prune_audit_events(retention_days: int):
    if not retention_days or retention_days <= 0:
        return
    try:
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        from .models import AuditEvent
        with Session(engine) as session:
            session.exec(delete(AuditEvent).where(AuditEvent.created_at < cutoff))
            session.commit()
    except Exception as exc:
        print("WARNING: failed to prune audit events:", exc)
