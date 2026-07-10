import { afterAll, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const isBrowserEnvironment = typeof window !== 'undefined'

// Mock react-i18next globally to prevent i18n.ts from failing when imported
// by components under test. Avoids importOriginal to prevent loading the real
// react-i18next module tree (and its transitive deps) in every test worker,
// which caused "failed to load" OOM crashes in coverage suite CI runs (#20789).
// The initReactI18next stub satisfies i18n.ts's `.use(initReactI18next)` call;
// i18n.ts already guards with `if (initReactI18next)` for safety.
// NOTE: vi.mock MUST be at top level (not inside if blocks) per Vitest requirements.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      // Preserve specific LaunchSequence strings used in tests
      if (key === 'missionControl.launchSequence.missionFailed') return 'Mission failed'
      if (key === 'missionControl.launchSequence.missionCancelled') return 'Mission cancelled'
      // Support Deploying X projects in Y phase with pluralization
      if (key.includes('missionControl.launchSequence.deployingProjects')) {
        const count = typeof options?.count === 'number' ? options!.count as number : 0
        const phaseCount = typeof options?.phaseCount === 'number' ? options!.phaseCount as number : 0
        return `Deploying ${count} project${count === 1 ? '' : 's'} in ${phaseCount} phase`
      }
      // Generic interpolation: replace {{key}} placeholders when options provided
      if (options && typeof key === 'string') {
        let s = key
        for (const [k, v] of Object.entries(options)) {
          s = s.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v))
        }
        return s
      }
      // Default: return the key as a fallback
      return key
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
// NOTE: vi.mock MUST be at top level (not inside if blocks) per Vitest requirements.
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
// NOTE: vi.mock MUST be at top level (not inside if blocks) per Vitest requirements.
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
// NOTE: vi.mock MUST be at top level (not inside if blocks) per Vitest requirements.
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
  checkOAuthConfiguredWithRetry: vi.fn(() => Promise.resolve({ backendUp: true, oauthConfigured: true })),
  checkOAuthConfigured: vi.fn(() => Promise.resolve({ backendUp: true, oauthConfigured: true })),
  isBackendUnavailable: vi.fn(() => false),
  UnauthenticatedError: class UnauthenticatedError extends Error { constructor(m?: string) { super(m ?? 'Unauthenticated') } },
  UnauthorizedError: class UnauthorizedError extends Error { constructor(m?: string) { super(m ?? 'Unauthorized') } },
  RateLimitError: class RateLimitError extends Error { constructor(m?: string) { super(m ?? 'Rate limited') } },
  BackendUnavailableError: class BackendUnavailableError extends Error { constructor(m?: string) { super(m ?? 'Backend unavailable') } },
}))

// Mock agentFetch wrappers to delegate to global.fetch so test mocks intercept
// both the legacy shared wrapper and the direct mcp/agentFetch module imports.
// NOTE: vi.mock MUST be at top level (not inside if blocks) per Vitest requirements.
vi.mock('../hooks/mcp/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/mcp/shared')>()
  return {
    ...actual,
    agentFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => global.fetch(url, init)),
  }
})

vi.mock('../hooks/mcp/agentFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/mcp/agentFetch')>()
  return {
    ...actual,
    agentFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => global.fetch(url, init)),
  }
})

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
  vi.clearAllMocks()
})

// Clear global stubs after every test file.
// In vitest 4.x with pool:'forks'/isolate:false and maxWorkers:1 (CI), all test
// files in a shard share one worker process, so vi.stubGlobal() calls in one
// file's beforeAll leak into subsequent files.
// afterAll in setupFiles runs once per worker (end of shard), not once per file.
// Belt-and-suspenders: primary cleanup now happens in afterEach above (#20007).
afterAll(() => {
  vi.unstubAllGlobals()
})
