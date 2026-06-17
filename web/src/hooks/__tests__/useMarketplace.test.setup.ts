import { vi, beforeEach, afterEach } from 'vitest'


// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}))

const mockAddCustomTheme = vi.fn()
const mockRemoveCustomTheme = vi.fn()
vi.mock('../../lib/themes', () => ({
  addCustomTheme: (...args: unknown[]) => mockAddCustomTheme(...args),
  removeCustomTheme: (...args: unknown[]) => mockRemoveCustomTheme(...args),
}))

const mockEmitInstall = vi.fn()
const mockEmitRemove = vi.fn()
const mockEmitInstallFailed = vi.fn()
vi.mock('../../lib/analytics', () => ({
  emitMarketplaceInstall: (...args: unknown[]) => mockEmitInstall(...args),
  emitMarketplaceRemove: (...args: unknown[]) => mockEmitRemove(...args),
  emitMarketplaceInstallFailed: (...args: unknown[]) => mockEmitInstallFailed(...args),
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_EXTERNAL_TIMEOUT_MS: 15000,
}))

const mockIsCardTypeRegistered = vi.fn((_t: string) => false)
vi.mock('../../components/cards/cardRegistry', () => ({
  isCardTypeRegistered: (t: string) => mockIsCardTypeRegistered(t),
}))

vi.mock('@/lib/cache', async () => {
  const React = await import('react')
  return {
    useCache: <T>(opts: { fetcher: () => Promise<T>; initialData: T }) => {
      const { fetcher, initialData } = opts
      const [state, setState] = React.useState<{
        data: T; isLoading: boolean; error: string | null
      }>({ data: initialData, isLoading: true, error: null })
      const refetch = React.useCallback(async () => {
        setState(s => ({ ...s, isLoading: true, error: null }))
        try {
          const data = await fetcher()
          setState({ data, isLoading: false, error: null })
        } catch (e) {
          setState(s => ({
            ...s,
            isLoading: false,
            error: e instanceof Error ? e.message : 'Failed to load marketplace',
          }))
        }
      }, []) // eslint-disable-line react-hooks/exhaustive-deps
      React.useEffect(() => { void refetch() }, []) // eslint-disable-line react-hooks/exhaustive-deps
      return {
        data: state.data,
        isLoading: state.isLoading,
        error: state.error,
        refetch,
        isDemoData: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      }
    },
    createCachedHook: <T>(config: { fetcher: () => Promise<T>; initialData: T }) => {
      const { fetcher, initialData } = config
      return () => {
        const React2 = require('react') // eslint-disable-line @typescript-eslint/no-require-imports
        const [state, setState] = React2.useState({ data: initialData, isLoading: true, error: null })
        const refetch = React2.useCallback(async () => {
          setState((s: { data: T; isLoading: boolean; error: string | null }) => ({ ...s, isLoading: true }))
          try { const data = await fetcher(); setState({ data, isLoading: false, error: null }) }
          catch (e) { setState((s: { data: T; isLoading: boolean; error: string | null }) => ({ ...s, isLoading: false, error: e instanceof Error ? e.message : 'error' })) }
        }, [])
        React2.useEffect(() => { void refetch() }, [])
        return { data: state.data, isLoading: state.isLoading, error: state.error, refetch, isDemoData: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null }
      }
    },
  }
})

import { useMarketplace, useAuthorProfile } from '../useMarketplace'
import type { MarketplaceItem } from '../useMarketplace'
import { computeSha256 } from '../useMarketplace/integrity'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INSTALLED_KEY = 'kc-marketplace-installed'
const TRUSTED_DOWNLOAD_URL = 'https://raw.githubusercontent.com/kubestellar/console-marketplace/main/test.json'
const UNTRUSTED_DOWNLOAD_URL = 'https://example.com/test.json'
const DEFAULT_SHA256 = 'a'.repeat(64)

function makeItem(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    description: 'A test item for the marketplace',
    author: 'tester',
    version: '1.0.0',
    downloadUrl: TRUSTED_DOWNLOAD_URL,
    sha256: DEFAULT_SHA256,
    tags: ['monitoring'],
    cardCount: 2,
    type: 'dashboard',
    ...overrides,
  }
}

function makeRegistry(items: MarketplaceItem[], presets?: MarketplaceItem[]) {
  return {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    items,
    presets,
  }
}

function seedCache(items: MarketplaceItem[], presets?: MarketplaceItem[]) {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(makeRegistry(items, presets)),
  } as Response)
}

function seedInstalledItems(map: Record<string, unknown>) {
  localStorage.setItem(INSTALLED_KEY, JSON.stringify(map))
  // Trigger the cross-tab sync listener so the module-level
  // installedSnapshot is refreshed from localStorage (#7574).
  window.dispatchEvent(new StorageEvent('storage', { key: INSTALLED_KEY }))
  // Mock the dashboards API so reconciliation doesn't remove seeded entries (#7574).
  const dashboardIds = (Object.values(map) as Array<Record<string, unknown>>)
    .filter((e: Record<string, unknown>) => e.dashboardId)
    .map((e: Record<string, unknown>) => ({ id: e.dashboardId }))
  if (dashboardIds.length > 0) {
    mockApiGet.mockResolvedValue({ data: dashboardIds })
  }
}

// ---------------------------------------------------------------------------
// Tests — useMarketplace
// ---------------------------------------------------------------------------


export { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
export { renderHook, act, waitFor } from '@testing-library/react'
export { useMarketplace, useAuthorProfile }
export { type MarketplaceItem }
export { computeSha256 }
export {
  mockApiGet,
  mockApiPost,
  mockApiDelete,
  mockAddCustomTheme,
  mockRemoveCustomTheme,
  mockEmitInstall,
  mockEmitRemove,
  mockEmitInstallFailed,
  mockIsCardTypeRegistered,
  INSTALLED_KEY,
  TRUSTED_DOWNLOAD_URL,
  UNTRUSTED_DOWNLOAD_URL,
  DEFAULT_SHA256,
  makeItem,
  makeRegistry,
  seedCache,
  seedInstalledItems,
}

export function setupUseMarketplaceSuite() {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockApiGet.mockResolvedValue({ data: [] })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
}

export function setupUseAuthorProfileSuite() {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
}
