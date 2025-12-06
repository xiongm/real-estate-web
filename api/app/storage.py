
from minio import Minio
from .config import MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET
import io

_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)

def ensure_bucket():
    if not _client.bucket_exists(MINIO_BUCKET):
        _client.make_bucket(MINIO_BUCKET)

def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream"):
    ensure_bucket()
    _client.put_object(MINIO_BUCKET, key, io.BytesIO(data), length=len(data), content_type=content_type)

def get_bytes(key: str) -> bytes:
    resp = _client.get_object(MINIO_BUCKET, key)
    data = resp.read()
    resp.close()
    resp.release_conn()
    return data

def delete_object(key: str):
    try:
        _client.remove_object(MINIO_BUCKET, key)
    except Exception:
        pass

def put_temp_chunk(key: str, data: bytes):
    ensure_bucket()
    _client.put_object(MINIO_BUCKET, key, io.BytesIO(data), length=len(data), content_type="application/octet-stream")

def compose_chunks(dest_key: str, source_keys: list[str]):
    ensure_bucket()
    from minio.commonconfig import ComposeSource
    sources = [ComposeSource(MINIO_BUCKET, k) for k in source_keys]
    _client.compose_object(MINIO_BUCKET, dest_key, sources)
    # Cleanup
    for k in source_keys:
        delete_object(k)

