import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Mock react-i18next globally to prevent i18n.ts from failing when imported
// by vite.config.ts or other modules. Uses importOriginal to get the real
// initReactI18next object that i18n.ts needs.
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
    // initReactI18next is imported from the actual module above, so tests that import
    // i18n.ts (via vite.config.ts) don't crash
  }
})

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock agentFetch to delegate to global.fetch so test mocks intercept it
// This fixes #10400 #10401: PR #10398 migrated to agentFetch wrapper, which
// bypassed global.fetch mocks. Now agentFetch delegates to global.fetch,
// allowing test mocks to work transparently.
vi.mock('../hooks/mcp/shared', async () => {
  const actual = await vi.importActual<typeof import('../hooks/mcp/shared')>('../hooks/mcp/shared')
  return {
    ...actual,
    agentFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      // Delegate to global.fetch so test mocks intercept this call
      return global.fetch(url, init)
    }),
  }
})

// Mock localStorage
const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = String(value) },
  removeItem: (key: string) => { delete localStorageStore[key] },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]) },
  key: (index: number) => Object.keys(localStorageStore)[index] ?? null,
  get length() { return Object.keys(localStorageStore).length },
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
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
