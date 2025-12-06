---
description: Guidelines for persisting UI state across page navigation
---

# UI State Persistence

This workflow describes when and how to persist UI state so users don't lose context when navigating between pages.

## Problem

In Next.js App Router, navigating away from a page causes it to unmount and lose all React state. When users return (via back button or explicit navigation), they expect to see the same tab, filters, or scroll position they left.

## Solution: sessionStorage

Use `sessionStorage` to persist navigation-critical state. It:
- Survives navigation within the same tab
- Clears when the tab closes (expected behavior)
- Is fast and synchronous

## When to Use

| Persist ✅ | Don't Persist ❌ |
|-----------|-----------------|
| Selected tabs/views | Form inputs (use URL params) |
| Applied filters/sort | Modal open state |
| Expanded accordions | Hover/focus states |
| Scroll position | Sensitive data (tokens, PII) |

## Implementation Pattern

```typescript
// 1. Initialize from sessionStorage (lazy)
const [activeTab, setActiveTab] = useState<TabType>(() => {
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('myPage_activeTab');
    if (stored && validTabs.includes(stored)) return stored as TabType;
  }
  return 'default';
});

// 2. Persist on change
useEffect(() => {
  sessionStorage.setItem('myPage_activeTab', activeTab);
}, [activeTab]);

// 3. Only reset on explicit user action (not on navigation back)
const prevIdRef = useRef<number | null>(null);
useEffect(() => {
  if (prevIdRef.current !== null && selectedId !== prevIdRef.current) {
    setActiveTab('default'); // Reset only when user switches context
  }
  prevIdRef.current = selectedId;
}, [selectedId]);
```

## Key: Naming Convention

Use descriptive keys prefixed by page/component:
- `adminCenterTab` - Admin page main tab
- `projectListSort` - Projects list sort order
- `envelopeListFilters` - Envelope filtering state

## Examples in Codebase

- `web/app/admin/page.tsx`: `centerTab` persists via `adminCenterTab` in sessionStorage
