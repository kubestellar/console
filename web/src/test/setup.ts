import { afterAll, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const isBrowserEnvironment = typeof window !== 'undefined'

// Only mock browser-specific modules in jsdom environment (not in node environment tests)
// This prevents "Cannot find module" errors in Netlify function tests that run in node environment
if (isBrowserEnvironment) {
  // Mock react-i18next globally to prevent i18n.ts from failing when imported
  // by vite.config.ts or other modules. Uses synchronous factory to avoid timing
  // issues with isolate:true where async factories may not resolve before imports.
  vi.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: () => {} },
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
    I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
    withTranslation: () => (Component: React.ComponentType) => Component,
    Translation: ({ children }: { children: (t: (key: string) => string) => React.ReactNode }) =>
      children((key: string) => key),
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


  // Mock agentFetch wrappers to delegate to global.fetch so test mocks intercept
  // both the legacy shared wrapper and the direct mcp/agentFetch module imports.
  // Uses synchronous factory to avoid timing issues with isolate:true.
  vi.mock('../hooks/mcp/shared', () => ({
    agentFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => global.fetch(url, init)),
    getAgentBaseUrl: vi.fn(() => ''),
    getAgentWsUrl: vi.fn(() => ''),
    isAgentAvailable: vi.fn(() => false),
  }))

  vi.mock('../hooks/mcp/agentFetch', () => ({
    agentFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => global.fetch(url, init)),
    getAgentBaseUrl: vi.fn(() => ''),
    getAgentWsUrl: vi.fn(() => ''),
    isAgentAvailable: vi.fn(() => false),
  }))
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
  vi.clearAllMocks()
})

// Clear global stubs after every test file.
// In vitest 4.x with pool:'forks'/isolate:false and maxWorkers:1 (CI), all test
// files in a shard share one worker process, so vi.stubGlobal() calls in one
// file's beforeAll leak into subsequent files.
// afterAll in setupFiles runs once per worker (end of shard), not once per file,
// so this only partially mitigates contamination — see issue #20256 for the
// full architectural fix (pool:'forks', isolate:true).
afterAll(() => {
  vi.unstubAllGlobals()
})
