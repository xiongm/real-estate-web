
import os

DATABASE_URL = os.getenv("DATABASE_URL")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "signing")
SECRET_KEY = os.getenv("SECRET_KEY", "devsecret")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
WORKER_QUEUE = os.getenv("WORKER_QUEUE", "signing")
ADMIN_ACCESS_TOKEN = os.getenv("ADMIN_ACCESS_TOKEN")
MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")
try:
    AUDIT_RETENTION_DAYS = int(os.getenv("AUDIT_RETENTION_DAYS", "30") or "30")
except ValueError:
    AUDIT_RETENTION_DAYS = 30

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ENABLE_DOC_SUMMARY = (os.getenv("ENABLE_DOC_SUMMARY") or "true").lower() == "true"
DOC_SUMMARY_MODEL = os.getenv("DOC_SUMMARY_MODEL") or "gpt-5-mini"
try:
    DOC_SUMMARY_CHAR_LIMIT = int(os.getenv("DOC_SUMMARY_CHAR_LIMIT") or "300")
except ValueError:
    DOC_SUMMARY_CHAR_LIMIT = 300
try:
    DOC_SUMMARY_TIMEOUT = float(os.getenv("DOC_SUMMARY_TIMEOUT") or "15")
except ValueError:
    DOC_SUMMARY_TIMEOUT = 15.0
