import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (args: unknown) => mockUseCache(args),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

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
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 123456789,
    refetch: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockUseCache.mockReturnValue({ ...defaultCacheReturn })
  })

  it('returns data from cache when not in demo mode', () => {
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.data).toEqual(emptyData)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('passes correct cache key to useCache', () => {
    renderHook(() => useCachedAttestation())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'runtime_attestation_score' }),
    )
  })

  it('returns demo data in demo mode', () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.data.clusters.length).toBeGreaterThan(0)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.isFailed).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('isDemoData is true when isDemoFallback is true and not loading', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isDemoFallback: true,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isDemoData).toBe(true)
  })

  it('isDemoData is false during loading even when isDemoFallback is true', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isLoading: true,
      isDemoFallback: true,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isDemoData).toBe(false)
  })

  it('respects isLoading state', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isLoading: true,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isLoading).toBe(true)
  })

  it('respects isRefreshing state when not in demo mode', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isRefreshing: true,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isRefreshing).toBe(true)
  })

  it('isRefreshing is always false in demo mode', () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isRefreshing: true,
    })
    const { result } = renderHook(() => useCachedAttestation())
    expect(result.current.isRefreshing).toBe(false)
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
    expect(result.current.refetch).toBe(mockRefetch)
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
