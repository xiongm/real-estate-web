
from pydantic import BaseModel
from typing import List, Optional

class SignerCreate(BaseModel):
    client_id: Optional[str] = None
    project_investor_id: Optional[int] = None
    name: str
    email: str
    role: str = "Investor"
    routing_order: int = 1

class FieldCreate(BaseModel):
    page: int
    x: float
    y: float
    w: float
    h: float
    type: str
    required: bool = True
    role: str = "Investor"
    name: Optional[str] = None
    signer_key: Optional[str] = None
    font_family: Optional[str] = None
    font_family: Optional[str] = None

class EnvelopeCreate(BaseModel):
    project_id: int
    document_id: int
    subject: str = "Please sign"
    message: str = ""
    signers: List[SignerCreate]
    fields: List[FieldCreate]

class EnvelopeSend(BaseModel):
    subject: Optional[str] = None
    message: Optional[str] = None
    requester_name: Optional[str] = None
    requester_email: Optional[str] = None

class SignSave(BaseModel):
    values: dict  # field_id -> value (text/date/checkbox/signature_png(base64))

class ConsentAccept(BaseModel):
    accepted: bool

class ProjectInvestorCreate(BaseModel):
    name: str
    email: str
    role: str = "Investor"
    routing_order: int = 1
    units_invested: float = 0.0
    metadata_json: Optional[str] = None

class ProjectInvestorUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    routing_order: Optional[int] = None
    units_invested: Optional[float] = None
    metadata_json: Optional[str] = None
