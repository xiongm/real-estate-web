
import base64, hashlib, json
from itsdangerous import URLSafeSerializer
from .config import SECRET_KEY

def b64png_to_bytes(data_url: str) -> bytes:
    # expects "data:image/png;base64,....."
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return base64.b64decode(data_url)

def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))

def make_token(payload: dict) -> str:
    s = URLSafeSerializer(SECRET_KEY, salt="signing")
    return s.dumps(payload)

def read_token(token: str) -> dict:
    s = URLSafeSerializer(SECRET_KEY, salt="signing")
    return s.loads(token)
