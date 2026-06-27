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
  fetchEPPStatus,
  getDemoEPPStatus,
  summarizeEPPStatus,
  useCachedEPPStatus,
} from './useCachedEPPStatus'

const runningEPP: LLMdServer = {
  id: 'cluster-a-llm-d-llama-epp',
  name: 'llama-epp',
  namespace: 'llm-d',
  cluster: 'cluster-a',
  model: 'llama',
  type: 'llm-d',
  componentType: 'epp',
  status: 'running',
  replicas: 2,
  readyReplicas: 2,
}

const scalingEPP: LLMdServer = {
  ...runningEPP,
  id: 'cluster-a-llm-d-granite-epp',
  name: 'granite-epp',
  model: 'granite',
  status: 'scaling',
  readyReplicas: 1,
}

const modelServer: LLMdServer = {
  ...runningEPP,
  id: 'cluster-a-llm-d-llama-model',
  name: 'llama-model',
  componentType: 'model',
}

const BASE_STATUS = {
  data: getDemoEPPStatus(),
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

describe('useCachedEPPStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(BASE_STATUS)
  })

  it('summarizes healthy EPPs', () => {
    expect(summarizeEPPStatus([runningEPP])).toEqual({
      health: 'healthy',
      totalEPPs: 1,
      readyEPPs: 1,
      degradedEPPs: 0,
      unavailableEPPs: 0,
    })
  })

  it('marks mixed EPP status as degraded', () => {
    expect(summarizeEPPStatus([runningEPP, scalingEPP])).toMatchObject({
      health: 'degraded',
      totalEPPs: 2,
      readyEPPs: 1,
      degradedEPPs: 1,
    })
  })

  it('marks an empty EPP list as unavailable', () => {
    expect(summarizeEPPStatus([])).toMatchObject({
      health: 'unavailable',
      totalEPPs: 0,
    })
  })

  it('filters EPP components from llm-d servers', async () => {
    mockFetchLLMdServers.mockResolvedValue([runningEPP, modelServer])

    const status = await fetchEPPStatus(['cluster-a'])

    expect(mockFetchLLMdServers).toHaveBeenCalledWith(['cluster-a'])
    expect(status.epps).toEqual([runningEPP])
    expect(status.summary).toMatchObject({
      health: 'healthy',
      totalEPPs: 1,
    })
  })

  it('provides demo EPP data', () => {
    const demo = getDemoEPPStatus()

    expect(demo.epps.every((epp) => epp.componentType === 'epp')).toBe(true)
    expect(demo.summary.totalEPPs).toBe(demo.epps.length)
  })

  it('returns cached data with EPP convenience fields', () => {
    const { result } = renderHook(() => useCachedEPPStatus())

    expect(result.current.epps).toEqual(BASE_STATUS.data.epps)
    expect(result.current.summary).toEqual(BASE_STATUS.data.summary)
    expect(result.current.isDemoFallback).toBe(false)
  })
})
