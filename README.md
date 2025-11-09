
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

## Workflow
1. **Manage projects:** Use the API (`/api/projects`) or the web UI at `http://localhost:3000/projects` to create projects. This page also lets you manage each project’s investors (name, email, units invested, routing order, etc.).
2. **Upload documents:** Call `POST /api/projects/{id}/documents` (or use whatever admin UI you build) to upload PDFs into MinIO for that project.
3. **Design envelopes:** Open `http://localhost:3000/request-sign`, select a project, and the builder will pull its investors. Upload/preview the PDF, drag fields onto the document, and assign each field to one of the project investors. The tool auto-builds the signer list from those assignments—no need to re-enter emails per envelope.
4. **Send envelopes:** From the request-sign page, hit “Submit envelope & send.” This creates the envelope, sends the magic links (currently logged in the API), and shows you the links for debugging.
5. **Sign:** Investors use `http://localhost:3000/sign/<token>`. They must check the consent box, fill the assigned fields only, and submit. The backend stores each signer’s data and seals the PDF once everyone finishes.
6. **Retrieve final PDFs:** Download the sealed PDF and audit JSON via `GET /api/envelopes/{id}/artifact` (or directly from MinIO). The worker stamps each investor’s fields and appends the certificate page summarizing the audit trail.

## Python stamper
We use `reportlab` to paint visible content (text/checkbox/signature PNG) onto a PDF page overlay, then `pypdf` to merge with the original. Certificate page is generated via `reportlab` and appended.

## Roadmap
- Replace JWT stub with proper auth
- Build a drag/drop field designer (PDF.js canvas) on `/request-sign`
- Optional PAdES signature via `pyHanko` in the worker
