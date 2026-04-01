import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], isLoading: false })),
  useOperators: vi.fn(() => ({ operators: [], isLoading: false })),
  useHelmReleases: vi.fn(() => ({ releases: [], isLoading: false })),
}))

import { useStackDiscovery } from '../useStackDiscovery'

describe('useStackDiscovery', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useStackDiscovery())
    expect(result.current).toHaveProperty('isLoading')
  })
})
