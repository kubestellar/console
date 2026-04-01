import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [{ name: 'prod', reachable: true }],
    isLoading: false,
  })),
}))

vi.mock('../useGlobalFilters', () => ({
  useGlobalFilters: vi.fn(() => ({
    selectedClusters: [],
    setSelectedClusters: vi.fn(),
    selectedNamespaces: [],
    setSelectedNamespaces: vi.fn(),
  })),
}))

import { useArgoCDApplications, useArgoCDHealth } from '../useArgoCD'

describe('useArgoCDApplications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useArgoCDApplications())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('applications')
  })

  it('falls back to demo data when API unavailable', async () => {
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
  })
})

describe('useArgoCDHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useArgoCDHealth())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoData')
  })
})
