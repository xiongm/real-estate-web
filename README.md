
# Real Estate Signing — Skeleton (Python Stamper)

Zero-vendor-cost DocuSign‑lite skeleton. Stack: FastAPI + Postgres + Redis + Celery worker (pypdf/reportlab), MinIO (S3-compatible), Next.js for basic admin/signer UI.

## What works in this skeleton
- Project/Envelope/Signer CRUD (very light)
- Document upload to MinIO
- Magic-link signer route (token issuance/validation)
- Sealing worker stub: stamps text/checkbox/signature image and appends a one-page certificate (audit summary) using **pypdf** and **reportlab**
- Event hash chain (append-only) persisted in DB
- Minimal Next.js app with a basic signer page (consent + placeholder PDF viewer stub)

> This is a skeleton to get you moving fast. Tighten security, auth, error handling, and production hardening before real use.

## Prereqs
- Docker & Docker Compose

## Quick start
```bash
cp .env.example .env
docker compose up --build
```

Services:
- API: http://localhost:8000 (FastAPI docs: http://localhost:8000/docs)
- Web: http://localhost:3000
- MinIO: http://localhost:9001 (console; user/pass from .env)
- Postgres: localhost:5432
- Redis: localhost:6379

## Dev notes
- Upload a PDF via `/api/projects/{id}/documents`
- Manage project investors via `/api/projects/{id}/investors`
- Create an envelope with signers/fields `/api/envelopes`
- `POST /api/envelopes/{id}/send` to email (skeleton prints in API logs)
- Sign via `http://localhost:3000/sign/<token>`
- Final artifact downloadable at `/api/envelopes/{id}/artifact` after completion
- Field designer at `http://localhost:3000/designer`: enter a project ID, manage investors (name/email/units), assign each field to a specific investor, then submit to auto-create/send the envelope and grab a dev magic link for quick testing.

## Python stamper
We use `reportlab` to paint visible content (text/checkbox/signature PNG) onto a PDF page overlay, then `pypdf` to merge with the original. Certificate page is generated via `reportlab` and appended.

## Roadmap
- Replace JWT stub with proper auth
- Build a drag/drop field designer (PDF.js canvas) on `/designer`
- Optional PAdES signature via `pyHanko` in the worker
