# Loading Gates For Data-Heavy Views

Complex web apps often depend on multiple asynchronous prerequisites (auth, metadata, per-tenant assets, feature flags) before the main UI can render meaningfully. If we render immediately after the first promise resolves, users see flashing placeholders or controls that briefly appear disabled, which feels sloppy and can leak sensitive states.

This note outlines a reusable gating pattern for any dashboard or page that layers several backend calls.

## Typical Failure Mode
1. We show a spinner only for the very first request (usually auth).
2. As soon as that spinner finishes, we render the “real” layout even though downstream data (projects, documents, settings, etc.) is still loading.
3. Each follow-up fetch updates the UI piecemeal, causing CTAs to pop in/out or flip between enabled/disabled states.

## Gating Strategy
Track readiness per asynchronous stage and only render the full layout when all stages are satisfied.

| Flag example | Represents | When to set `true` |
| --- | --- | --- |
| `authLoaded` | Token/session verification | Auth check completes (success or failure). |
| `metadataLoaded` | Global lists, feature flags, user preferences | Shared data request resolves. |
| `tenantLoaded` | Tenant/project-specific payloads | Parallel fetches resolve for the selected tenant. |
| `initialReady` | Composite “safe to render” state | Effect watches the previous flags (plus any boolean like `isAuthenticated`) and flips once. |

Example render gate:

```tsx
if (!authLoaded) return <FullScreenSpinner label="Verifying access…" />;
if (!isAuthenticated) return <LoginPrompt />;
if (!initialReady) return <FullScreenSpinner label="Preparing workspace…" />;
return <AppShell />;
```

## Implementation Notes
- **Resetting flags:** Whenever upstream context changes (logout, tenant switch, etc.), reset the downstream booleans so the spinner returns while new data loads.
- **Async cancellation:** When fetching per-context data, guard against stale responses (e.g., keep a `cancelled` flag or abort controller) so late network replies do not override fresh state.
- **Await dependencies:** If multiple columns/panels depend on the same data, wait for all of them before marking the relevant flag true—this keeps the layout consistent.
- **One-time ready flag:** `initialReady` (or similar) is derived, not set directly. Compute it via an effect or memo whenever all prerequisites are true.

## Applying The Pattern
1. List every blocking prerequisite for the first meaningful paint.
2. Give each prerequisite its own boolean (or enum) that becomes true only when its data is loaded.
3. Compute a final `initialReady` from those booleans and gate the main render accordingly.
4. Provide descriptive loading states (“Preparing dashboard…”) so users know why they’re waiting.
5. On unmount or context changes, reset/downshift the relevant flags to keep the behavior consistent.

Using explicit loading gates like this prevents UI flicker, avoids exposing incomplete state, and creates a repeatable template any new project can follow.
