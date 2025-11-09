
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field as ORMField

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
    id: Optional[int] = ORMField(default=None, primary_key=True)
    tenant_id: int
    name: str
    status: str = "active"

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

class ProjectInvestor(SQLModel, table=True):
    id: Optional[int] = ORMField(default=None, primary_key=True)
    project_id: int
    name: str
    email: str
    role: str = "Investor"
    routing_order: int = 1
    units_invested: float = 0.0
    metadata_json: str = "{}"
    created_at: datetime = ORMField(default_factory=datetime.utcnow)

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
