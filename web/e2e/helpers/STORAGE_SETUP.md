# Storage Setup for E2E Tests

## Problem Statement

Issues #12088 and #12089 identified critical race conditions in our Playwright test infrastructure:

### #12088: addInitScript accumulation causes cross-test state race conditions
Multiple tests register `addInitScript` in shared `beforeEach` hooks. Since addInitScript handlers cannot be removed and persist across test contexts, subsequent tests inherit scripts from previous tests. This causes conflicting state mutations — for example:

- Test A registers: `localStorage.setItem('kc-demo-mode', 'true')`
- Test B registers: `localStorage.setItem('kc-demo-mode', 'false')`
- When Test B runs, **both scripts execute**, setting demo mode to `true` then immediately to `false` (or vice versa depending on registration order)

This creates non-deterministic behavior and cross-test pollution.

### #12089: sessionStorage clearing races with IndexedDB cleanup causing stale data rehydration
Tests clear `sessionStorage.clear()` synchronously but `indexedDB.deleteDatabase()` is async. On webkit/Firefox, the page can navigate and the SWR cache layer rehydrates from sessionStorage before IndexedDB cleanup completes. This causes stale data from previous tests to appear in the current test.

**Example race condition:**
```ts
// ❌ PROBLEMATIC PATTERN
await page.addInitScript(() => {
  indexedDB.deleteDatabase('kc_cache')  // Async — returns immediately
  sessionStorage.clear()                // Sync — completes immediately
  localStorage.setItem('token', 'test-token')
})
await page.goto('/clusters')
// ^ Navigation happens BEFORE IndexedDB delete completes
// sessionStorage rehydration loads stale data from IndexedDB
```

## Solution: Unified Storage Setup

The `storage-setup.ts` helper provides a unified approach that:

1. **Uses a single init script per test** — prevents accumulation
2. **Waits for IndexedDB cleanup to complete** — async barrier with Promise.all()
3. **Clears storage atomically** — all operations complete before navigation
4. **Provides consistent presets** — `setupDemoMode()`, `setupLiveMode()`, `setupTestStorage()`

## Usage Patterns

### Standard Demo Mode (most common)
```ts
import { setupDemoMode } from './helpers/storage-setup'

test.beforeEach(async ({ page }) => {
  // Setup API mocks
  await mockApiFallback(page)
  
  // Setup storage with demo mode enabled
  await setupDemoMode(page)
  
  // Navigate AFTER storage is ready
  await page.goto('/dashboard')
})
```

This sets:
- `kc-demo-mode`: `'true'`
- `token`: `'demo-token'`
- `kc-has-session`: `'true'`
- `demo-user-onboarded`: `'true'`
- `kc-agent-setup-dismissed`: `'true'`
- `kc-backend-status`: `{ available: true, timestamp: Date.now() }`

### Live Mode (mocked API, no demo mode)
```ts
import { setupLiveMode } from './helpers/storage-setup'

test.beforeEach(async ({ page }) => {
  await mockApiFallback(page)
  
  // Setup storage with demo mode disabled
  await setupLiveMode(page)
  
  await page.goto('/clusters')
})
```

This sets:
- `kc-demo-mode`: `'false'` ← Key difference from demo mode
- `token`: `'test-token'`
- All other flags match demo mode

### Custom Configuration
```ts
import { setupTestStorage } from './helpers/storage-setup'

test.beforeEach(async ({ page }) => {
  await setupTestStorage(page, {
    demoMode: false,
    token: 'custom-token',
    onboarded: false,  // Test the onboarding flow
    extraLocalStorage: {
      'custom-key': 'custom-value',
    },
  })
  
  await page.goto('/settings')
})
```

### Clear All Storage (rare)
```ts
import { clearAllStorage } from './helpers/storage-setup'

test('clean slate test', async ({ page }) => {
  await clearAllStorage(page)
  await page.goto('/')
  // Completely empty localStorage/sessionStorage/IndexedDB
})
```

## Migration Guide

### Before (❌ Problematic)
```ts
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('kc_cache')  // Async, no barrier
    sessionStorage.clear()
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    // ... more localStorage items
  })
  await page.goto('/dashboard')
})
```

**Problems:**
- addInitScript accumulates across tests
- IndexedDB cleanup races with navigation
- Manual storage setup duplicated across files

### After (✅ Fixed)
```ts
import { setupDemoMode } from './helpers/storage-setup'

test.beforeEach(async ({ page }) => {
  await setupDemoMode(page)
  await page.goto('/dashboard')
})
```

**Benefits:**
- Single init script prevents accumulation
- IndexedDB cleanup completes before navigation
- Consistent setup across all tests
- Less boilerplate

## How It Works (Technical Details)

### Async Barrier for IndexedDB
The helper uses `Promise.all()` to wait for all IndexedDB databases to delete before proceeding:

```ts
const deletePromises = indexedDBNames.map((dbName) => {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName)
    const timer = setTimeout(() => {
      reject(new Error(`IndexedDB delete timeout for ${dbName}`))
    }, timeoutMs)

    request.onsuccess = () => {
      clearTimeout(timer)
      resolve()
    }
    request.onerror = () => {
      clearTimeout(timer)
      resolve()  // Resolve even on error — incognito mode blocks IDB
    }
    request.onblocked = () => {
      clearTimeout(timer)
      resolve()  // Resolve even if blocked
    }
  })
})

await Promise.all(deletePromises)  // ← Barrier: wait for all deletes
```

This ensures:
1. All IndexedDB databases are deleted
2. Cleanup completes before any page script runs
3. No stale data can rehydrate from IndexedDB

### Single Init Script Pattern
Instead of calling `page.addInitScript()` multiple times in different hooks, we call it once per test with all configuration passed as parameters:

```ts
await page.addInitScript(
  async ({ token, demoMode, clearIndexedDB, indexedDBNames, ... }) => {
    // Clear IndexedDB with async barrier
    if (clearIndexedDB) {
      await Promise.all(indexedDBNames.map(...))
    }
    
    // Clear sessionStorage
    sessionStorage.clear()
    
    // Set localStorage atomically
    localStorage.setItem('token', token)
    localStorage.setItem('kc-demo-mode', String(demoMode))
    // ...
  },
  { token, demoMode, clearIndexedDB, indexedDBNames, ... }
)
```

This prevents script accumulation because each test registers exactly **one** init script.

## Configuration Options

```ts
interface StorageConfig {
  token?: string                      // Auth token (default: 'demo-token')
  demoMode?: boolean                  // Demo mode flag (default: true)
  hasSession?: boolean                // Session flag (default: true)
  onboarded?: boolean                 // Onboarding flag (default: true)
  agentSetupDismissed?: boolean       // Agent setup flag (default: true)
  backendStatus?: { available: boolean; timestamp: number } | null
  extraLocalStorage?: Record<string, string>  // Custom keys
  clearIndexedDB?: boolean            // Clear IDB (default: true)
  clearSessionStorage?: boolean       // Clear sessionStorage (default: true)
  indexedDBNames?: string[]           // Databases to clear (default: ['kc_cache'])
}
```

## Common Test Scenarios

### Dashboard Tests
```ts
import { setupDemoMode } from './helpers/storage-setup'

test.beforeEach(async ({ page }) => {
  await setupStrictDemoMode(page)  // API mocks
  await setupDemoMode(page)         // Storage
  await page.goto('/dashboard')
})
```

### Clusters Page Tests
```ts
import { setupLiveMode } from './helpers/storage-setup'

test.beforeEach(async ({ page }) => {
  await mockApiFallback(page)
  await setupLiveMode(page)  // demo mode OFF
  await page.goto('/clusters')
})
```

### Login/Auth Tests
```ts
import { setupTestStorage } from './helpers/storage-setup'

test('unauthenticated user redirects to login', async ({ page }) => {
  await setupTestStorage(page, {
    token: '',          // No token
    hasSession: false,  // No session
  })
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/login')
})
```

### Onboarding Tests
```ts
import { setupTestStorage } from './helpers/storage-setup'

test('shows onboarding wizard for new users', async ({ page }) => {
  await setupTestStorage(page, {
    onboarded: false,  // New user
  })
  await page.goto('/')
  await expect(page.getByTestId('onboarding-wizard')).toBeVisible()
})
```

## Troubleshooting

### Test fails with "stale data" error
**Symptom:** Test sees data from a previous test.  
**Cause:** IndexedDB cleanup didn't complete before navigation.  
**Fix:** Ensure you're using `setupDemoMode()` / `setupLiveMode()` instead of manual `page.addInitScript()`.

### Demo mode is wrong (true when it should be false)
**Symptom:** Test expects live mode but app shows demo badge.  
**Cause:** addInitScript accumulation from a previous test.  
**Fix:** Use `setupLiveMode()` instead of `setupDemoMode()`, or check that you're not calling both helpers in the same test.

### localStorage not set on first page load
**Symptom:** Auth guard redirects even though token is set.  
**Cause:** `page.evaluate()` runs too late — after page scripts execute.  
**Fix:** Always use `setupDemoMode()` / `setupLiveMode()` which use `addInitScript` (runs before any page code).

## References

- Issue #12088: addInitScript accumulation
- Issue #12089: sessionStorage/IndexedDB race
- Issue #10828: sessionStorage rehydration stale data
- Issue #10433: webkit DOM stabilization timeouts
- Issue #9096: localStorage timing (page.evaluate vs addInitScript)
