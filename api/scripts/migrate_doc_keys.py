import os
from urllib.parse import urlparse

from minio import Minio
from sqlmodel import Session, select

from app.db import engine
from app.models import Document

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ROOT_USER = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "signing")

client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ROOT_USER,
    secret_key=MINIO_ROOT_PASSWORD,
    secure=MINIO_ENDPOINT.startswith("https"),
)


with Session(engine) as session:
    documents = session.exec(select(Document)).all()
    for doc in documents:
        if not doc.s3_key:
            continue
        expected_suffix = f"{doc.id}-"
        parts = doc.s3_key.rsplit("/", 1)
        if len(parts) != 2:
            continue
        current_name = parts[1]
        if current_name.startswith(expected_suffix):
            continue
        new_key = f"projects/{doc.project_id}/uploads/{doc.id}-{doc.filename}"
        print(f"Migrating doc {doc.id} -> {new_key}")
        client.copy_object(
            MINIO_BUCKET,
            new_key,
            f"/{MINIO_BUCKET}/{doc.s3_key}",
        )
        client.remove_object(MINIO_BUCKET, doc.s3_key)
        doc.s3_key = new_key
        session.add(doc)
    session.commit()
