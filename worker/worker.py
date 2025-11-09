
import os, json, hashlib
from celery import Celery
from minio import Minio
from stamping import stamp_pdf
from certificate import render_certificate
from io import BytesIO
from pypdf import PdfReader, PdfWriter

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
QUEUE = os.environ.get("WORKER_QUEUE", "signing")
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "signing")

cel = Celery("signing", broker=REDIS_URL, backend=REDIS_URL)

minio = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)

def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream"):
    if not minio.bucket_exists(MINIO_BUCKET):
        minio.make_bucket(MINIO_BUCKET)
    minio.put_object(MINIO_BUCKET, key, BytesIO(data), length=len(data), content_type=content_type)

def get_bytes(key: str) -> bytes:
    resp = minio.get_object(MINIO_BUCKET, key)
    b = resp.read(); resp.close(); resp.release_conn()
    return b

@cel.task(name="seal_envelope", queue=QUEUE)
def seal_envelope(envelope_id: int, original_key: str, field_values: dict, project_id: int):
    original = get_bytes(original_key)
    stamped = stamp_pdf(original, field_values)
    # append certificate
    writer = PdfWriter()
    reader = PdfReader(BytesIO(stamped))
    for p in reader.pages:
        writer.add_page(p)
    cert_pdf = render_certificate({
        "envelope_id": envelope_id,
        "sha256_original": hashlib.sha256(original).hexdigest(),
    })
    cert_reader = PdfReader(BytesIO(cert_pdf))
    for p in cert_reader.pages:
        writer.add_page(p)
    buf = BytesIO(); writer.write(buf); final_pdf = buf.getvalue()
    sha_final = hashlib.sha256(final_pdf).hexdigest()
    audit = json.dumps({"envelope_id": envelope_id, "sha256_final": sha_final})
    key_pdf = f"projects/{project_id}/final/envelopes/{envelope_id}.pdf"
    key_audit = f"projects/{project_id}/final/envelopes/{envelope_id}.audit.json"
    put_bytes(key_pdf, final_pdf, "application/pdf")
    put_bytes(key_audit, audit.encode(), "application/json")
    return {"pdf": key_pdf, "audit": key_audit, "sha256_final": sha_final}
