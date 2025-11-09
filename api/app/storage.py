
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
