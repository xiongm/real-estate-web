# DocuSign-style Signing Experience Plan

## Context & goal
- Build a guided, DocuSign-like signing flow for `web/app/sign/[token]/page.tsx` so signers can adopt a signature, jump to required fields, and finish without manual scrolling. Improves completion speed and reduces drop-off.

## Assumptions & constraints
- Existing signing API endpoints (`/api/sign/:token`, `/api/sign/:token/pdf`, `/api/sign/:token/final-pdf`, `/api/sign/:token/complete`) remain; adding a draft save endpoint is optional.
- Frontend is Next.js, client components allowed; PDF rendered via pdfjs. No new third-party vendors required.
- Signers may resume via magic links; localStorage available for short-term persistence. Keep signatures PII in transit to backend only when intentionally submitted.

## Data/model design
- Client: store adopted signature and initials as base64 PNG plus font metadata in state and `localStorage` keyed by envelope token; track field completion map (required vs optional, signature vs other).
- Optional backend: `POST /api/sign/:token/save` to persist draft field values (idempotent by field id); reuse existing value payload shape.
- No schema changes expected; if drafts are stored, ensure encryption/PII handling matches final packets.

## APIs & surface area
- Keep consent POST as-is. Add optional draft save endpoint (authenticated by token, idempotent, returns stored values).
- Signature adoption is client-side; only send adopted images when applied to a field or on complete.
- Completion keeps `/api/sign/:token/complete` payload; include font info where present.

## Flows
- Entry: fetch envelope → ensure consent → open signature adoption dialog if signature/initials fields exist and no adopted asset yet.
- Navigation: Start/Next jumps to the first incomplete required field (ordered by page/position), auto-scroll with focus/highlight. Auto-advance after filling when possible.
- Signature/initials: user can Draw/Type/Upload once, then click “Insert” on any signature/initials field or “Apply to all empty signature fields”.
- Finish: validate required fields, POST complete, then show final/awaiting state. If sealed, load final PDF without overlays; otherwise show overlays in view mode.
- Resume: reloads previously adopted signature from localStorage; optional draft pull if save API exists.

## UI
- Add signature adoption dialog (tabs: Draw canvas, Type with 4–5 font styles, optional Upload; initials derived or separate tab).
- Floating action bar (under sticky header) with remaining-required count, Start/Next buttons, “Back to first pending” chip.
- Field overlays: calmer dashed pending states, green check when filled, focus glow on active field. Signature fields show “Insert signature” CTA and optional “Apply to all”.
- Sidebar keeps consent + Finish; adds mini checklist of remaining required fields.
- Completion view hides overlays and shows final PDF when available; otherwise view mode with overlays.
- Mobile emphasis: touch-friendly tap targets and scroll padding, avoid horizontal overflow, confirm signature draw works with touch; navigation controls accessible within single column.

## Observability & ops
- Log consent, adoption method (draw/type/upload), and completion status client-side; ensure backend audit already records completion. Add client console warnings for missing PDF or save failures.
- If draft save added: emit audit/event with signer id and field ids; include idempotency key per request (token + signer + field ids).
- Manual recovery: admin can resend link; signer reload uses cached adoption/draft when available.

## Testing plan
- Unit: field ordering and next-field selector; signature adoption reducer (draw/type/upload); payload builder including fonts.
- Integration/UI (Playwright): adoption dialog flows, apply-to-all, next navigation, required validation, completion states, sealed final view.
- Manual: touch drawing on mobile, resize/scroll behavior, localStorage persistence, error banners when PDF/load fails. Verify full flow on mobile devices (draw, type, navigation, finish) with responsive layout.

## Risks & mitigations
- Large signature images inflate payload → constrain canvas size and downscale uploads.
- Auto-scroll misalignment on small screens → add scroll padding and focus highlight; fall back to manual list in sidebar.
- Missing draft save backend → keep localStorage-only path; feature flags to disable draft save calls.
- Typed signature fonts not available → bundle or fall back to safe fonts with preview warning.

## Step checklist
1. [ ] Audit current signing surface and field ordering
   - Goal: Map existing data flow (fields, consent, complete) and confirm required field ordering logic.
   - Design/Implementation: Review `web/app/sign/[token]/page.tsx` for field filtering, payload shape, and overlay rendering; note where to inject navigation and adoption state.
   - Success criteria: Documented field order rules and payload contract; identified insertion points for new components.
   - Tests to consider: None yet (analysis step).
2. [ ] Implement signature/initials adoption experience
   - Goal: Enable draw/type/upload adoption and persist per token.
   - Design/Implementation: Add dialog component with tabs (draw canvas, type with 4–5 fonts, optional upload with size/type guard); store adopted signature/initials in state + localStorage; expose apply callbacks.
   - Success criteria: After adopting, signature preview available; refresh retains adoption via localStorage.
   - Tests to consider: Unit for adoption state; Playwright for dialog flows and persistence.
3. [ ] Add guided navigation (Start/Next) and field focus highlights
   - Goal: Let signers jump to the next required field without manual scrolling.
   - Design/Implementation: Build field order map (required first); keep refs; add floating action bar with remaining count, Start/Next, “Back to first pending”; implement scrollIntoView + focus + temporary highlight; auto-advance after filling when safe.
   - Success criteria: Clicking Start/Next focuses correct field; remaining count updates; mobile scroll behaves.
   - Tests to consider: Unit for next-field selector; Playwright for navigation and highlight behavior.
4. [ ] Wire signature insertion behavior
   - Goal: Drop adopted signature/initials into overlays quickly.
   - Design/Implementation: Update signature overlays to show “Sign” call-to-action; on click, set base64 value and mark field completed; allow clearing. No apply-to-all shortcut to keep users progressing field-by-field.
   - Success criteria: One-click sign fills targeted field; clearing works.
   - Tests to consider: Integration for sign action.
5. [ ] Enhance completion, draft handling, and final viewing
   - Goal: Smooth finish flow and optional draft save.
   - Design/Implementation: Keep consent/complete; optionally add draft save calls on change (feature-flagged); on completion show final PDF when sealed and hide overlays; otherwise view mode overlays. Guard payload sizes and required validation.
   - Success criteria: Required validation blocks finish until satisfied; completion message shows; sealed docs render final PDF without overlays; drafts do not error when disabled.
   - Tests to consider: Integration for completion states; manual mobile check; optional tests for draft save if added.
6. [x] Observability and QA pass
   - Goal: Ensure telemetry and tests cover new flows.
   - Design/Implementation: Added lightweight client logging (console/optional hook) for consent/adoption/insert/apply-all/draft-save/completion/PDF errors; Playwright signing paths added for navigation and insert/apply-all; documented manual mobile/touch checks separately.
   - Success criteria: Signing subset passing; logging available without audit payload changes.
   - Tests to consider: Run Playwright suite; run unit tests; targeted manual checks.
7. [x] Smooth navigation scroll behavior (parity with DocuSign glide)
   - Goal: Ensure Start/Next scrolls and glides to the target signature/initial field.
   - Design/Implementation: Investigated scrollIntoView logic; added offsets/animations to center active field and smooth-glide overlays.
   - Success criteria: Next/Start visibly scrolls to the next required field on desktop/mobile; focus/highlight remains correct.
   - Tests to consider: Playwright interaction asserting scroll position/focus; manual mobile scroll check.
8. [x] Field-level action chip (DocuSign-style Start/Sign/Initial)
   - Goal: Replace static Start/Next bar with a floating action chip anchored near the active required field, updating label by field type and auto-advancing.
   - Design/Implementation: Tracked active field and required ordering; positioned a sticky chip adjacent to the active field with contextual label and remaining-count badge. Clicking focuses/scrolls to the target field and triggers default action (insert adopted signature/initial if present, toggle checkbox, focus input; open adoption if missing). Added animation and scroll centering with padding.
   - Success criteria: Action chip glides to the next required field after completion or click; field is centered and focused; signatures auto-insert when adopted; matches DocuSign-like guided feel.
   - Tests to consider: Playwright to assert chip label/placement, scroll movement to target field, and auto-insert/advance for signatures with adoption; adjusted navigation tests for new control.
9. [x] Arrow-style navigation chip refinement (DocuSign parity)
   - Goal: Make the action chip an arrow pill anchored to the left of the document, purely for navigation (no auto-sign), starting in “Start” state that jumps to the first field.
   - Design/Implementation: Redesigned chip to an arrow pill that stays in the left gutter and moves only vertically with the active field; click now only scrolls/focuses the next required field (Start jumps to first) without auto-applying signatures/initials; labels change by field type. Added page container hook for stable anchoring.
   - Success criteria: Chip stays in the left gutter and glides vertically; clicking advances scroll to target without auto-filling; first click from “Start” jumps to first field. Manual scroll not needed to find fields.
   - Tests to consider: Playwright verifying chip position/label changes, no auto-fill on click, and scroll movement to each required field.

Reminder: add scoped tests and run manually before proceeding to the next step.
