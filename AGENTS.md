# Repository Guidelines

## Project Structure & Module Organization
- Root: API/backend (`api`, `worker`), frontend Next.js app in `web/`, shared libs under `web/lib/`, public assets in `web/public/`.
- Signing UX lives in `web/app/sign/[token]/page.tsx`; request-sign flow in `web/app/request-sign/`. Tests reside in `web/tests` (Playwright).
- Docs live in `docs/`; design references in `figma/`.

## Build, Test, and Development Commands
- From `web/`: `npm run dev` (via `node scripts/dev-server.js`) to start the frontend locally; ensure `pdf.worker.min.mjs` is copied by `postinstall`.
- E2E: `npm run test:e2e` to run Playwright headlessly; `npm run test:e2e:ui` to debug in UI mode.
- Install deps: run `npm install` within `web/` (root has its own dependencies if backend changes are needed).

## Coding Style & Naming Conventions
- TypeScript/React with functional components; prefer hooks. Use descriptive prop names and typed state.
- Styling currently inline/JSX; keep palette/theme imports consistent (`theme` in `web/lib/theme`).
- Indent with 2 spaces; keep files ASCII unless existing content dictates otherwise.
- Favor small, reusable helpers; avoid silent `any`—type data from APIs when feasible.

## Testing Guidelines
- Playwright is the primary automated test suite (`web/tests`). Add scenarios for new flows and states (mobile/touch where relevant).
- Name tests by user behavior (e.g., `signing.spec.ts`). Keep fixtures slim and reuse shared helpers when available.
- Run `npm run test:e2e` before submitting; include screenshots or recordings for complex UI fixes when helpful.

## Commit & Pull Request Guidelines
- Follow clear, present-tense commits (e.g., “Add signature adoption dialog”). Group related changes; avoid noisy formatting-only commits unless intentional.
- PRs should describe the change, note risk areas, and include steps to reproduce or verify (commands run, screenshots for UI).
- Link issues/tasks when applicable; call out breaking changes, migrations, or config updates explicitly.

## Security & Configuration Tips
- Do not commit secrets; use environment variables for API bases and tokens. The signing app reads `NEXT_PUBLIC_API_BASE`.
- If working with PDFs, avoid uploading large or personal files to the repo; use test fixtures. Keep localStorage use scoped to envelope tokens.***
