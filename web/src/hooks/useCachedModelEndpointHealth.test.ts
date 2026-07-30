import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LLMdServer } from './useLLMd'

const { mockFetchLLMdServers, mockUseCache } = vi.hoisted(() => ({
  mockFetchLLMdServers: vi.fn(),
  mockUseCache: vi.fn(),
}))

vi.mock('./useCachedLLMd', () => ({
  fetchLLMdServers: mockFetchLLMdServers,
}))

vi.mock('../lib/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/cache')>()
  return {
    ...actual,
    useCache: (options: unknown) => mockUseCache(options),
    createCachedHook: (config: Record<string, unknown>) => {
      return () => {
        const result = mockUseCache(config)
        return {
          data: result.data,
          isLoading: result.isLoading,
          isRefreshing: result.isRefreshing,
          isDemoFallback: result.isDemoFallback && !result.isLoading,
          error: result.error,
          isFailed: result.isFailed,
          consecutiveFailures: result.consecutiveFailures,
          lastRefresh: result.lastRefresh,
          refetch: result.refetch,
          retryFetch: result.retryFetch,
        }
      }
    },
  }
})

import {
  fetchModelEndpointHealth,
  getDemoModelEndpointHealth,
  summarizeModelEndpointHealth,
  useCachedModelEndpointHealth,
} from './useCachedModelEndpointHealth'

const runningEndpoint: LLMdServer = {
  id: 'cluster-a-llm-d-llama-model',
  name: 'llama-model',
  namespace: 'llm-d',
  cluster: 'cluster-a',
  model: 'llama',
  type: 'vllm',
  componentType: 'model',
  status: 'running',
  replicas: 2,
  readyReplicas: 2,
}

const scalingEndpoint: LLMdServer = {
  ...runningEndpoint,
  id: 'cluster-a-llm-d-granite-model',
  name: 'granite-model',
  model: 'granite',
  status: 'scaling',
  replicas: 2,
  readyReplicas: 1,
}

const eppServer: LLMdServer = {
  ...runningEndpoint,
  id: 'cluster-a-llm-d-llama-epp',
  name: 'llama-epp',
  componentType: 'epp',
}

const BASE_STATUS = {
  data: getDemoModelEndpointHealth(),
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: 111111111,
  refetch: vi.fn(),
  retryFetch: vi.fn(),
}

describe('useCachedModelEndpointHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(BASE_STATUS)
  })

  it('summarizes healthy model endpoints', () => {
    expect(summarizeModelEndpointHealth([runningEndpoint])).toEqual({
      health: 'healthy',
      totalEndpoints: 1,
      readyEndpoints: 1,
      degradedEndpoints: 0,
      unavailableEndpoints: 0,
      totalReadyReplicas: 2,
      totalReplicas: 2,
    })
  })

  it('marks partial replica readiness as degraded', () => {
    expect(summarizeModelEndpointHealth([runningEndpoint, scalingEndpoint])).toMatchObject({
      health: 'degraded',
      totalEndpoints: 2,
      readyEndpoints: 1,
      degradedEndpoints: 1,
      totalReadyReplicas: 3,
      totalReplicas: 4,
    })
  })

  it('marks an empty endpoint list as unavailable', () => {
    expect(summarizeModelEndpointHealth([])).toMatchObject({
      health: 'unavailable',
      totalEndpoints: 0,
      totalReadyReplicas: 0,
      totalReplicas: 0,
    })
  })

  it('filters model components from llm-d servers', async () => {
    mockFetchLLMdServers.mockResolvedValue([runningEndpoint, eppServer])

    const status = await fetchModelEndpointHealth(['cluster-a'])

    expect(mockFetchLLMdServers).toHaveBeenCalledWith(['cluster-a'])
    expect(status.endpoints).toEqual([runningEndpoint])
    expect(status.summary).toMatchObject({
      health: 'healthy',
      totalEndpoints: 1,
    })
  })

  it('provides demo model endpoint data', () => {
    const demo = getDemoModelEndpointHealth()

    expect(demo.endpoints.every((endpoint) => endpoint.componentType === 'model')).toBe(true)
    expect(demo.summary.totalEndpoints).toBe(demo.endpoints.length)
  })

  it('returns cached data with endpoint convenience fields', () => {
    const { result } = renderHook(() => useCachedModelEndpointHealth())

    expect(result.current.endpoints).toEqual(BASE_STATUS.data.endpoints)
    expect(result.current.summary).toEqual(BASE_STATUS.data.summary)
    expect(result.current.isDemoFallback).toBe(false)
  })
})
