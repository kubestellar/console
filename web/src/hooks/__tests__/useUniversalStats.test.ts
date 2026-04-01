import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], clusters: [], isLoading: false })),
  useNodes: vi.fn(() => ({ nodes: [], isLoading: false })),
  usePods: vi.fn(() => ({ pods: [], isLoading: false })),
  usePodIssues: vi.fn(() => ({ issues: [], isLoading: false })),
}))

import { useUniversalStats } from '../useUniversalStats'

describe('useUniversalStats', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useUniversalStats())
    expect(result.current).toHaveProperty('isLoading')
  })
})
