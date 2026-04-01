import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [{ name: 'prod', reachable: true }],
    clusters: [{ name: 'prod', reachable: true }],
    isLoading: false,
  })),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

import { useRBACFindings } from '../useRBACFindings'

describe('useRBACFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
