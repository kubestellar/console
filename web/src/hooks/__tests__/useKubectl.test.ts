import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => true),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws' }
})

import { useKubectl } from '../useKubectl'

describe('useKubectl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns execute function', () => {
    const { result } = renderHook(() => useKubectl())
    expect(typeof result.current.execute).toBe('function')
  })

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useKubectl())
    expect(() => unmount()).not.toThrow()
  })
})
