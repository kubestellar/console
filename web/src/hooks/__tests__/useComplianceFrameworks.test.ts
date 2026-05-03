import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock the api module
// ---------------------------------------------------------------------------
const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

// ---------------------------------------------------------------------------
// Mock useMCP (useClusters)
// ---------------------------------------------------------------------------
vi.mock('../useMCP', () => ({
  useClusters: () => ({
    clusters: [
      { name: 'cluster-a', reachable: true },
      { name: 'cluster-b', reachable: true },
    ],
    deduplicatedClusters: [
      { name: 'cluster-a', reachable: true },
      { name: 'cluster-b', reachable: true },
    ],
    isLoading: false,
    refetch: vi.fn(),
    lastUpdated: null,
    isRefreshing: false,
    error: null,
  }),
}))

import {
  useComplianceFrameworks,
  useFrameworkEvaluation,
} from '../useComplianceFrameworks'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MOCK_FRAMEWORKS = [
  {
    id: 'pci-dss-4.0',
    name: 'PCI-DSS 4.0',
    version: '4.0',
    description: 'Payment Card Industry Data Security Standard',
    category: 'financial',
    controls: 8,
    checks: 12,
  },
  {
    id: 'soc2-type2',
    name: 'SOC 2 Type II',
    version: '2017',
    description: 'Service Organization Control 2',
    category: 'operational',
    controls: 4,
    checks: 8,
  },
]

const MOCK_EVALUATION = {
  framework_id: 'pci-dss-4.0',
  framework_name: 'PCI-DSS 4.0',
  cluster: 'cluster-a',
  score: 85.0,
  passed: 10,
  failed: 1,
  partial: 1,
  skipped: 0,
  total_checks: 12,
  controls: [],
  evaluated_at: '2025-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useComplianceFrameworks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('fetches frameworks on mount', async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_FRAMEWORKS })

    const { result } = renderHook(() => useComplianceFrameworks())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.frameworks).toHaveLength(2)
    expect(result.current.frameworks[0].id).toBe('pci-dss-4.0')
    expect(result.current.error).toBeNull()
    expect(mockGet).toHaveBeenCalledWith('/api/compliance/frameworks/')
  })

  it('handles fetch error', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useComplianceFrameworks())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Network error')
    expect(result.current.frameworks).toHaveLength(0)
  })

  it('uses cache when available', async () => {
    const cacheEntry = {
      frameworks: MOCK_FRAMEWORKS,
      timestamp: Date.now(),
    }
    localStorage.setItem('compliance-frameworks-cache', JSON.stringify(cacheEntry))

    mockGet.mockResolvedValueOnce({ data: MOCK_FRAMEWORKS })

    const { result } = renderHook(() => useComplianceFrameworks())

    // Should start with cached data (not loading)
    expect(result.current.frameworks).toHaveLength(2)
  })

  it('refetch works', async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_FRAMEWORKS })

    const { result } = renderHook(() => useComplianceFrameworks())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    mockGet.mockResolvedValueOnce({ data: [MOCK_FRAMEWORKS[0]] })
    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.frameworks).toHaveLength(1)
  })
})

describe('useFrameworkEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with no result', () => {
    const { result } = renderHook(() => useFrameworkEvaluation())

    expect(result.current.result).toBeNull()
    expect(result.current.isEvaluating).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('evaluates a framework', async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_EVALUATION })

    const { result } = renderHook(() => useFrameworkEvaluation())

    await act(async () => {
      await result.current.evaluate('pci-dss-4.0', 'cluster-a')
    })

    expect(result.current.result).not.toBeNull()
    expect(result.current.result?.score).toBe(85.0)
    expect(result.current.result?.cluster).toBe('cluster-a')
    expect(result.current.isEvaluating).toBe(false)
    expect(mockPost).toHaveBeenCalledWith(
      '/api/compliance/frameworks/pci-dss-4.0/evaluate',
      { cluster: 'cluster-a' },
    )
  })

  it('handles evaluation error', async () => {
    mockPost.mockRejectedValueOnce(new Error('Evaluation timeout'))

    const { result } = renderHook(() => useFrameworkEvaluation())

    await act(async () => {
      await result.current.evaluate('pci-dss-4.0', 'cluster-a')
    })

    expect(result.current.result).toBeNull()
    expect(result.current.error).toBe('Evaluation timeout')
    expect(result.current.isEvaluating).toBe(false)
  })

  it('clears error on new evaluation', async () => {
    mockPost.mockRejectedValueOnce(new Error('first error'))

    const { result } = renderHook(() => useFrameworkEvaluation())

    await act(async () => {
      await result.current.evaluate('pci-dss-4.0', 'cluster-a')
    })
    expect(result.current.error).toBe('first error')

    mockPost.mockResolvedValueOnce({ data: MOCK_EVALUATION })
    await act(async () => {
      await result.current.evaluate('pci-dss-4.0', 'cluster-a')
    })

    expect(result.current.error).toBeNull()
    expect(result.current.result).not.toBeNull()
  })
})
