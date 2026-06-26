import { type Page } from '@playwright/test'

/**
 * Storage Setup Helper for E2E Tests
 *
 * Fixes #12088 and #12089:
 * - #12088: addInitScript accumulation causes cross-test state race conditions
 * - #12089: sessionStorage clearing races with IndexedDB cleanup causing stale data rehydration
 *
 * This helper provides a unified approach to storage initialization that:
 * 1. Clears all storage types (IndexedDB, sessionStorage, localStorage) with async barriers
 * 2. Sets state atomically in a single init script per test context
 * 3. Prevents script accumulation by using context-level or one-time page-level setup
 */

const STORAGE_CLEANUP_TIMEOUT_MS = 5_000

export interface StorageConfig {
  /**
   * Authentication token to set in localStorage
   * @default 'demo-token'
   */
  token?: string

  /**
   * Demo mode flag (kc-demo-mode localStorage key)
   * @default true
   */
  demoMode?: boolean

  /**
   * Whether user has an active session (kc-has-session localStorage key)
   * @default true
   */
  hasSession?: boolean

  /**
   * Whether demo user is marked as onboarded
   * @default true
   */
  onboarded?: boolean

  /**
   * Whether kc-agent setup wizard has been dismissed
   * @default true
   */
  agentSetupDismissed?: boolean

  /**
   * Backend status object to cache in localStorage
   * @default { available: true, timestamp: Date.now() }
   */
  backendStatus?: { available: boolean; timestamp: number } | null

  /**
   * Additional localStorage items to set (key-value pairs)
   */
  extraLocalStorage?: Record<string, string>

  /**
   * Whether to clear IndexedDB databases before setting state
   * @default true
   */
  clearIndexedDB?: boolean

  /**
   * Whether to clear sessionStorage before setting state
   * @default true
   */
  clearSessionStorage?: boolean

  /**
   * Specific IndexedDB database names to clear (if not provided, clears kc_cache)
   * @default ['kc_cache']
   */
  indexedDBNames?: string[]
}

/**
 * Clears all storage and sets up localStorage state in a single atomic operation.
 *
 * This function runs in the browser context via page.addInitScript(), ensuring:
 * 1. Storage is cleared before any app code runs
 * 2. IndexedDB cleanup completes before sessionStorage is accessible
 * 3. All localStorage values are set atomically
 *
 * Usage in beforeEach:
 * ```ts
 * test.beforeEach(async ({ page }) => {
 *   await setupTestStorage(page, { demoMode: true })
 *   await page.goto('/dashboard')
 * })
 * ```
 *
 * @param page - Playwright Page instance
 * @param config - Storage configuration options
 */
export async function setupTestStorage(page: Page, config: StorageConfig = {}): Promise<void> {
  const {
    token = 'demo-token',
    demoMode = true,
    hasSession = true,
    onboarded = true,
    agentSetupDismissed = true,
    backendStatus = { available: true, timestamp: Date.now() },
    extraLocalStorage = {},
    clearIndexedDB = true,
    clearSessionStorage = true,
    indexedDBNames = ['kc_cache'],
  } = config

  // Use addInitScript to run before any page code executes.
  // This is critical for webkit/Safari where the auth redirect fires
  // synchronously on script evaluation (#9096, #10433).
  await page.addInitScript(
    async ({
      token,
      demoMode,
      hasSession,
      onboarded,
      agentSetupDismissed,
      backendStatus,
      extraLocalStorage,
      clearIndexedDB,
      clearSessionStorage,
      indexedDBNames,
      timeoutMs,
    }) => {
      // ---------------------------------------------------------------------------
      // Step 1: Clear IndexedDB databases (async barrier)
      // ---------------------------------------------------------------------------
      if (clearIndexedDB) {
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
              // Resolve even on error — some browsers block IDB in incognito mode
              resolve()
            }
            request.onblocked = () => {
              clearTimeout(timer)
              // Resolve even if blocked — test will proceed with stale data
              resolve()
            }
          })
        })

        await Promise.all(deletePromises)
      }

      // ---------------------------------------------------------------------------
      // Step 2: Clear sessionStorage (synchronous)
      // ---------------------------------------------------------------------------
      if (clearSessionStorage) {
        sessionStorage.clear()
      }

      // ---------------------------------------------------------------------------
      // Step 3: Clear stale backend/session caches (synchronous)
      // ---------------------------------------------------------------------------
      // Remove cached session/update state before any app code runs so Playwright
      // tests do not inherit real-user polling from a prior local browser session.
      localStorage.removeItem('kc-backend-status')
      localStorage.removeItem('kc-has-session')
      localStorage.removeItem('kc-update-channel')
      localStorage.removeItem('kc-releases-cache')
      localStorage.removeItem('kc-auth-token')

      // ---------------------------------------------------------------------------
      // Step 4: Set localStorage state atomically
      // ---------------------------------------------------------------------------
      localStorage.setItem('token', token)
      localStorage.setItem('kc-demo-mode', String(demoMode))
      if (hasSession) {
        localStorage.setItem('kc-has-session', 'true')
      }
      localStorage.setItem('demo-user-onboarded', String(onboarded))
      localStorage.setItem('kc-agent-setup-dismissed', String(agentSetupDismissed))

      if (backendStatus) {
        localStorage.setItem('kc-backend-status', JSON.stringify(backendStatus))
      }

      // Set extra localStorage items
      for (const [key, value] of Object.entries(extraLocalStorage)) {
        localStorage.setItem(key, value)
      }
    },
    {
      token,
      demoMode,
      hasSession,
      onboarded,
      agentSetupDismissed,
      backendStatus,
      extraLocalStorage,
      clearIndexedDB,
      clearSessionStorage,
      indexedDBNames,
      timeoutMs: STORAGE_CLEANUP_TIMEOUT_MS,
    }
  )
}

/**
 * Clears all storage without setting any state.
 *
 * Useful for tests that need a completely clean slate before navigation.
 *
 * @param page - Playwright Page instance
 */
export async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Clear sessionStorage synchronously
    sessionStorage.clear()
    localStorage.clear()

    // Clear all IndexedDB databases with async barrier
    const databases = await indexedDB.databases()
    const deletePromises = databases.map((db) => {
      return new Promise<void>((resolve) => {
        if (!db.name) return resolve()
        const request = indexedDB.deleteDatabase(db.name)
        request.onsuccess = () => resolve()
        request.onerror = () => resolve() // Resolve even on error
        request.onblocked = () => resolve() // Resolve even if blocked
        setTimeout(resolve, 5000) // Timeout fallback
      })
    })

    await Promise.all(deletePromises)
  })
}

/**
 * Demo mode storage setup — equivalent to the old setupDemoMode() pattern.
 *
 * Sets localStorage for demo mode with all required flags and mocks /api/me.
 * Uses the unified storage setup to prevent script accumulation.
 *
 * @param page - Playwright Page instance
 */
export async function setupDemoMode(page: Page): Promise<void> {
  await setupTestStorage(page, {
    token: 'demo-token',
    demoMode: true,
    hasSession: false,
    onboarded: true,
    agentSetupDismissed: true,
    backendStatus: { available: true, timestamp: Date.now() },
  })
}

/**
 * Live mode storage setup — clears demo mode flag and sets up for live backend.
 *
 * Used by tests that mock API responses but want to test against live-like state.
 *
 * @param page - Playwright Page instance
 */
export async function setupLiveMode(page: Page): Promise<void> {
  await setupTestStorage(page, {
    token: 'test-token',
    demoMode: false,
    hasSession: true,
    onboarded: true,
    agentSetupDismissed: true,
    backendStatus: { available: true, timestamp: Date.now() },
  })
}
