import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL


repo_root = Path(__file__).resolve().parents[1]
load_dotenv(repo_root / ".env", override=True)

os.environ["DATABASE_URL"] = URL.create(
    "postgresql+psycopg2",
    username=os.environ["POSTGRES_USER"],
    password=os.environ["POSTGRES_PASSWORD"],
    host="127.0.0.1",
    port=5432,
    database=os.environ["POSTGRES_DB"],
).render_as_string(hide_password=False)
os.environ["MINIO_ENDPOINT"] = "127.0.0.1:9000"
os.environ["MINIO_ACCESS_KEY"] = os.environ["MINIO_ROOT_USER"]
os.environ["MINIO_SECRET_KEY"] = os.environ["MINIO_ROOT_PASSWORD"]
os.environ["REDIS_URL"] = "redis://127.0.0.1:6379/0"

os.chdir(repo_root / "api")
os.execv(
    repo_root / ".venv/bin/uvicorn",
    [
        str(repo_root / ".venv/bin/uvicorn"),
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ],
)
