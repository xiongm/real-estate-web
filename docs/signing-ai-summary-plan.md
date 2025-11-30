# AI Summary for Signing Documents Plan

## Context & goal
- Generate a one-time AI summary (≤300 chars) for uploaded signing documents using OpenAI, store it in the DB, and surface it to signers before signing and to admins in document details. Allow manual edits later.

## Assumptions & constraints
- DB-backed storage on envelope (summary text). No S3 sidecar needed.
- OpenAI API available via `OPENAI_API_KEY`; model configurable (default `gpt-4o-mini`, fallback when gpt-5-* fails). `ENABLE_DOC_SUMMARY` defaults true but per-envelope UI toggle controls generation.
- Summary runs once per envelope creation; if generation fails or times out, continue sending without summary. Cap response to 300 chars server-side.
- PDF text extraction available (existing pipeline) or fallback to brief prompt if extraction empty.
- Summaries may contain PII from the document; treat as same sensitivity as the document.

## Data/model design
- DB: `Envelope.summary` (text, nullable, max ~1–2 KB) persisted truncated to 300 chars.
- API payloads: include `summary` in signing GET (`/api/sign/:token`), admin envelope detail, and PATCH `/api/envelopes/{id}/summary` for edits.
- Flags: `ENABLE_DOC_SUMMARY` (boolean default true), `DOC_SUMMARY_MODEL` (override), `DOC_SUMMARY_CHAR_LIMIT` (default 300), `DOC_SUMMARY_REQUEST_TIMEOUT`.

## APIs & surface area
- Generation: server-side call to OpenAI with extracted text (limit tokens/pages); idempotent if summary exists. Uses deterministic prompt; trims to char limit; falls back to secondary model.
- Signing GET `/api/sign/:token`: include `summary` string (nullable).
- Admin envelope detail: include `summary`.
- PATCH `/api/envelopes/{id}/summary`: update summary (admin UI and request-sign manual edit).
- No client calls to OpenAI.

## Flows
- Envelope creation (request-sign confirm): user can toggle “Enable AI summary”; when enabled, summary textarea disabled. On send, block UI with full-screen overlay showing stages (create summary/send); attempt OpenAI once with timeout; if it fails, continue send without summary. Persist returned summary on envelope.
- Signing view: fetch doc payload; render “AI summary” card; if missing, show “Summary unavailable”.
- Admin view: render stored summary with inline editable textarea; auto-save on blur via PATCH.
- Manual edits: request-sign page allows editing when AI is disabled or after send; signer view remains read-only.

## UI
- Signing page: “AI summary” card above PDF/side; collapsible, but summary text outside the collapse hit target so it is selectable; shows text or fallback.
- Request-sign confirm: checkbox “Enable AI summary”; summary textarea grayed when enabled; editable when disabled. Full-screen loading overlay blocks interactions and shows current stage.
- Admin view: “AI summary” inline editable textarea per envelope; auto-save on blur.

## Observability & ops
- Log summary generation status (model used, success/fail/timeout) with envelope id; do not log raw text. Include stage updates in UI overlay.
- Feature flag remains; per-envelope toggle can skip generation.
- Manual recovery: admin/requestor can edit summary via UI; optional backfill script later.

## Testing plan
- Unit: OpenAI client wrapper (deterministic prompt, truncation, fallback) and API serialization.
- Integration: stub OpenAI to return text; ensure envelope creation stores summary once and GET includes it; PATCH updates persisted.
- E2E/Playwright: signer view shows summary when provided; admin/request-sign editing flows; sending overlay blocks clicks. Last run: API unit tests passing; targeted Chromium chip test passing; full e2e after latest UI edits still pending.
- Run `npm run test:e2e` (all browsers) when changes settle.

## Risks & mitigations
- OpenAI latency/failure: timebox, fallback model, continue sending without summary.
- Model quirks: gpt-5-* may reject `max_tokens`/temperature; using `max_completion_tokens` and deterministic prompt mitigates; fallback to gpt-4o-mini.
- Oversized/PII responses: enforce 300-char limit and safe prompt; treat as sensitive data.
- Missing text extraction: prompt handles minimal context; fall back to “Summary unavailable”.

## Step checklist
1. [x] Add DB support for summaries
   - Goal: Persist a summary field for documents/envelopes.
   - Design/Implementation: Add `summary` column (text, nullable, limited via app) to document/envelope table; update ORM/models and migrations. Wire serialization for API payloads.
   - Success criteria: Summary field exists in DB and model; can save/read a summary.
   - Tests to consider: Model/serialization unit test.
2. [x] Implement server-side summary generation
   - Goal: Generate and store a 300-char summary post-ingest.
   - Design/Implementation: Add OpenAI client helper (env key/model, timeout); integrate into ingest pipeline after PDF text extraction; skip if summary present or flag disabled; truncate to 300 chars. Log failures without blocking.
   - Success criteria: On ingest, summary is stored when OpenAI succeeds; errors do not block ingest.
   - Tests to consider: Unit for truncation and flag; integration with OpenAI stub.
3. [x] Expose summary via APIs
   - Goal: Return stored summary to signer and admin views.
   - Design/Implementation: Include `summary` in `/api/sign/:token` response and admin document/envelope detail. Ensure null-safe.
   - Success criteria: API responses contain summary when present.
   - Tests to consider: API response unit/integration.
4. [x] Add UI surfaces (signer & admin)
   - Goal: Show summary in signing page and admin detail.
   - Design/Implementation: Signing page adds a “Document summary” card above PDF/side; admin detail shows read-only summary. Handle missing summary with fallback message.
   - Success criteria: Summary text visible in both UIs when data exists; graceful empty state.
   - Tests to consider: Playwright/UI test for signer; admin view check if coverage exists.
5. [ ] Validate end-to-end
   - Goal: Verify flow across browsers.
   - Design/Implementation: Run targeted Playwright (`npm run test:e2e -- --project=chromium --grep "summary"` if added) and/or full suite.
   - Success criteria: Tests green; summaries appear as expected across sign/admin/request flows.
   - Tests to consider: Full `npm run test:e2e` across projects as feasible.

Reminder: add scoped tests and run manually before proceeding to the next step.
