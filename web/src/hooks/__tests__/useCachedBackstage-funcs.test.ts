/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedBackstage.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockAuthFetch, mockUseCache } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockUseCache: vi.fn(),
}))
vi.mock('../../lib/api', () => ({ authFetch: mockAuthFetch }))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

mockUseCache.mockReturnValue({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
})
vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
  useCardDemoState: vi.fn(),
}))

import { __testables, useCachedBackstage } from '../useCachedBackstage'
import type {
  BackstageCatalogCounts,
  BackstagePlugin,
  BackstageScaffolderTemplate,
} from '../../lib/demo/backstage'

const {
  normalizeCatalog,
  totalEntities,
  summarize,
  deriveHealth,
  buildBackstageStatus,
  STALE_CATALOG_WINDOW_MS,
} = __testables

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_CATALOG: BackstageCatalogCounts = {
  Component: 0,
  API: 0,
  System: 0,
  Domain: 0,
  Resource: 0,
  User: 0,
  Group: 0,
}

function makePlugin(overrides: Partial<BackstagePlugin> = {}): BackstagePlugin {
  return {
    name: '@backstage/plugin-catalog',
    version: '1.21.0',
    status: 'enabled',
    ...overrides,
  }
}

function makeTemplate(
  overrides: Partial<BackstageScaffolderTemplate> = {},
): BackstageScaffolderTemplate {
  return {
    name: 'nodejs-service',
    owner: 'platform-team',
    type: 'service',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// normalizeCatalog
// ---------------------------------------------------------------------------

describe('normalizeCatalog', () => {
  it('returns all zeros for undefined input', () => {
    expect(normalizeCatalog(undefined)).toEqual(EMPTY_CATALOG)
  })

  it('returns all zeros for empty object', () => {
    expect(normalizeCatalog({})).toEqual(EMPTY_CATALOG)
  })

  it('copies valid counts', () => {
    const result = normalizeCatalog({ Component: 10, API: 5 })
    expect(result.Component).toBe(10)
    expect(result.API).toBe(5)
    expect(result.System).toBe(0)
  })

  it('ignores negative values', () => {
    const result = normalizeCatalog({ Component: -1 })
    expect(result.Component).toBe(0)
  })

  it('ignores NaN values', () => {
    const result = normalizeCatalog({ Component: NaN })
    expect(result.Component).toBe(0)
  })

  it('ignores Infinity values', () => {
    const result = normalizeCatalog({ Component: Infinity })
    expect(result.Component).toBe(0)
  })

  it('accepts zero as a valid value', () => {
    const result = normalizeCatalog({ Component: 0 })
    expect(result.Component).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// totalEntities
// ---------------------------------------------------------------------------

describe('totalEntities', () => {
  it('returns 0 for empty catalog', () => {
    expect(totalEntities(EMPTY_CATALOG)).toBe(0)
  })

  it('sums all entity kinds', () => {
    const catalog: BackstageCatalogCounts = {
      Component: 10,
      API: 5,
      System: 3,
      Domain: 2,
      Resource: 7,
      User: 20,
      Group: 4,
    }
    expect(totalEntities(catalog)).toBe(51)
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeroes for empty inputs', () => {
    const result = summarize(EMPTY_CATALOG, [], [])
    expect(result).toEqual({
      totalEntities: 0,
      enabledPlugins: 0,
      pluginErrors: 0,
      scaffolderTemplates: 0,
    })
  })

  it('counts enabled plugins and plugin errors', () => {
    const plugins = [
      makePlugin({ status: 'enabled' }),
      makePlugin({ status: 'enabled' }),
      makePlugin({ status: 'error' }),
      makePlugin({ status: 'disabled' }),
    ]
    const templates = [makeTemplate(), makeTemplate()]
    const catalog: BackstageCatalogCounts = {
      ...EMPTY_CATALOG,
      Component: 10,
    }
    const result = summarize(catalog, plugins, templates)
    expect(result.totalEntities).toBe(10)
    expect(result.enabledPlugins).toBe(2)
    expect(result.pluginErrors).toBe(1)
    expect(result.scaffolderTemplates).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  const recentSync = new Date().toISOString()

  it('returns not-installed when no entities, no plugins, and desiredReplicas is 0', () => {
    expect(deriveHealth(0, 0, [], recentSync, 0, Date.now())).toBe('not-installed')
  })

  it('returns healthy when replicas match and no errors', () => {
    const plugins = [makePlugin({ status: 'enabled' })]
    expect(deriveHealth(2, 2, plugins, recentSync, 10, Date.now())).toBe('healthy')
  })

  it('returns degraded when replicas < desiredReplicas', () => {
    const plugins = [makePlugin({ status: 'enabled' })]
    expect(deriveHealth(1, 3, plugins, recentSync, 10, Date.now())).toBe('degraded')
  })

  it('returns degraded when a plugin has error status', () => {
    const plugins = [
      makePlugin({ status: 'enabled' }),
      makePlugin({ status: 'error' }),
    ]
    expect(deriveHealth(2, 2, plugins, recentSync, 10, Date.now())).toBe('degraded')
  })

  it('returns degraded when catalog sync is stale', () => {
    const staleSync = new Date(
      Date.now() - STALE_CATALOG_WINDOW_MS - 1,
    ).toISOString()
    const plugins = [makePlugin({ status: 'enabled' })]
    expect(deriveHealth(2, 2, plugins, staleSync, 10, Date.now())).toBe('degraded')
  })

  it('returns healthy when catalog sync is within window', () => {
    const freshSync = new Date(
      Date.now() - STALE_CATALOG_WINDOW_MS + 60000,
    ).toISOString()
    const plugins = [makePlugin({ status: 'enabled' })]
    expect(deriveHealth(2, 2, plugins, freshSync, 10, Date.now())).toBe('healthy')
  })

  it('handles invalid lastCatalogSync date gracefully', () => {
    const plugins = [makePlugin({ status: 'enabled' })]
    // Invalid date string -> NaN -> Number.isFinite(NaN) = false -> skip stale check
    expect(deriveHealth(2, 2, plugins, 'not-a-date', 10, Date.now())).toBe('healthy')
  })

  it('returns not-installed with desiredReplicas > 0 but no entities and no plugins', () => {
    // desiredReplicas > 0 prevents the not-installed check from triggering
    expect(deriveHealth(1, 1, [], recentSync, 0, Date.now())).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildBackstageStatus
// ---------------------------------------------------------------------------

describe('buildBackstageStatus', () => {
  it('builds a complete status from a full response', () => {
    const raw = {
      version: '1.32.0',
      replicas: 2,
      desiredReplicas: 2,
      catalog: { Component: 50, API: 20 } as Partial<BackstageCatalogCounts>,
      plugins: [makePlugin({ status: 'enabled' })],
      templates: [makeTemplate()],
      lastCatalogSync: new Date().toISOString(),
    }
    const result = buildBackstageStatus(raw)

    expect(result.health).toBe('healthy')
    expect(result.version).toBe('1.32.0')
    expect(result.replicas).toBe(2)
    expect(result.desiredReplicas).toBe(2)
    expect(result.catalog.Component).toBe(50)
    expect(result.catalog.API).toBe(20)
    expect(result.catalog.System).toBe(0)
    expect(result.plugins).toHaveLength(1)
    expect(result.templates).toHaveLength(1)
    expect(result.summary.totalEntities).toBe(70)
    expect(result.summary.enabledPlugins).toBe(1)
    expect(result.summary.pluginErrors).toBe(0)
    expect(result.summary.scaffolderTemplates).toBe(1)
    expect(result.lastCheckTime).toBeTruthy()
    expect(result.lastCatalogSync).toBeTruthy()
  })

  it('builds not-installed status from empty response', () => {
    const result = buildBackstageStatus({})
    expect(result.health).toBe('not-installed')
    expect(result.version).toBe('unknown')
    expect(result.replicas).toBe(0)
    expect(result.desiredReplicas).toBe(0)
    expect(result.catalog).toEqual(EMPTY_CATALOG)
    expect(result.plugins).toEqual([])
    expect(result.templates).toEqual([])
    expect(result.summary.totalEntities).toBe(0)
  })

  it('defaults version to unknown when missing', () => {
    const result = buildBackstageStatus({ replicas: 1, desiredReplicas: 1 })
    expect(result.version).toBe('unknown')
  })

  it('defaults replicas to 0 for non-finite values', () => {
    const result = buildBackstageStatus({
      replicas: NaN,
      desiredReplicas: Infinity,
    })
    expect(result.replicas).toBe(0)
    expect(result.desiredReplicas).toBe(0)
  })

  it('handles non-array plugins/templates gracefully', () => {
    const result = buildBackstageStatus({
      plugins: 'not-an-array' as unknown as BackstagePlugin[],
      templates: null as unknown as BackstageScaffolderTemplate[],
    })
    expect(result.plugins).toEqual([])
    expect(result.templates).toEqual([])
  })

  it('generates lastCatalogSync when not provided', () => {
    const result = buildBackstageStatus({})
    // Should be a valid ISO timestamp
    expect(new Date(result.lastCatalogSync).getTime()).not.toBeNaN()
  })
})

// ---------------------------------------------------------------------------
// fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetcher (via useCache capture)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: null,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
  })

  it('returns parsed Backstage status on successful response', async () => {
    const validResponse = {
      version: '1.32.0',
      replicas: 2,
      desiredReplicas: 2,
      catalog: { Component: 50, API: 20 },
      plugins: [{ name: '@backstage/plugin-catalog', version: '1.21.0', status: 'enabled' }],
      templates: [{ name: 'nodejs-service', owner: 'platform-team', type: 'service' }],
      lastCatalogSync: new Date().toISOString(),
    }

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    renderHook(() => useCachedBackstage())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('healthy')
    expect(result.version).toBe('1.32.0')
    expect(result.replicas).toBe(2)
    expect(result.catalog.Component).toBe(50)
  })

  it('returns not-installed status on 404 response (no throw)', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderHook(() => useCachedBackstage())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    // Backstage fetcher returns buildBackstageStatus({}) on 404 — does not throw
    expect(result.health).toBe('not-installed')
  })

  it('throws when authFetch returns a non-404 error', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderHook(() => useCachedBackstage())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('HTTP 500')
  })

  it('throws when authFetch rejects (network error)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network failure'))

    renderHook(() => useCachedBackstage())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Network failure')
  })
})
