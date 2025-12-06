
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

class MultiObjectReader(io.RawIOBase):
    def __init__(self, client, bucket, keys):
        self.client = client
        self.bucket = bucket
        self.keys = list(keys)
        self.current_key_idx = 0
        self.current_resp = None
        self.buffer = b""

    def read(self, size=-1):
        if size == -1:
            size = 10 * 1024 * 1024 # Read 10MB chunks if unspecified
        
        chunk = b""
        while len(chunk) < size:
            if self.current_resp is None:
                if self.current_key_idx >= len(self.keys):
                    break
                key = self.keys[self.current_key_idx]
                self.current_resp = self.client.get_object(self.bucket, key)
            
            data = self.current_resp.read(size - len(chunk))
            if not data:
                self.current_resp.close()
                self.current_resp.release_conn()
                self.current_resp = None
                self.current_key_idx += 1
                continue
            chunk += data
            
        return chunk

def compose_chunks(dest_key: str, source_keys: list[str]):
    ensure_bucket()
    
    # Calculate total size
    total_size = 0
    for k in source_keys:
        total_size += _client.stat_object(MINIO_BUCKET, k).size
        
    reader = MultiObjectReader(_client, MINIO_BUCKET, source_keys)
    
    # Upload as a single stream (minio client handles multipart if large)
    _client.put_object(MINIO_BUCKET, dest_key, reader, length=total_size)
    
    # Cleanup
    for k in source_keys:
        delete_object(k)

