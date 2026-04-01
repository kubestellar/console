import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/analytics', () => ({
  emitEvent: vi.fn(),
  emitRewardUnlocked: vi.fn(),
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => true),
  useDemoMode: vi.fn(() => ({ isDemoMode: true })),
}))

import { useRewards } from '../useRewards'

describe('useRewards', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useRewards())
    expect(result.current).toHaveProperty('rewards')
    expect(result.current).toHaveProperty('unlockedRewards')
  })
})
