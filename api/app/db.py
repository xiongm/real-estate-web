
from sqlmodel import SQLModel, create_engine, Session
from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

def init_db():
    from .models import Tenant, User, Project, Document, Envelope, Signer, Field, SigningSession, Event, FinalArtifact, SignerFieldValue, ProjectInvestor
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
