import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock analytics — shared across all hooks
// ---------------------------------------------------------------------------
vi.mock('../../lib/analytics', () => ({
  emitSnoozed: vi.fn(),
  emitUnsnoozed: vi.fn(),
}))

// Mock the MissionSuggestion dependency (useSnoozedMissions imports the type)
vi.mock('../useMissionSuggestions', () => ({}))

// Mock the CardRecommendation dependency (useSnoozedRecommendations imports the type)
vi.mock('../useCardRecommendations', () => ({}))

// Mock constants used by useSnoozedAlerts
vi.mock('../../lib/constants/network', () => ({
  POLL_INTERVAL_SLOW_MS: 60_000,
  MISSION_SUGGEST_INTERVAL_MS: 60_000,
  RECOMMENDATION_INTERVAL_MS: 60_000,
}))

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get _store() {
      return store
    },
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { MissionSuggestion } from '../useMissionSuggestions'
import type { CardRecommendation } from '../useCardRecommendations'

function makeMissionSuggestion(id: string): MissionSuggestion {
  return {
    id,
    type: 'health',
    title: `Test mission ${id}`,
    description: 'A test suggestion',
    priority: 'medium',
    action: { type: 'navigate', target: '/test', label: 'Go' },
    context: {},
    detectedAt: Date.now(),
  }
}

function makeCardRecommendation(id: string): CardRecommendation {
  return {
    id,
    cardType: 'pod_issues',
    title: `Recommendation ${id}`,
    reason: 'Test reason',
    priority: 'medium',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// useSnoozedAlerts
// ═══════════════════════════════════════════════════════════════════════════

describe('useSnoozedAlerts', () => {
  const STORAGE_KEY = 'kubestellar-snoozed-alerts'

  beforeEach(() => {
    vi.useFakeTimers()
    localStorageMock.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function importHook() {
    const mod = await import('../useSnoozedAlerts')
    return mod
  }

  it('returns empty state by default', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    expect(result.current.snoozedAlerts).toEqual([])
    expect(result.current.snoozedCount).toBe(0)
  })

  it('snoozes an alert and updates state', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => {
      result.current.snoozeAlert('alert-1', '1h')
    })

    expect(result.current.snoozedAlerts).toHaveLength(1)
    expect(result.current.snoozedAlerts[0].alertId).toBe('alert-1')
    expect(result.current.snoozedAlerts[0].duration).toBe('1h')
    expect(result.current.snoozedCount).toBe(1)
  })

  it('unsnoozes an alert', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => {
      result.current.snoozeAlert('alert-1', '1h')
    })
    expect(result.current.snoozedCount).toBe(1)

    act(() => {
      result.current.unsnoozeAlert('alert-1')
    })
    expect(result.current.snoozedAlerts).toHaveLength(0)
    expect(result.current.snoozedCount).toBe(0)
  })

  it('isSnoozed returns correct status', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    expect(result.current.isSnoozed('alert-1')).toBe(false)

    act(() => {
      result.current.snoozeAlert('alert-1', '1h')
    })
    expect(result.current.isSnoozed('alert-1')).toBe(true)
    expect(result.current.isSnoozed('alert-2')).toBe(false)
  })

  it('persists to localStorage', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => {
      result.current.snoozeAlert('alert-1', '1h')
    })

    const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!)
    expect(stored.snoozed).toHaveLength(1)
    expect(stored.snoozed[0].alertId).toBe('alert-1')
  })

  it('loads persisted state from localStorage on module init', async () => {
    const now = Date.now()
    const futureExpiry = now + 60 * 60 * 1000 // 1 hour from now
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        snoozed: [
          {
            alertId: 'persisted-alert',
            snoozedAt: now,
            expiresAt: futureExpiry,
            duration: '1h',
          },
        ],
      })
    )

    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    expect(result.current.snoozedAlerts).toHaveLength(1)
    expect(result.current.snoozedAlerts[0].alertId).toBe('persisted-alert')
  })

  it('pub/sub: multiple hook instances stay in sync', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result: hook1 } = renderHook(() => useSnoozedAlerts())
    const { result: hook2 } = renderHook(() => useSnoozedAlerts())

    act(() => {
      hook1.current.snoozeAlert('alert-sync', '15m')
    })

    expect(hook2.current.snoozedAlerts).toHaveLength(1)
    expect(hook2.current.snoozedAlerts[0].alertId).toBe('alert-sync')
  })

  it('expired snoozes are filtered out on load', async () => {
    const now = Date.now()
    const pastExpiry = now - 1000 // already expired
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        snoozed: [
          {
            alertId: 'expired-alert',
            snoozedAt: now - 7200000,
            expiresAt: pastExpiry,
            duration: '1h',
          },
        ],
      })
    )

    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    expect(result.current.snoozedAlerts).toHaveLength(0)
  })

  it('isSnoozed returns false for expired alerts still in the array', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => {
      result.current.snoozeAlert('alert-exp', '5m')
    })
    expect(result.current.isSnoozed('alert-exp')).toBe(true)

    // Advance past the 5-minute snooze duration
    const FIVE_MINUTES_MS = 5 * 60 * 1000
    const EXTRA_MS = 1000
    vi.advanceTimersByTime(FIVE_MINUTES_MS + EXTRA_MS)

    expect(result.current.isSnoozed('alert-exp')).toBe(false)
  })

  it('getSnoozedAlert returns the snoozed entry or null', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    expect(result.current.getSnoozedAlert('alert-x')).toBeNull()

    act(() => {
      result.current.snoozeAlert('alert-x', '4h')
    })

    const entry = result.current.getSnoozedAlert('alert-x')
    expect(entry).not.toBeNull()
    expect(entry!.alertId).toBe('alert-x')
    expect(entry!.duration).toBe('4h')
  })

  it('snoozeMultiple snoozes several alerts at once', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => {
      result.current.snoozeMultiple(['a1', 'a2', 'a3'], '15m')
    })

    expect(result.current.snoozedCount).toBe(3)
    expect(result.current.isSnoozed('a1')).toBe(true)
    expect(result.current.isSnoozed('a2')).toBe(true)
    expect(result.current.isSnoozed('a3')).toBe(true)
  })

  it('clearAllSnoozed removes everything', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => {
      result.current.snoozeAlert('a1', '1h')
      result.current.snoozeAlert('a2', '1h')
    })
    expect(result.current.snoozedCount).toBe(2)

    act(() => {
      result.current.clearAllSnoozed()
    })
    expect(result.current.snoozedCount).toBe(0)
    expect(result.current.snoozedAlerts).toEqual([])
  })

  it('getSnoozeRemaining returns milliseconds remaining or null', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    expect(result.current.getSnoozeRemaining('none')).toBeNull()

    act(() => {
      result.current.snoozeAlert('alert-r', '1h')
    })

    const remaining = result.current.getSnoozeRemaining('alert-r')
    expect(remaining).not.toBeNull()
    const ONE_HOUR_MS = 60 * 60 * 1000
    expect(remaining!).toBeLessThanOrEqual(ONE_HOUR_MS)
    expect(remaining!).toBeGreaterThan(0)
  })

  it('re-snoozing an alert replaces the previous entry', async () => {
    const { useSnoozedAlerts } = await importHook()
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => {
      result.current.snoozeAlert('alert-re', '5m')
    })
    expect(result.current.snoozedCount).toBe(1)

    act(() => {
      result.current.snoozeAlert('alert-re', '24h')
    })
    // Should still be 1, not 2
    expect(result.current.snoozedCount).toBe(1)
    expect(result.current.snoozedAlerts[0].duration).toBe('24h')
  })
})

describe('formatSnoozeRemaining', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('formats hours and minutes', async () => {
    const { formatSnoozeRemaining } = await import('../useSnoozedAlerts')
    const TWO_HOURS_30_MIN_MS = 2 * 60 * 60 * 1000 + 30 * 60 * 1000
    expect(formatSnoozeRemaining(TWO_HOURS_30_MIN_MS)).toBe('2h 30m')
  })

  it('formats minutes only when less than 1 hour', async () => {
    const { formatSnoozeRemaining } = await import('../useSnoozedAlerts')
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
    expect(formatSnoozeRemaining(FIFTEEN_MINUTES_MS)).toBe('15m')
  })

  it('returns <1m for very small values', async () => {
    const { formatSnoozeRemaining } = await import('../useSnoozedAlerts')
    expect(formatSnoozeRemaining(500)).toBe('<1m')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useSnoozedCards
// ═══════════════════════════════════════════════════════════════════════════

describe('useSnoozedCards', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function importHook() {
    const mod = await import('../useSnoozedCards')
    return mod
  }

  const swapInput = {
    originalCardId: 'card-1',
    originalCardType: 'pod_issues',
    originalCardTitle: 'Pod Issues',
    newCardType: 'cluster_health',
    newCardTitle: 'Cluster Health',
    reason: 'Better overview',
  }

  it('returns empty state by default', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())

    expect(result.current.snoozedSwaps).toEqual([])
  })

  it('snoozes a card swap', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())

    let returned: unknown
    act(() => {
      returned = result.current.snoozeSwap(swapInput)
    })

    expect(result.current.snoozedSwaps).toHaveLength(1)
    expect(result.current.snoozedSwaps[0].originalCardId).toBe('card-1')
    expect(result.current.snoozedSwaps[0].id).toBeDefined()
    expect(returned).toHaveProperty('id')
  })

  it('unsnoozes a card swap and returns it', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())

    let swapId: string = ''
    act(() => {
      const created = result.current.snoozeSwap(swapInput)
      swapId = created.id
    })
    expect(result.current.snoozedSwaps).toHaveLength(1)

    let returned: unknown
    act(() => {
      returned = result.current.unsnoozeSwap(swapId)
    })
    expect(result.current.snoozedSwaps).toHaveLength(0)
    expect(returned).toHaveProperty('originalCardId', 'card-1')
  })

  it('dismissSwap removes without returning the swap', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())

    let swapId: string = ''
    act(() => {
      const created = result.current.snoozeSwap(swapInput)
      swapId = created.id
    })

    act(() => {
      result.current.dismissSwap(swapId)
    })
    expect(result.current.snoozedSwaps).toHaveLength(0)
  })

  it('pub/sub: multiple hook instances stay in sync', async () => {
    const { useSnoozedCards } = await importHook()
    const { result: hook1 } = renderHook(() => useSnoozedCards())
    const { result: hook2 } = renderHook(() => useSnoozedCards())

    act(() => {
      hook1.current.snoozeSwap(swapInput)
    })

    expect(hook2.current.snoozedSwaps).toHaveLength(1)
    expect(hook2.current.snoozedSwaps[0].originalCardId).toBe('card-1')
  })

  it('getActiveSwaps returns only non-expired swaps', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())

    const ONE_HOUR_MS = 60 * 60 * 1000
    act(() => {
      result.current.snoozeSwap(swapInput, ONE_HOUR_MS)
    })

    // Before expiry — should be active
    expect(result.current.getActiveSwaps()).toHaveLength(1)
    expect(result.current.getExpiredSwaps()).toHaveLength(0)

    // Advance past the 1 hour duration
    const EXTRA_MS = 1000
    vi.advanceTimersByTime(ONE_HOUR_MS + EXTRA_MS)

    // After expiry — should be expired
    expect(result.current.getActiveSwaps()).toHaveLength(0)
    expect(result.current.getExpiredSwaps()).toHaveLength(1)
  })

  it('getExpiredSwaps returns only expired swaps', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())

    const SHORT_DURATION_MS = 1000
    act(() => {
      result.current.snoozeSwap(swapInput, SHORT_DURATION_MS)
    })

    const EXTRA_MS = 100
    vi.advanceTimersByTime(SHORT_DURATION_MS + EXTRA_MS)

    const expired = result.current.getExpiredSwaps()
    expect(expired).toHaveLength(1)
    expect(expired[0].originalCardId).toBe('card-1')
  })
})

describe('formatTimeRemaining (cards)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Expired" for past dates', async () => {
    const { formatTimeRemaining } = await import('../useSnoozedCards')
    const past = new Date(Date.now() - 10000)
    expect(formatTimeRemaining(past)).toBe('Expired')
  })

  it('formats hours and minutes', async () => {
    const { formatTimeRemaining } = await import('../useSnoozedCards')
    const TWO_HOURS_30_MIN_MS = 2 * 60 * 60 * 1000 + 30 * 60 * 1000
    const future = new Date(Date.now() + TWO_HOURS_30_MIN_MS)
    expect(formatTimeRemaining(future)).toBe('2h 30m')
  })

  it('formats days and hours for large durations', async () => {
    const { formatTimeRemaining } = await import('../useSnoozedCards')
    const ONE_DAY_3H_MS = 27 * 60 * 60 * 1000
    const future = new Date(Date.now() + ONE_DAY_3H_MS)
    expect(formatTimeRemaining(future)).toBe('1d 3h')
  })

  it('formats minutes only when less than 1 hour', async () => {
    const { formatTimeRemaining } = await import('../useSnoozedCards')
    const FORTY_FIVE_MINUTES_MS = 45 * 60 * 1000
    const future = new Date(Date.now() + FORTY_FIVE_MINUTES_MS)
    expect(formatTimeRemaining(future)).toBe('45m')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useSnoozedMissions
// ═══════════════════════════════════════════════════════════════════════════

describe('useSnoozedMissions', () => {
  const STORAGE_KEY = 'kubestellar-snoozed-missions'

  beforeEach(() => {
    vi.useFakeTimers()
    localStorageMock.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function importHook() {
    const mod = await import('../useSnoozedMissions')
    return mod
  }

  it('returns empty state by default', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())

    expect(result.current.snoozedMissions).toEqual([])
    expect(result.current.dismissedMissions).toEqual([])
  })

  it('snoozes a mission', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())
    const suggestion = makeMissionSuggestion('m-1')

    act(() => {
      result.current.snoozeMission(suggestion)
    })

    expect(result.current.snoozedMissions).toHaveLength(1)
    expect(result.current.snoozedMissions[0].suggestion.id).toBe('m-1')
  })

  it('returns null when snoozing an already-snoozed mission', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())
    const suggestion = makeMissionSuggestion('m-dup')

    let first: unknown
    let second: unknown
    act(() => {
      first = result.current.snoozeMission(suggestion)
    })
    act(() => {
      second = result.current.snoozeMission(suggestion)
    })

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(result.current.snoozedMissions).toHaveLength(1)
  })

  it('unsnoozes a mission and returns it', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())
    const suggestion = makeMissionSuggestion('m-2')

    let snoozedId: string = ''
    act(() => {
      const created = result.current.snoozeMission(suggestion)
      snoozedId = created!.id
    })
    expect(result.current.snoozedMissions).toHaveLength(1)

    let returned: unknown
    act(() => {
      returned = result.current.unsnoozeMission(snoozedId)
    })
    expect(result.current.snoozedMissions).toHaveLength(0)
    expect(returned).toHaveProperty('suggestion')
  })

  it('isSnoozed returns correct status', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())
    const suggestion = makeMissionSuggestion('m-check')

    expect(result.current.isSnoozed('m-check')).toBe(false)

    act(() => {
      result.current.snoozeMission(suggestion)
    })
    expect(result.current.isSnoozed('m-check')).toBe(true)
  })

  it('persists to localStorage', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())
    const suggestion = makeMissionSuggestion('m-persist')

    act(() => {
      result.current.snoozeMission(suggestion)
    })

    const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!)
    expect(stored.snoozed).toHaveLength(1)
    expect(stored.snoozed[0].suggestion.id).toBe('m-persist')
  })

  it('loads persisted state from localStorage on module init', async () => {
    const now = Date.now()
    const futureExpiry = now + 24 * 60 * 60 * 1000
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        snoozed: [
          {
            id: 'snoozed-loaded',
            suggestion: makeMissionSuggestion('m-loaded'),
            snoozedAt: now,
            expiresAt: futureExpiry,
          },
        ],
        dismissed: ['d-1'],
      })
    )

    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())

    expect(result.current.snoozedMissions).toHaveLength(1)
    expect(result.current.snoozedMissions[0].suggestion.id).toBe('m-loaded')
    expect(result.current.dismissedMissions).toContain('d-1')
  })

  it('pub/sub: multiple hook instances stay in sync', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result: hook1 } = renderHook(() => useSnoozedMissions())
    const { result: hook2 } = renderHook(() => useSnoozedMissions())
    const suggestion = makeMissionSuggestion('m-sync')

    act(() => {
      hook1.current.snoozeMission(suggestion)
    })

    expect(hook2.current.snoozedMissions).toHaveLength(1)
    expect(hook2.current.snoozedMissions[0].suggestion.id).toBe('m-sync')
  })

  it('expired snoozes are filtered out on load', async () => {
    const now = Date.now()
    const pastExpiry = now - 1000
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        snoozed: [
          {
            id: 'snoozed-expired',
            suggestion: makeMissionSuggestion('m-expired'),
            snoozedAt: now - 86400000,
            expiresAt: pastExpiry,
          },
        ],
        dismissed: [],
      })
    )

    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())

    expect(result.current.snoozedMissions).toHaveLength(0)
  })

  it('isSnoozed returns false after snooze expires', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())
    const suggestion = makeMissionSuggestion('m-expire-check')

    const SHORT_SNOOZE_MS = 5000
    act(() => {
      result.current.snoozeMission(suggestion, SHORT_SNOOZE_MS)
    })
    expect(result.current.isSnoozed('m-expire-check')).toBe(true)

    const EXTRA_MS = 1000
    vi.advanceTimersByTime(SHORT_SNOOZE_MS + EXTRA_MS)

    expect(result.current.isSnoozed('m-expire-check')).toBe(false)
  })

  it('dismissMission adds to dismissed list', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())

    act(() => {
      result.current.dismissMission('m-dismiss')
    })

    expect(result.current.isDismissed('m-dismiss')).toBe(true)
    expect(result.current.dismissedMissions).toContain('m-dismiss')
  })

  it('undismissMission removes from dismissed list', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())

    act(() => {
      result.current.dismissMission('m-undismiss')
    })
    expect(result.current.isDismissed('m-undismiss')).toBe(true)

    act(() => {
      result.current.undismissMission('m-undismiss')
    })
    expect(result.current.isDismissed('m-undismiss')).toBe(false)
  })

  it('clearAllSnoozed removes all snoozed but not dismissed', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())

    act(() => {
      result.current.snoozeMission(makeMissionSuggestion('m-c1'))
      result.current.snoozeMission(makeMissionSuggestion('m-c2'))
      result.current.dismissMission('m-d1')
    })

    act(() => {
      result.current.clearAllSnoozed()
    })

    expect(result.current.snoozedMissions).toEqual([])
    expect(result.current.isDismissed('m-d1')).toBe(true)
  })

  it('clearAllDismissed removes all dismissed', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())

    act(() => {
      result.current.dismissMission('d1')
      result.current.dismissMission('d2')
    })
    expect(result.current.dismissedMissions).toHaveLength(2)

    act(() => {
      result.current.clearAllDismissed()
    })
    expect(result.current.dismissedMissions).toHaveLength(0)
  })

  it('getSnoozeRemaining returns time left or null', async () => {
    const { useSnoozedMissions } = await importHook()
    const { result } = renderHook(() => useSnoozedMissions())

    expect(result.current.getSnoozeRemaining('nonexistent')).toBeNull()

    act(() => {
      result.current.snoozeMission(makeMissionSuggestion('m-remaining'))
    })

    const remaining = result.current.getSnoozeRemaining('m-remaining')
    expect(remaining).not.toBeNull()
    expect(remaining!).toBeGreaterThan(0)
  })
})

describe('formatTimeRemaining (missions)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('formats hours and minutes', async () => {
    const { formatTimeRemaining } = await import('../useSnoozedMissions')
    const TWO_HOURS_15_MIN_MS = 2 * 60 * 60 * 1000 + 15 * 60 * 1000
    expect(formatTimeRemaining(TWO_HOURS_15_MIN_MS)).toBe('2h 15m')
  })

  it('formats minutes only when less than 1 hour', async () => {
    const { formatTimeRemaining } = await import('../useSnoozedMissions')
    const TEN_MINUTES_MS = 10 * 60 * 1000
    expect(formatTimeRemaining(TEN_MINUTES_MS)).toBe('10m')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useSnoozedRecommendations
// ═══════════════════════════════════════════════════════════════════════════

describe('useSnoozedRecommendations', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function importHook() {
    const mod = await import('../useSnoozedRecommendations')
    return mod
  }

  it('returns empty state by default', async () => {
    const { useSnoozedRecommendations } = await importHook()
    const { result } = renderHook(() => useSnoozedRecommendations())

    expect(result.current.snoozedRecommendations).toEqual([])
  })

  it('snoozes a recommendation', async () => {
    const { useSnoozedRecommendations } = await importHook()
    const { result } = renderHook(() => useSnoozedRecommendations())
    const rec = makeCardRecommendation('rec-1')

    act(() => {
      result.current.snoozeRecommendation(rec)
    })

    expect(result.current.snoozedRecommendations).toHaveLength(1)
    expect(result.current.snoozedRecommendations[0].recommendation.id).toBe('rec-1')
  })

  it('returns null when snoozing an already-snoozed recommendation', async () => {
    const { useSnoozedRecommendations } = await importHook()
    const { result } = renderHook(() => useSnoozedRecommendations())
    const rec = makeCardRecommendation('rec-dup')

    let first: unknown
    let second: unknown
    act(() => {
      first = result.current.snoozeRecommendation(rec)
    })
    act(() => {
      second = result.current.snoozeRecommendation(rec)
    })

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(result.current.snoozedRecommendations).toHaveLength(1)
  })

  it('unsnoozes a recommendation (unsnooozeRecommendation)', async () => {
    const { useSnoozedRecommendations } = await importHook()
    const { result } = renderHook(() => useSnoozedRecommendations())
    const rec = makeCardRecommendation('rec-2')

    let snoozedId: string = ''
    act(() => {
      const created = result.current.snoozeRecommendation(rec)
      snoozedId = created!.id
    })
    expect(result.current.snoozedRecommendations).toHaveLength(1)

    let returned: unknown
    act(() => {
      returned = result.current.unsnooozeRecommendation(snoozedId)
    })
    expect(result.current.snoozedRecommendations).toHaveLength(0)
    expect(returned).toHaveProperty('recommendation')
  })

  it('isSnoozed returns correct status', async () => {
    const { useSnoozedRecommendations } = await importHook()
    const { result } = renderHook(() => useSnoozedRecommendations())
    const rec = makeCardRecommendation('rec-check')

    expect(result.current.isSnoozed('rec-check')).toBe(false)

    act(() => {
      result.current.snoozeRecommendation(rec)
    })
    expect(result.current.isSnoozed('rec-check')).toBe(true)
    expect(result.current.isSnoozed('rec-other')).toBe(false)
  })

  it('pub/sub: multiple hook instances stay in sync', async () => {
    const { useSnoozedRecommendations } = await importHook()
    const { result: hook1 } = renderHook(() => useSnoozedRecommendations())
    const { result: hook2 } = renderHook(() => useSnoozedRecommendations())
    const rec = makeCardRecommendation('rec-sync')

    act(() => {
      hook1.current.snoozeRecommendation(rec)
    })

    expect(hook2.current.snoozedRecommendations).toHaveLength(1)
    expect(hook2.current.snoozedRecommendations[0].recommendation.id).toBe('rec-sync')
  })

  it('dismissSnoozedRecommendation removes from snoozed list', async () => {
    const { useSnoozedRecommendations } = await importHook()
    const { result } = renderHook(() => useSnoozedRecommendations())
    const rec = makeCardRecommendation('rec-dismiss')

    let snoozedId: string = ''
    act(() => {
      const created = result.current.snoozeRecommendation(rec)
      snoozedId = created!.id
    })

    act(() => {
      result.current.dismissSnoozedRecommendation(snoozedId)
    })
    expect(result.current.snoozedRecommendations).toHaveLength(0)
  })

  it('dismissRecommendation tracks dismissed IDs', async () => {
    const { useSnoozedRecommendations } = await importHook()
    const { result } = renderHook(() => useSnoozedRecommendations())

    expect(result.current.isDismissed('rec-perm')).toBe(false)

    act(() => {
      result.current.dismissRecommendation('rec-perm')
    })
    expect(result.current.isDismissed('rec-perm')).toBe(true)
  })

  // useSnoozedRecommendations has NO expiration logic — snoozes persist
  // indefinitely until manually unsnoozed or dismissed. This test confirms
  // that behavior.
  it('has no automatic expiration (snooze persists indefinitely)', async () => {
    vi.useFakeTimers()
    const { useSnoozedRecommendations } = await importHook()
    const { result } = renderHook(() => useSnoozedRecommendations())
    const rec = makeCardRecommendation('rec-forever')

    act(() => {
      result.current.snoozeRecommendation(rec)
    })

    // Advance time by 7 days
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
    vi.advanceTimersByTime(SEVEN_DAYS_MS)

    // Still snoozed
    expect(result.current.isSnoozed('rec-forever')).toBe(true)
    expect(result.current.snoozedRecommendations).toHaveLength(1)
    vi.useRealTimers()
  })

  // useSnoozedRecommendations is in-memory only — no localStorage
  it('does not use localStorage (in-memory only)', async () => {
    localStorageMock.clear()
    const callsBefore = localStorageMock.setItem.mock.calls.length

    const { useSnoozedRecommendations } = await importHook()
    const { result } = renderHook(() => useSnoozedRecommendations())

    act(() => {
      result.current.snoozeRecommendation(makeCardRecommendation('rec-mem'))
    })

    // No new localStorage.setItem calls from this hook
    expect(localStorageMock.setItem.mock.calls.length).toBe(callsBefore)
  })
})

describe('formatElapsedTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "now" for very recent dates', async () => {
    const { formatElapsedTime } = await import('../useSnoozedRecommendations')
    const recent = new Date(Date.now() - 10000) // 10 seconds ago
    expect(formatElapsedTime(recent)).toBe('now')
  })

  it('formats minutes', async () => {
    const { formatElapsedTime } = await import('../useSnoozedRecommendations')
    const THIRTY_MINUTES_MS = 30 * 60 * 1000
    const past = new Date(Date.now() - THIRTY_MINUTES_MS)
    expect(formatElapsedTime(past)).toBe('30m')
  })

  it('formats hours', async () => {
    const { formatElapsedTime } = await import('../useSnoozedRecommendations')
    const THREE_HOURS_MS = 3 * 60 * 60 * 1000
    const past = new Date(Date.now() - THREE_HOURS_MS)
    expect(formatElapsedTime(past)).toBe('3h')
  })

  it('formats days', async () => {
    const { formatElapsedTime } = await import('../useSnoozedRecommendations')
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
    const past = new Date(Date.now() - THREE_DAYS_MS)
    expect(formatElapsedTime(past)).toBe('3 days')
  })

  it('returns "1 day" for singular', async () => {
    const { formatElapsedTime } = await import('../useSnoozedRecommendations')
    const ONE_DAY_MS = 24 * 60 * 60 * 1000
    const past = new Date(Date.now() - ONE_DAY_MS)
    expect(formatElapsedTime(past)).toBe('1 day')
  })
})
