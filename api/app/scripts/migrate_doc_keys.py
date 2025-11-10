import os
from minio import Minio
from sqlmodel import Session, select

from app.db import engine
from app.models import Document

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ROOT_USER = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "signing")

secure = MINIO_ENDPOINT.startswith("https")
endpoint = MINIO_ENDPOINT if ":" in MINIO_ENDPOINT else f"{MINIO_ENDPOINT}:9000"

client = Minio(
    endpoint,
    access_key=MINIO_ROOT_USER,
    secret_key=MINIO_ROOT_PASSWORD,
    secure=secure,
)

with Session(engine) as session:
    documents = session.exec(select(Document)).all()
    for doc in documents:
        if not doc.s3_key:
            continue
        expected_prefix = f"projects/{doc.project_id}/uploads/{doc.id}-"
        if doc.s3_key.startswith(expected_prefix):
            continue
        new_key = f"projects/{doc.project_id}/uploads/{doc.id}-{doc.filename}"
        print(f"Migrating doc {doc.id}: {doc.s3_key} -> {new_key}")
        client.copy_object(
            MINIO_BUCKET,
            new_key,
            f"/{MINIO_BUCKET}/{doc.s3_key}",
        )
        client.remove_object(MINIO_BUCKET, doc.s3_key)
        doc.s3_key = new_key
        session.add(doc)
    session.commit()
