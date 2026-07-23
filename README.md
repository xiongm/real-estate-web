
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

## Quick start (install + run)
### Windows via WSL2
1) PowerShell (Admin): install WSL2 + Ubuntu, then reboot and confirm:
   ```powershell
   wsl --install -d Ubuntu
   wsl --status
   ```
2) Install Docker Desktop and enable WSL integration for Ubuntu. In the WSL shell, confirm Docker works:
   ```bash
   docker info
   ```
3) Prep tooling inside WSL:
   ```bash
   sudo apt update && sudo apt install -y git curl build-essential
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   source ~/.nvm/nvm.sh
   nvm install --lts
   ```
4) Clone and start the stack (inside WSL, not the Windows filesystem):
   ```bash
   git clone https://github.com/your-org/real-estate-web.git
   cd real-estate-web
   cp .env.example .env
   docker compose up --build
   ```
5) Optional: run Next.js locally with Docker-backed services:
   ```bash
   ./scripts/dev-services.sh start
   cd web
   npm install
   npm run dev
   # stop services when done
   ./scripts/dev-services.sh stop
   ```

### Linux
1) Install Docker Engine + Compose plugin (Ubuntu example):
   ```bash
   sudo apt update
   sudo apt install -y docker.io docker-compose-plugin
   sudo usermod -aG docker $USER
   newgrp docker
   sudo systemctl enable --now docker
   docker info
   ```
2) Install Node LTS (nvm):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   source ~/.nvm/nvm.sh
   nvm install --lts
   ```
3) Clone and start the stack:
   ```bash
   git clone https://github.com/your-org/real-estate-web.git
   cd real-estate-web
   cp .env.example .env
   docker compose up --build
   ```
4) Optional local Next.js dev:
   ```bash
   ./scripts/dev-services.sh start
   cd web
   npm install
   npm run dev
   ./scripts/dev-services.sh stop
   ```

Services (when `docker compose` is running):
- API: http://localhost:8000 (FastAPI docs: http://localhost:8000/docs)
- Web: http://localhost:3000
- MinIO: http://localhost:9001 (console; user/pass from .env)
- Postgres: localhost:5432
- Redis: localhost:6379
- Tests: `docker compose run --rm api-tests`

## Local dev loop (Docker backend + local Next.js)
- Start supporting services (API worker, DB, Redis, MinIO) inside Docker while running `npm run dev` locally:
  ```bash
  ./scripts/dev-services.sh start
  cd web && npm run dev
  ```
- Stop the Docker-managed services when you’re done:
  ```bash
  ./scripts/dev-services.sh stop
  ```
- Check their status anytime with `./scripts/dev-services.sh status`.

## Host API workaround
The default `docker compose` workflow runs the API in Docker. Use this override only on
hosts where Docker container egress is unreliable and the API must run directly on the host.

1. Create the host Python environment and install API dependencies:
   ```bash
   python3 -m venv .venv
   .venv/bin/pip install -r api/requirements.txt
   ```
2. Start the host API:
   ```bash
   .venv/bin/python scripts/run-host-api.py
   ```
3. In another terminal, start the Docker-managed services with the override:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.host-api.yml up -d --build
   ```

The override routes the web container to `host.docker.internal:8000`, prevents the Docker
API from starting, and keeps PostgreSQL, Redis, MinIO, the worker, and web in Docker.
Stop this mode with the same file arguments followed by `down`.

## Workflow
1. **Manage projects:** Use the Admin sidebar inside the web app (you'll be prompted for the admin access token) to create projects. Investor management now lives exclusively in Admin; the request-sign builder is read-only and simply reflects the investors tied to the currently selected project. Each project automatically gets its own access token, visible inside the **Share** tab in the center pane—share that token with investors when you want to grant read-only API access.
2. **Upload documents:** Call `POST /api/projects/{id}/documents` (or use whatever admin UI you build) to upload PDFs into MinIO for that project.
3. **Design envelopes:** Open `http://localhost:3000/request-sign`, select a project, and the builder will pull its investors. Upload/preview the PDF, drag fields onto the document, and assign each field to one of the project investors. The tool auto-builds the signer list from those assignments—no need to re-enter emails per envelope.
4. **Send envelopes:** From the request-sign page, hit “Submit envelope & send.” This creates the envelope, sends the magic links (currently logged in the API), and shows you the links for debugging.
5. **Sign:** Investors use `http://localhost:3000/sign/<token>`. They must check the consent box, fill the assigned fields only, and submit. The backend stores each signer’s data and seals the PDF once everyone finishes.
6. **Retrieve final PDFs:** Download the sealed PDF and audit JSON via `GET /api/envelopes/{id}/artifact` (or directly from MinIO). The worker stamps each investor’s fields and appends the certificate page summarizing the audit trail.
7. **Investor portal:** Share the auto-generated viewer link (see the Share tab). Investors who have the project token can open `http://localhost:3000/projects/<id>/<token>` to see the project summary plus document downloads in read-only mode.

## Access control
- Set `ADMIN_ACCESS_TOKEN` in your `.env` file. This token gates the Admin UI and every privileged API route.
- All admin/API requests must include `X-Access-Token: <admin token>` in the headers (the web UI handles this after you sign in via the prompt).
- Every project now has a dedicated `access_token` stored in the DB. Admins can view/regenerate it from the **Share** tab for the selected project. The same tab also shows a ready-to-share link (`/projects/<id>?token=<token>`) that boots the read-only investor dashboard.
- API endpoints that return project data accept either the admin token or the matching project token. Mutating endpoints (create/delete/upload/send) still require the admin token.

### New investor summary endpoint

`GET /api/projects/{id}/summary` returns the project metadata, uploaded PDFs, completed final packets, and investor roster. It requires either the admin token or that project’s token via `X-Access-Token` header (or a `?token=` query parameter, which is what the investor portal uses).

## Rotating secrets (Postgres, MinIO, Admin token, SMTP)

- **Admin token & SMTP credentials**: Update `.env`, then restart the relevant containers (`docker compose up -d --build api web`). The services read these at startup.
- **Postgres `POSTGRES_USER/POSTGRES_PASSWORD`**: Those env vars are only applied the first time the container creates the database. To rotate credentials on an existing DB:
  1. `docker compose exec db psql -U <current_user>`
  2. `ALTER USER <user> WITH PASSWORD 'newpass';`
  3. Update `.env` (and any client connection strings) and restart the API.
  4. If you need a completely different DB user, you must create it manually or recreate the DB volume (which wipes data).
- **MinIO access/secret keys**: Similarly, `MINIO_ROOT_USER/PASSWORD` are applied only during first initialization. To rotate keys on a running MinIO instance, either:
  - Log into the MinIO console (port 9001) and add/update a user via the UI, or
  - Use `mc admin user add ...` to create a new access key.
  Update `.env` with the new user’s access/secret and restart API/web. Only delete/recreate the MinIO data volume if you intentionally want a clean slate.
- **Reminder**: Editing `.env` alone is not enough; restart the affected containers so they pick up the new values.

### Mapbox address autocomplete
- To enable the inline project address autocomplete, create a Mapbox access token with the Geocoding API enabled and save it as `MAPBOX_ACCESS_TOKEN` in `.env`. The admin UI proxies autocomplete requests through `/api/places/mapbox/autocomplete`, so the token is never exposed to browsers.

## Database schema updates
This skeleton does not ship with a migration tool. When we add new columns we run simple `ALTER TABLE` statements manually (once per environment) before restarting the API. For the `address` and `description` fields introduced on projects, run:

```sql
ALTER TABLE project ADD COLUMN address TEXT;
ALTER TABLE project ADD COLUMN description TEXT;
```

Apply these on your Postgres instance (e.g., `docker compose exec db psql -U <user> -d signing -c "<statement>"`) before starting the new release.

### Public URLs in emails
- Set `WEB_BASE_URL` (or `NEXT_PUBLIC_WEB_BASE`) in `.env` to the externally reachable URL for the web app (e.g., your Cloudflare Tunnel hostname). The API uses this value when generating magic-link emails (`<base>/sign/<token>`). If it’s missing, links fall back to `http://localhost:3000`.

## Testing (Docker workflow)
Run the API test suite inside the same image the service uses:

```bash
docker compose run --rm api-tests
```

This spins up the API image, runs `pytest`, and exits. The tests mock MinIO and use an isolated SQLite DB, so nothing persists between runs.

### Web E2E tests (Playwright)
The `web` app now ships with a lightweight Playwright harness that spins up `next dev` automatically and drives the currently checked-in UI.

```bash
cd web
npm install                # once
npx playwright install     # once, installs the browsers
npm run test:e2e
```

Need an inspector? `npm run test:e2e:ui` opens the Playwright runner so you can step through scenarios locally. Set `PLAYWRIGHT_BASE_URL` if you prefer to hit an already running web server instead of letting the test suite start `npm run dev`.

> **Investor download test:** `tests/investor-download.spec.ts` creates a real project/file via the API to verify Unicode file downloads. Make sure the backend stack is running (`docker compose up -d db minio redis api`) and that Playwright can authenticate with the admin token (`ADMIN_ACCESS_TOKEN` in `.env`, or override with `PLAYWRIGHT_ADMIN_TOKEN`). If your API isn’t on `http://localhost:8000`, set `PLAYWRIGHT_API_BASE`.

## Release workflow
1. **Prep on your working branch (e.g., `figma-revamp`):**
   - `git pull` and confirm `git status` is clean.
   - Create/sync a release branch (optional but handy for hotfixes): `git checkout -b release/vX.Y.Z` (or `git checkout release/vX.Y.Z && git merge figma-revamp` if it already exists).
   - Run validations (`docker compose run --rm api-tests`, `cd web && npm run test:e2e`).
2. **Tag the release:** `git tag -a vX.Y.Z -m "Release vX.Y.Z"` while on the commit you want to ship.
3. **Push everything:** `git push origin release/vX.Y.Z` (if you created/updated the branch) and `git push origin vX.Y.Z`.
4. **Create the GitHub release** using that tag (notes + binaries if needed).
5. **Deploy on the release host:**
   - `ssh` in, then `git fetch origin` and either `git checkout vX.Y.Z` (tag) or `git checkout release/vX.Y.Z && git pull`.
   - Update `.env` if any secrets/URLs changed.
   - Restart the stack so the containers read the new code/env: `docker compose up -d --build`.

The hero banner uses an Unsplash URL directly—no extra assets or figma files need to be copied to the server for a release.

## Python stamper
We use `reportlab` to paint visible content (text/checkbox/signature PNG) onto a PDF page overlay, then `pypdf` to merge with the original. Certificate page is generated via `reportlab` and appended.

## Roadmap
- Replace JWT stub with proper auth
- Build a drag/drop field designer (PDF.js canvas) on `/request-sign`
- Optional PAdES signature via `pyHanko` in the worker
