
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field as ORMField
from sqlalchemy import UniqueConstraint, Index

class Tenant(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    name: str

class User(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    tenant_id: int
    email: str
    name: str
    role: str = "member"

class Project(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("name", name="uq_project_name"),)
    id: Optional[int] = ORMField(default=None, primary_key=True)
    tenant_id: int
    name: str
    status: str = "active"
    access_token: Optional[str] = ORMField(default=None, index=True)
    address: Optional[str] = None
    description: Optional[str] = None

class Document(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    project_id: int
    filename: str
    s3_key: str
    sha256: Optional[str] = None
    version: int = 1
    created_at: datetime = ORMField(default_factory=datetime.utcnow)

class Envelope(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    project_id: int
    document_id: int
    subject: str = "Please sign"
    message: str = ""
    status: str = "draft"
    expires_at: Optional[datetime] = None
    requester_name: Optional[str] = None
    requester_email: Optional[str] = None
    summary: Optional[str] = None
    created_at: datetime = ORMField(default_factory=datetime.utcnow)

class Signer(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    envelope_id: int
    name: str
    email: str
    role: str = "Investor"
    routing_order: int = 1
    status: str = "pending"
    completed_at: Optional[datetime] = None

class Field(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    envelope_id: int
    page: int
    x: float
    y: float
    w: float
    h: float
    type: str  # signature|initials|text|date|checkbox
    required: bool = True
    role: str = "Investor"
    name: Optional[str] = None
    signer_id: Optional[int] = None
    font_family: str = ORMField(default="sans")

class ProjectInvestor(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    project_id: int
    name: str
    email: str
    role: str = "Investor"
    routing_order: int = 1
    units_invested: float = 0.0
    mailing_address: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_routing_number: Optional[str] = None
    metadata_json: str = "{}"
    created_at: datetime = ORMField(default_factory=datetime.utcnow)

class ProjectFile(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    project_id: int
    display_name: str
    stored_filename: str
    content_type: Optional[str] = None
    s3_key: str
    uploaded_at: datetime = ORMField(default_factory=datetime.utcnow)

class SigningSession(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    signer_id: int
    token_hash: str
    ip_first: Optional[str] = None
    ua_first: Optional[str] = None
    opened_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class SignerFieldValue(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    signer_id: int
    field_id: int
    value_json: str = "{}"
    created_at: datetime = ORMField(default_factory=datetime.utcnow)

class Event(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    envelope_id: int
    actor: str  # system|signer:<id>|user:<id>
    type: str   # created|sent|opened|filled|completed|sealed
    meta_json: str = "{}"
    ip: Optional[str] = None
    ua: Optional[str] = None
    at: datetime = ORMField(default_factory=datetime.utcnow)
    prev_hash: Optional[str] = None
    hash: Optional[str] = None

class FinalArtifact(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    envelope_id: int
    s3_key_pdf: str
    s3_key_audit_json: str
    sha256_final: str
    completed_at: datetime = ORMField(default_factory=datetime.utcnow)

class AuditEvent(SQLModel, table=True):
    __table_args__ = (
        Index("ix_audit_project_created_at", "project_id", "created_at"),
        Index("ix_audit_action_created_at", "action", "created_at"),
        Index("ix_audit_resource", "resource_type", "resource_id"),
        Index("ix_audit_actor_created_at", "actor_type", "created_at"),
    )
    id: Optional[int] = ORMField(default=None, primary_key=True)
    project_id: Optional[int] = ORMField(default=None, index=True)
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    action: str
    actor_type: str  # admin_token | project_token | system | signer
    actor_id: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    status: str = "success"
    summary: Optional[str] = None
    payload_json: Optional[str] = None
    created_at: datetime = ORMField(default_factory=datetime.utcnow)
