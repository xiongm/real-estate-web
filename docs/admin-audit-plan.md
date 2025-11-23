# Admin Audit View Plan (Projects/Envelopes)

Goal: surface audit events in Admin with minimal friction, scoped by project, with filtering and export.

## Data model (backend prep)
- Table `audit_events` (append-only): id (bigint, monotonic), project_id (nullable), resource_type (enum: project, investor, document, file, envelope, token, system), resource_id (text), action (enum), actor_type (enum: admin_token, project_token, system), actor_id (text), ip, user_agent, status (success/fail), created_at (timestamp), payload (jsonb), hash (text), prev_hash (text).
- Indexes: (project_id, created_at desc), (resource_type, resource_id), (action, created_at), (actor_type, created_at).
- API contract: `GET /api/projects/{id}/audit` with filters: action, resource_type, actor_type, status, date_from/date_to, search (resource id/email), page/limit. Admin token required; project token read-only.

## Admin UI surface
- New **Audit** tab alongside Documents/Signatures/Investors/Share.
- Fetch: call `/api/projects/{id}/audit?page=1&limit=50&...filters...`.
- Table/list columns: Timestamp (local), Action, Resource (type + id/name), Actor (type/id), Status (chip), Summary (short text), with expand/collapse for payload (JSON pretty-print).
- Filters: dropdowns for Action, Resource type, Actor type; date range picker; text search; status pill toggle; pagination controls.
- Export: button to download CSV/JSON for current filter window (`?export=csv|json`).
- Empty states: “No audit events yet” with hint to trigger actions.

## UX details
- Chips: status (success/fail), actor type, resource type. Keep consistent sizing (reuse existing chip styles).
- Accessibility: rows focusable, Enter/Space to expand details; payload collapsible with `details/summary` or custom accordion.
- Performance: debounce filter changes; show loading skeleton; handle API errors with dismissible banner.
- Security: hide payload fields if actor is project token unless admin token present; ensure tokens/PII in payloads are redacted at the API layer.
- Retention note: small inline note about retention window (e.g., “Audit retained for 180 days”).

## Steps
1. Backend data path
   - Add/confirm `audit_events` table and write hooks on API + worker paths.
   - Add indexes and retention policy (job if needed).
   - Implement `GET /api/projects/{id}/audit` with filters/pagination/export and token checks; redact sensitive fields for project-token reads.
2. Admin UI scaffolding
   - Add Audit tab, filter state (action/resource/actor/status/date/search), pagination.
   - Build fetcher with debounced filters, loading skeleton, and error banner.
3. List & details
   - Render table/list rows (timestamp, action, resource, actor, status chip, summary) with expandable payload JSON; make rows keyboard focusable (Enter/Space toggles).
   - Add chips matching existing styles; include retention note inline.
4. Export & polish
   - Add CSV/JSON export button that passes current filters to the API.
   - Handle access cues (project-token read-only messaging), ensure buttons stop propagation, and verify empty states.
5. Comprehensive write hooks
   - Emit audit events for: project create/update/delete/token regen; investor create/update/delete; document/file download/delete; envelope create/send/resend/revoke; signer open/consent/submit; worker seal success/fail; auth failures (invalid token).
   - Standardize summary and payload shape (resource ids, filenames, status).
   - Trigger client-side refresh: when uploads/updates complete, refetch audit list if the Audit tab is active (or show a “Refresh” control).
6. Pagination totals & date filters ✅
   - Backend: return total count; support date_from/date_to filters.
   - Frontend: add pagination controls and a date range picker; show total.
7. Project-token redaction — skipped
   - Redact sensitive payload fields when actor is project_token; surface a UI notice when payload is redacted.
8. Retention/anchoring — partial
   - Display retention window ✅ (30-day default); optionally expose hash chain anchor (prev_hash/hash) and daily anchor export (not implemented).
9. Global admin view (optional) — skipped
   - Add admin-only endpoint/tab to search across projects with filters and exports.
10. Periodic pruning job (optional) — pending
   - Add a scheduled worker task to prune audit rows older than `AUDIT_RETENTION_DAYS` during runtime (startup prune already in place).
