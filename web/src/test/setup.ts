import { afterAll, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const isBrowserEnvironment = typeof window !== 'undefined'

// Only mock browser-specific modules in jsdom environment (not in node environment tests)
// This prevents "Cannot find module" errors in Netlify function tests that run in node environment
if (isBrowserEnvironment) {
  // Mock react-i18next globally to prevent i18n.ts from failing when imported
  // by components under test. Avoids importOriginal to prevent loading the real
  // react-i18next module tree (and its transitive deps) in every test worker,
  // which caused "failed to load" OOM crashes in coverage suite CI runs (#20789).
  // The initReactI18next stub satisfies i18n.ts's `.use(initReactI18next)` call;
  // i18n.ts already guards with `if (initReactI18next)` for safety.
  vi.mock('react-i18next', () => ({
    useTranslation: () => ({
      // Support both t(key, opts) and t(key, defaultValue, opts) i18next overloads.
      // Without the 3-arg form, components that call t(key, 'default {{count}}', {count})
      // would pass the string as `opts`, causing `'count' in string` TypeErrors.
      t: (key: string, optsOrDefault?: Record<string, unknown> | string, maybeOpts?: Record<string, unknown>) => {
        const opts = typeof optsOrDefault === 'object' && optsOrDefault !== null ? optsOrDefault : maybeOpts
        const template = typeof optsOrDefault === 'string' ? optsOrDefault : key
        // Preserve specific LaunchSequence strings used in tests
        if (key === 'missionControl.launchSequence.missionFailed') return 'Mission failed'
        if (key === 'missionControl.launchSequence.missionCancelled') return 'Mission cancelled'
        // Support Deploying X projects in Y phase with pluralization
        if (key.includes('missionControl.launchSequence.deployingProjects')) {
          const count = typeof opts?.count === 'number' ? opts.count : 0
          const phaseCount = typeof opts?.phaseCount === 'number' ? opts.phaseCount : 0
          return `Deploying ${count} project${count === 1 ? '' : 's'} in ${phaseCount} phase`
        }
        // Generic interpolation: replace {{key}} placeholders when options provided
        if (opts) {
          return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? `{{${k}}}`))
        }
        return template
      },
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
    initReactI18next: { type: '3rdParty', init: () => {} },
    I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
    withTranslation: () => (Component: unknown) => Component,
    Translation: ({ children }: { children: (t: (k: string) => string) => React.ReactNode }) =>
      children((k: string) => k),
  }))

  // Mock lib/demoMode globally to prevent module-level initialization that accesses
  // localStorage and getStoredAuthTokenSync at import time. This ensures tests don't
  // break when any module imports demoMode or useDemoMode.
  vi.mock('../lib/demoMode', () => ({
    isDemoMode: vi.fn(() => false),
    setDemoMode: vi.fn(),
    toggleDemoMode: vi.fn(),
    subscribeDemoMode: vi.fn(() => () => {}),
    isNetlifyDeployment: false,
    isDemoModeForced: false,
    canToggleDemoMode: vi.fn(() => true),
    isDemoToken: vi.fn(async () => false),
    hasRealToken: vi.fn(async () => true),
    setDemoToken: vi.fn(),
    getDemoMode: vi.fn(() => false),
    setGlobalDemoMode: vi.fn(),
    isQuantumWorkloadAvailable: vi.fn(() => false),
    setQuantumWorkloadAvailable: vi.fn(),
    isQuantumForcedToDemo: vi.fn(() => false),
    activatePublicDemoMode: vi.fn(),
  }))

  // Mock useDemoMode hook globally - uses the lib/demoMode mock above.
  // Provides a complete standalone mock without vi.importActual to avoid triggering
  // module initialization. Re-exports all utilities from lib/demoMode.
  vi.mock('../hooks/useDemoMode', () => ({
    useDemoMode: () => ({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    }),
    // Re-export all lib/demoMode functions (both current and legacy names)
    isDemoMode: vi.fn(() => false),
    setDemoMode: vi.fn(),
    toggleDemoMode: vi.fn(),
    subscribeDemoMode: vi.fn(() => () => {}),
    getDemoMode: vi.fn(() => false),
    setGlobalDemoMode: vi.fn(),
    isNetlifyDeployment: false,
    isDemoModeForced: false,
    canToggleDemoMode: vi.fn(() => true),
    isDemoToken: vi.fn(async () => false),
    hasRealToken: vi.fn(async () => true),
    setDemoToken: vi.fn(),
    isQuantumWorkloadAvailable: vi.fn(() => false),
    setQuantumWorkloadAvailable: vi.fn(),
    isQuantumForcedToDemo: vi.fn(() => false),
    activatePublicDemoMode: vi.fn(),
  }))


  // Global mock for lib/api — provides ALL exports so that coverage.all
  // force-imports (and transitive imports in any test) never hit the error:
  //   "No authFetch export is defined on the mock"
  // Individual test files that vi.mock('lib/api') with their own factory will
  // override this entirely; this is only a safety-net default. (#20382)
  vi.mock('../lib/api', () => ({
    authFetch: vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    safeJson: vi.fn((r: Response) => r.json()),
    api: {
      get: vi.fn().mockResolvedValue({ data: {} }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
    },
    checkBackendAvailability: vi.fn(() => Promise.resolve(true)),
    checkOAuthConfiguredWithRetry: vi.fn(() => Promise.resolve({ backendUp: true, oauthConfigured: true, inCluster: false })),
    checkOAuthConfigured: vi.fn(() => Promise.resolve({ backendUp: true, oauthConfigured: true, inCluster: false })),
    isBackendUnavailable: vi.fn(() => false),
    UnauthenticatedError: class UnauthenticatedError extends Error { constructor(m?: string) { super(m ?? 'Unauthenticated') } },
    UnauthorizedError: class UnauthorizedError extends Error { constructor(m?: string) { super(m ?? 'Unauthorized') } },
    RateLimitError: class RateLimitError extends Error { constructor(m?: string) { super(m ?? 'Rate limited') } },
    BackendUnavailableError: class BackendUnavailableError extends Error { constructor(m?: string) { super(m ?? 'Backend unavailable') } },
  }))

  // Mock agentFetch wrappers to delegate to global.fetch so test mocks intercept
  // both the legacy shared wrapper and the direct mcp/agentFetch module imports.
  // Ensure global.fetch exists in the test environment so these wrappers can
  // safely delegate to it without throwing when tests run in certain workers.
  if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = vi.fn(async () => {
      if (typeof Response !== 'undefined') {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response
    })
  }

  vi.mock('../hooks/mcp/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../hooks/mcp/shared')>()
    return {
      ...actual,
      agentFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(url, init)),
    }
  })

  vi.mock('../hooks/mcp/agentFetch', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../hooks/mcp/agentFetch')>()
    return {
      ...actual,
      agentFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(url, init)),
    }
  })
}

const TOKEN_STORAGE_ALIASES = ['token', 'kc_token', 'kc-token', 'kc-auth-token'] as const

// Mock localStorage
const localStorageStore: Record<string, string> = {}
const isTokenAlias = (key: string): key is typeof TOKEN_STORAGE_ALIASES[number] =>
  TOKEN_STORAGE_ALIASES.includes(key as typeof TOKEN_STORAGE_ALIASES[number])
const syncTokenAliases = (value: string | null) => {
  for (const alias of TOKEN_STORAGE_ALIASES) {
    if (value === null) {
      delete localStorageStore[alias]
    } else {
      localStorageStore[alias] = value
    }
  }
}

if (isBrowserEnvironment) {
  const localStorageMock = {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => {
      const nextValue = String(value)
      localStorageStore[key] = nextValue
      if (isTokenAlias(key)) {
        syncTokenAliases(nextValue)
      }
    },
    removeItem: (key: string) => {
      if (isTokenAlias(key)) {
        syncTokenAliases(null)
        return
      }
      delete localStorageStore[key]
    },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]) },
    key: (index: number) => Object.keys(localStorageStore)[index] ?? null,
    get length() { return Object.keys(localStorageStore).length },
  }
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Mock IntersectionObserver
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    value: class IntersectionObserver {
      constructor() {}
      disconnect() {}
      observe() {}
      takeRecords() {
        return []
      }
      unobserve() {}
    },
  })

  // Mock ResizeObserver
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class ResizeObserver {
      constructor() {}
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  })
}

// Cleanup after each test.
afterEach(() => {
  if (isBrowserEnvironment) {
    cleanup()
    window.localStorage.clear()
    window.sessionStorage?.clear()
  }
  vi.unstubAllEnvs()
  // Restore vi.spyOn() overrides to their original implementations (#20895).
  vi.restoreAllMocks()
  // Clear call history for all mocks, including standalone vi.fn() instances that
  // vi.restoreAllMocks() does not reset. Without this, vi.fn() call counts accumulate
  // across tests and cause "expected not to be called" assertions to fail. (#20899)
  vi.clearAllMocks()
  // Release any pending fake timers so they cannot fire during the next test.
  // Prevents vi.useFakeTimers() leaking across test boundaries. (#20895)
  vi.useRealTimers()
})

// Clear global stubs when this test file finishes.
// With isolate:true (current setting in vite.config.ts), the setupFile runs inside
// each test file's own subprocess, so this afterAll executes once per FILE —
// correctly cleaning up any vi.stubGlobal() calls the file made at module scope,
// in beforeAll, or inside test callbacks.
//
// WARNING: if isolate is ever set to false, afterAll in setupFiles runs only once
// per shard (at the end of the worker), NOT once per file. That means
// vi.stubGlobal() calls in one file leak into all subsequent files in the same
// shard, which caused 1598 test failures in Coverage Suite run #4339 (#21284).
// Do NOT set isolate:false — see web/vite.config.ts for the full explanation.
afterAll(() => {
  vi.unstubAllGlobals()
})
