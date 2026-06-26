import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MissionSuggestion } from '../useMissionSuggestions'

vi.mock('../../lib/analytics', () => ({
  emitSnoozed: vi.fn(),
  emitUnsnoozed: vi.fn(),
}))

const STORAGE_KEY = 'kubestellar-snoozed-missions'
const NOW_MS = 1_700_000_000_000

const MOCK_SUGGESTION: MissionSuggestion = {
  id: 'mission-1',
  type: 'restart',
  title: 'Fix restarting pods',
  description: '3 pods restarting',
  priority: 'high',
  action: { type: 'ai', target: 'diagnose', label: 'Diagnose' },
  context: { count: 3 },
  detectedAt: NOW_MS,
}

async function loadHookModule() {
  vi.resetModules()
  return import('../useSnoozedMissions')
}

async function renderSnoozedMissionsHook() {
  const module = await loadHookModule()
  const hook = renderHook(() => module.useSnoozedMissions())
  return { module, ...hook }
}

describe('useSnoozedMissions', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    vi.restoreAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW_MS)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts with empty snoozed and dismissed lists', async () => {
    const { result } = await renderSnoozedMissionsHook()

    expect(result.current.snoozedMissions).toEqual([])
    expect(result.current.dismissedMissions).toEqual([])
  })

  it('falls back to empty state when persisted JSON is invalid', async () => {
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, '{invalid-json')

    const { result } = await renderSnoozedMissionsHook()

    expect(result.current.snoozedMissions).toEqual([])
    expect(result.current.dismissedMissions).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      '[useSnoozedMissions] Failed to parse snoozed missions, using default',
      expect.anything(),
    )

    warnSpy.mockRestore()
  })

  it('drops malformed and expired persisted entries before exposing state', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        snoozed: [
          {
            id: 'valid-snooze',
            suggestion: MOCK_SUGGESTION,
            snoozedAt: NOW_MS - 1_000,
            expiresAt: NOW_MS + 60_000,
          },
          {
            id: 'missing-suggestion',
            snoozedAt: NOW_MS - 1_000,
            expiresAt: NOW_MS + 60_000,
          },
          {
            id: 'expired-snooze',
            suggestion: { ...MOCK_SUGGESTION, id: 'mission-expired' },
            snoozedAt: NOW_MS - 120_000,
            expiresAt: NOW_MS - 1,
          },
        ],
        dismissed: ['mission-1', 42, null],
      }),
    )

    const { result } = await renderSnoozedMissionsHook()

    expect(result.current.snoozedMissions).toEqual([
      expect.objectContaining({
        id: 'valid-snooze',
        suggestion: expect.objectContaining({ id: 'mission-1' }),
      }),
    ])
    expect(result.current.dismissedMissions).toEqual(['mission-1'])
  })

  it('snoozeMission adds to snoozed list and updates snoozed lookups', async () => {
    const { result } = await renderSnoozedMissionsHook()

    act(() => {
      result.current.snoozeMission(MOCK_SUGGESTION)
    })

    expect(result.current.snoozedMissions).toHaveLength(1)
    expect(result.current.isSnoozed('mission-1')).toBe(true)
    expect(result.current.isSnoozed('nonexistent')).toBe(false)
  })

  it('dismissMission tracks dismissed mission ids', async () => {
    const { result } = await renderSnoozedMissionsHook()

    act(() => {
      result.current.dismissMission('mission-1')
    })

    expect(result.current.isDismissed('mission-1')).toBe(true)
    expect(result.current.isDismissed('nonexistent')).toBe(false)
  })
})
