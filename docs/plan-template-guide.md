# Implementation Plan Guide (Repeatable Template)

Use this structure when drafting new plans. Keep each step actionable, with clear ownership signals and checkpoints. Prefer concise bullets.

## How to Structure a Plan
- **Context & goal**: Briefly restate what we’re adding/changing and the business outcome.
- **Assumptions & constraints**: Note known limits (auth, data model, external APIs, infra).
- **Data/model design**: Enumerate schema changes, identifiers, status enums, storage keys, and any derived fields. Call out encryption/PII decisions.
- **APIs & surface area**: List endpoints, verbs, auth requirements, request/response shapes, and important side effects (audit, notifications).
- **Flows**: Describe end-to-end paths (e.g., onboarding, execution, failure/retry), gating, idempotency, and error handling.
- **UI**: Summarize what changes where (admin vs investor vs public), key states, and access cues.
- **Observability & ops**: Logging, audit events, alerts, and manual recovery paths.
- **Testing plan**: Which tests to add (unit/integration/e2e), fixtures, and how to run them.
- **Risks & mitigations**: What can go wrong and how we’ll guard/rollback.

## Step Checklist Format
For each numbered step include:
- **Goal**: Single-line outcome for the step.
- **Design/Implementation notes**: What to build and how (schemas, API calls, UI components, third-party interactions, idempotency keys).
- **Success criteria**: Observable pass conditions (data stored, status transitions, dashboard evidence).
- **Tests to consider**: What to add or run; note that the developer will run them manually before moving on.

Example step pattern:
```
N. [ ] Step title
   - Goal: ...
   - Design/Implementation: ...
   - Success criteria: ...
   - Tests to consider: ...
```

## Usage Tips
- Keep steps small enough to validate independently; avoid giant combined tasks.
- Mention manual checkpoints when automation is not available.
- Call out idempotency and retry handling for any external API work.
- Include env/config additions and where they’re referenced.
- When applicable, add a “dry-run” step before production and a “pilot” step for live verification.

## Deliverable Expectations
- Markdown in `docs/` using ASCII.
- Numbered checklist with checkboxes `[ ]` for tracking.
- Close with a reminder: add scoped tests and run manually before proceeding.
