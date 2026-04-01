import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/analytics', () => ({
  emitEvent: vi.fn(),
  emitTourStarted: vi.fn(),
  emitTourCompleted: vi.fn(),
  emitTourDismissed: vi.fn(),
}))

import { useTour } from '../useTour'

describe('useTour', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useTour())
    expect(result.current).toHaveProperty('isActive')
    expect(typeof result.current.isActive).toBe('boolean')
  })
})
