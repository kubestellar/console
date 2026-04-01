import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/analytics', () => ({
  emitSnoozed: vi.fn(),
  emitUnsnoozed: vi.fn(),
}))

import { useSnoozedMissions } from '../useSnoozedMissions'
import type { MissionSuggestion } from '../useMissionSuggestions'

const MOCK_SUGGESTION: MissionSuggestion = {
  id: 'mission-1',
  type: 'restart',
  title: 'Fix restarting pods',
  description: '3 pods restarting',
  priority: 'high',
  action: { type: 'ai', target: 'diagnose', label: 'Diagnose' },
  context: { count: 3 },
  detectedAt: Date.now(),
}

describe('useSnoozedMissions', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('starts with empty snoozed/dismissed lists', () => {
    const { result } = renderHook(() => useSnoozedMissions())
    expect(result.current.snoozedMissions).toEqual([])
    expect(result.current.dismissedMissions).toEqual([])
  })

  it('snoozeMission adds to snoozed list', () => {
    const { result } = renderHook(() => useSnoozedMissions())
    act(() => { result.current.snoozeMission(MOCK_SUGGESTION) })
    expect(result.current.snoozedMissions).toHaveLength(1)
  })

  it('isSnoozed returns true for snoozed missions', () => {
    const { result } = renderHook(() => useSnoozedMissions())
    act(() => { result.current.snoozeMission(MOCK_SUGGESTION) })
    expect(result.current.isSnoozed('mission-1')).toBe(true)
    expect(result.current.isSnoozed('nonexistent')).toBe(false)
  })

  it('clearAllSnoozed removes all snoozed missions', () => {
    const { result } = renderHook(() => useSnoozedMissions())
    act(() => { result.current.snoozeMission(MOCK_SUGGESTION) })
    act(() => { result.current.clearAllSnoozed() })
    expect(result.current.snoozedMissions).toHaveLength(0)
  })

  it('dismissMission adds to dismissed list', () => {
    const { result } = renderHook(() => useSnoozedMissions())
    act(() => { result.current.dismissMission('mission-1') })
    expect(result.current.isDismissed('mission-1')).toBe(true)
  })

  it('isDismissed returns false for non-dismissed missions', () => {
    const { result } = renderHook(() => useSnoozedMissions())
    expect(result.current.isDismissed('nonexistent')).toBe(false)
  })

  it('snoozeMission changes snoozed state', () => {
    const { result } = renderHook(() => useSnoozedMissions())
    act(() => { result.current.snoozeMission(MOCK_SUGGESTION) })
    // The mission should now be snoozed
    expect(result.current.isSnoozed('mission-1')).toBe(true)
  })
})
