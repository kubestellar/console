import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useDemoMode', () => ({
  useDemoMode: vi.fn(() => ({ isDemoMode: true })),
}))

vi.mock('../useBackendHealth', () => ({
  useBackendHealth: vi.fn(() => ({
    status: 'connected',
    isConnected: true,
    inCluster: false,
  })),
}))

vi.mock('../../lib/analytics', () => ({
  emitEvent: vi.fn(),
}))

import { useSidebarConfig } from '../useSidebarConfig'

describe('useSidebarConfig', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useSidebarConfig())
    expect(result.current).toHaveProperty('sections')
    expect(Array.isArray(result.current.sections)).toBe(true)
  })
})
