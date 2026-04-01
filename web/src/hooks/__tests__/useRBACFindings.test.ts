import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [{ name: 'prod', reachable: true }],
    clusters: [{ name: 'prod', reachable: true }],
    isLoading: false,
  })),
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useRBACFindings } from '../useRBACFindings'

describe('useRBACFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useRBACFindings())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoData')
  })

  it('provides refetch function', () => {
    const { result } = renderHook(() => useRBACFindings())
    expect(typeof result.current.refetch).toBe('function')
  })
})
