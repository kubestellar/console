import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
    createCachedHook: vi.fn(),
  fetchGitOpsAPI: vi.fn(),
  fetchViaGitOpsSSE: vi.fn(),
  fetchRbacAPI: vi.fn(),
}))

vi.mock('../useCachedData/demoData', () => ({
    createCachedHook: vi.fn(),
  getDemoHelmReleases: () => [],
  getDemoHelmHistory: () => [],
  getDemoHelmValues: () => ({ values: {} }),
  getDemoOperators: () => [],
  getDemoOperatorSubscriptions: () => [],
  getDemoGitOpsDrifts: () => [],
  getDemoBuildpackImages: () => [],
  getDemoK8sRoles: () => [],
  getDemoK8sRoleBindings: () => [],
  getDemoK8sServiceAccountsRbac: () => [],
}))

import {
  useCachedHelmReleases,
  useCachedHelmHistory,
  useCachedHelmValues,
  useCachedOperators,
  useCachedOperatorSubscriptions,
  useCachedGitOpsDrifts,
  useCachedBuildpackImages,
  useCachedK8sRoles,
  useCachedK8sRoleBindings,
  useCachedK8sServiceAccounts,
} from '../useCachedGitOps'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCache(overrides = {}) {
  return {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCache.mockReturnValue(defaultCache())
})

// ---------------------------------------------------------------------------
// useCachedHelmReleases
// ---------------------------------------------------------------------------

describe('useCachedHelmReleases', () => {
  it('exposes releases and standard cache fields', () => {
    const releases = [{ name: 'nginx', namespace: 'default', chart: 'nginx-1.0', status: 'deployed', cluster: 'c1' }]
    mockUseCache.mockReturnValue(defaultCache({ data: releases }))
    const { result } = renderHook(() => useCachedHelmReleases())
    expect(result.current.releases).toEqual(releases)
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoFallback')
  })

  it('uses cluster in cache key when provided', () => {
    renderHook(() => useCachedHelmReleases('prod'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('prod')
  })

  it('uses all in cache key when no cluster provided', () => {
    renderHook(() => useCachedHelmReleases())
    expect(mockUseCache.mock.calls[0][0].key).toContain('all')
  })
})

// ---------------------------------------------------------------------------
// useCachedHelmHistory
// ---------------------------------------------------------------------------

describe('useCachedHelmHistory', () => {
  it('exposes history field', () => {
    const history = [{ revision: 1, status: 'deployed', chart: 'nginx-1.0', updated: '', description: '', cluster: 'c1' }]
    mockUseCache.mockReturnValue(defaultCache({ data: history }))
    const { result } = renderHook(() => useCachedHelmHistory('c1', 'nginx', 'default'))
    expect(result.current.history).toEqual(history)
  })

  it('includes release name in cache key', () => {
    renderHook(() => useCachedHelmHistory('c1', 'myrelease', 'default'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('myrelease')
  })
})

// ---------------------------------------------------------------------------
// useCachedHelmValues
// ---------------------------------------------------------------------------

describe('useCachedHelmValues', () => {
  it('exposes values field', () => {
    const valuesData = { replicaCount: 2 }
    mockUseCache.mockReturnValue(defaultCache({ data: valuesData }))
    const { result } = renderHook(() => useCachedHelmValues('c1', 'nginx', 'default'))
    expect(result.current.values).toEqual(valuesData)
  })
})

// ---------------------------------------------------------------------------
// useCachedOperators
// ---------------------------------------------------------------------------

describe('useCachedOperators', () => {
  it('exposes operators field', () => {
    const operators = [{ name: 'cert-manager', namespace: 'cert-manager', version: '1.0', status: 'Succeeded', cluster: 'c1' }]
    mockUseCache.mockReturnValue(defaultCache({ data: operators }))
    const { result } = renderHook(() => useCachedOperators())
    expect(result.current.operators).toEqual(operators)
  })
})

// ---------------------------------------------------------------------------
// useCachedOperatorSubscriptions
// ---------------------------------------------------------------------------

describe('useCachedOperatorSubscriptions', () => {
  it('exposes subscriptions field', () => {
    mockUseCache.mockReturnValue(defaultCache({ data: [] }))
    const { result } = renderHook(() => useCachedOperatorSubscriptions())
    expect(result.current).toHaveProperty('subscriptions')
    expect(Array.isArray(result.current.subscriptions)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useCachedGitOpsDrifts
// ---------------------------------------------------------------------------

describe('useCachedGitOpsDrifts', () => {
  it('exposes drifts field', () => {
    mockUseCache.mockReturnValue(defaultCache({ data: [] }))
    const { result } = renderHook(() => useCachedGitOpsDrifts())
    expect(result.current).toHaveProperty('drifts')
  })

  it('isLoading is false by default', () => {
    const { result } = renderHook(() => useCachedGitOpsDrifts())
    expect(result.current.isLoading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// useCachedBuildpackImages
// ---------------------------------------------------------------------------

describe('useCachedBuildpackImages', () => {
  it('exposes images field', () => {
    mockUseCache.mockReturnValue(defaultCache({ data: [] }))
    const { result } = renderHook(() => useCachedBuildpackImages())
    expect(result.current).toHaveProperty('images')
  })
})

// ---------------------------------------------------------------------------
// RBAC hooks
// ---------------------------------------------------------------------------

describe('useCachedK8sRoles', () => {
  it('exposes roles field', () => {
    mockUseCache.mockReturnValue(defaultCache({ data: [] }))
    const { result } = renderHook(() => useCachedK8sRoles())
    expect(result.current).toHaveProperty('roles')
  })
})

describe('useCachedK8sRoleBindings', () => {
  it('exposes roleBindings field', () => {
    mockUseCache.mockReturnValue(defaultCache({ data: [] }))
    const { result } = renderHook(() => useCachedK8sRoleBindings())
    expect(result.current).toHaveProperty('bindings')
  })
})

describe('useCachedK8sServiceAccounts', () => {
  it('exposes serviceAccounts field', () => {
    mockUseCache.mockReturnValue(defaultCache({ data: [] }))
    const { result } = renderHook(() => useCachedK8sServiceAccounts())
    expect(result.current).toHaveProperty('serviceAccounts')
  })
})
