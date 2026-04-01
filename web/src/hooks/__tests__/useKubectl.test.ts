import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => true),
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws',
}))

import { useKubectl } from '../useKubectl'

describe('useKubectl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns exec function', () => {
    const { result } = renderHook(() => useKubectl())
    expect(typeof result.current.exec).toBe('function')
  })

  it('returns isConnected state', () => {
    const { result } = renderHook(() => useKubectl())
    expect(typeof result.current.isConnected).toBe('boolean')
  })

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useKubectl())
    expect(() => unmount()).not.toThrow()
  })
})
