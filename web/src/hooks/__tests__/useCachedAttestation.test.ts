import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/cache')>()
    return {
        ...actual,
        useCache: (args: unknown) => mockUseCache(args),
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
                }
            }
        },
    }
})

import {
  useCachedAttestation,
  WEIGHT_IMAGE_PROVENANCE,
  WEIGHT_WORKLOAD_IDENTITY,
  WEIGHT_POLICY_COMPLIANCE,
  WEIGHT_PRIVILEGE_POSTURE,
  SCORE_THRESHOLD_HIGH,
  SCORE_THRESHOLD_MEDIUM,
} from '../useCachedAttestation'
import type { AttestationData } from '../useCachedAttestation'

describe('useCachedAttestation', () => {
  const emptyData: AttestationData = { clusters: [] }

  const defaultCacheReturn = {
    data: emptyData,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 123456789,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({ ...defaultCacheReturn })
  })

  it('returns data from cache', () => {
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.data).toEqual(emptyData)
    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('passes correct cache key to useCache', () => {
    renderHook(() => useCachedAttestation())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'runtime_attestation_score' }),
    )
  })

  it('surfaces isDemoFallback when useCache reports demo fallback', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isDemoFallback: true,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('isDemoFallback is false during loading even when demo data exists', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isLoading: true,
      isDemoFallback: true,
    })
    const { result } = renderHook(() => useCachedAttestation())
    // Factory applies isDemoFallback && !isLoading
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('respects isLoading state', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isLoading: true,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isLoading).toBe(true)
  })

  it('respects isRefreshing state', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isRefreshing: true,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isRefreshing).toBe(true)
  })

  it('exposes failure state', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isFailed: true,
      consecutiveFailures: 3,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(3)
  })

  it('provides refetch function', () => {
    const mockRefetch = vi.fn()
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      refetch: mockRefetch,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(typeof result.current.refetch).toBe('function')
  })
})

describe('useCachedAttestation constants', () => {
  it('exports weight constants summing to 100', () => {
    const total =
      WEIGHT_IMAGE_PROVENANCE +
      WEIGHT_WORKLOAD_IDENTITY +
      WEIGHT_POLICY_COMPLIANCE +
      WEIGHT_PRIVILEGE_POSTURE
    expect(total).toBe(100)
  })

  it('exports score thresholds in correct order', () => {
    expect(SCORE_THRESHOLD_HIGH).toBeGreaterThan(SCORE_THRESHOLD_MEDIUM)
    expect(SCORE_THRESHOLD_MEDIUM).toBeGreaterThan(0)
  })
})
