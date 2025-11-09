
import os

DATABASE_URL = os.getenv("DATABASE_URL")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "signing")
SECRET_KEY = os.getenv("SECRET_KEY", "devsecret")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
WORKER_QUEUE = os.getenv("WORKER_QUEUE", "signing")
