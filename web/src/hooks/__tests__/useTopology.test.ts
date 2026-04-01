import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], clusters: [], isLoading: false })),
  useNodes: vi.fn(() => ({ nodes: [], isLoading: false })),
  usePods: vi.fn(() => ({ pods: [], isLoading: false })),
  useServices: vi.fn(() => ({ services: [], isLoading: false })),
}))

import { useTopology } from '../useTopology'

describe('useTopology', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useTopology())
    expect(result.current).toHaveProperty('isLoading')
  })
})
