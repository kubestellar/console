import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const isBrowserEnvironment = typeof window !== 'undefined'

// Mock react-i18next globally to prevent i18n.ts from failing when imported
// by vite.config.ts or other modules. Uses importOriginal to get the real
// initReactI18next object that i18n.ts needs.
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
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
    // initReactI18next is imported from the actual module above, so tests that import
    // i18n.ts (via vite.config.ts) don't crash
  }
})

// Cleanup after each test.
// NOTE: vi.unstubAllGlobals() is intentionally NOT called here. Each test file
// runs in its own vitest worker so global stubs cannot leak between files.
// Calling unstubAllGlobals() here would remove file-level stubs (e.g.
// vi.stubGlobal('fetch', mockFetch)) after the first test in a file, breaking
// all subsequent tests that rely on that stub.
afterEach(() => {
  cleanup()
  if (isBrowserEnvironment) {
    window.localStorage.clear()
    window.sessionStorage?.clear()
  }
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

// Mock agentFetch wrappers to delegate to global.fetch so test mocks intercept
// both the legacy shared wrapper and the direct mcp/agentFetch module imports.
vi.mock('../hooks/mcp/shared', async () => {
  const actual = await vi.importActual<typeof import('../hooks/mcp/shared')>('../hooks/mcp/shared')
  return {
    ...actual,
    agentFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => global.fetch(url, init)),
  }
})

vi.mock('../hooks/mcp/agentFetch', async () => {
  const actual = await vi.importActual<typeof import('../hooks/mcp/agentFetch')>('../hooks/mcp/agentFetch')
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
