import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/analytics', () => ({
  emitSnoozed: vi.fn(),
  emitUnsnoozed: vi.fn(),
}))

import { useSnoozedRecommendations } from '../useSnoozedRecommendations'

const MOCK_REC = {
  id: 'rec-1',
  cardType: 'cluster',
  title: 'Add Cluster Card',
  description: 'Monitor your clusters',
  confidence: 0.9,
  reason: 'high usage',
}

describe('useSnoozedRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns snoozedRecommendations array', () => {
    const { result } = renderHook(() => useSnoozedRecommendations())
    expect(Array.isArray(result.current.snoozedRecommendations)).toBe(true)
  })

  it('snoozeRecommendation adds a recommendation', () => {
    const { result } = renderHook(() => useSnoozedRecommendations())
    act(() => { result.current.snoozeRecommendation(MOCK_REC as never) })
    expect(result.current.snoozedRecommendations.length).toBeGreaterThanOrEqual(1)
  })

  it('isSnoozed checks by recommendation id', () => {
    const { result } = renderHook(() => useSnoozedRecommendations())
    act(() => { result.current.snoozeRecommendation(MOCK_REC as never) })
    expect(result.current.isSnoozed('rec-1')).toBe(true)
    expect(result.current.isSnoozed('nonexistent')).toBe(false)
  })

  it('isDismissed checks dismissed state', () => {
    const { result } = renderHook(() => useSnoozedRecommendations())
    expect(result.current.isDismissed('rec-1')).toBe(false)
  })

  it('dismissRecommendation marks as dismissed', () => {
    const { result } = renderHook(() => useSnoozedRecommendations())
    act(() => { result.current.dismissRecommendation('rec-1') })
    expect(result.current.isDismissed('rec-1')).toBe(true)
  })
})
