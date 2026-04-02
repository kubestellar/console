import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — set up before any import of the hook
// ---------------------------------------------------------------------------

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetJSON: vi.fn(() => null),
  safeSetJSON: vi.fn(),
}))

vi.mock('../../lib/constants/storage', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_VISIT_STREAK: 'kc-visit-streak',
  }
})
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_VISIT_STREAK: 'kc-visit-streak',
} })

vi.mock('../../lib/analytics', () => ({
  emitStreakDay: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD in the user's local timezone (matches hook) */
function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * The hook parses stored YYYY-MM-DD dates with `new Date(str)`, which
 * treats bare YYYY-MM-DD as UTC midnight. In negative UTC offset
 * timezones, `.getDate()` on the result returns the previous calendar
 * day. This helper produces a date string that, when round-tripped
 * through the hook's parsing logic (`new Date(str).getDate()`), yields
 * a local date exactly N calendar days before today.
 *
 * We append 'T00:00:00' to force the Date constructor to treat the
 * string as local time, matching the intended semantics.
 */
function dateStringThatHookReadsAsNDaysAgo(n: number): string {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n)
  return toDateStr(target) + 'T00:00:00'
}

interface FreshModules {
  useVisitStreak: () => { streak: number }
  safeGetJSON: ReturnType<typeof vi.fn>
  safeSetJSON: ReturnType<typeof vi.fn>
  emitStreakDay: ReturnType<typeof vi.fn>
}

/**
 * Because calculateStreak runs inside a useState initializer, we must:
 * 1. vi.resetModules() to clear cached module instances
 * 2. Import and configure the localStorage mock BEFORE importing the hook
 * 3. Import the hook (which binds to the configured mocks)
 */
async function importFreshWithData(storedValue: unknown): Promise<FreshModules> {
  vi.resetModules()

  // Step 1: Import mocked dependencies first and configure them
  const [localStorageMod, analyticsMod] = await Promise.all([
    import('../../lib/utils/localStorage'),
    import('../../lib/analytics'),
  ])

  const safeGetJSON = localStorageMod.safeGetJSON as ReturnType<typeof vi.fn>
  const safeSetJSON = localStorageMod.safeSetJSON as ReturnType<typeof vi.fn>
  const emitStreakDay = analyticsMod.emitStreakDay as ReturnType<typeof vi.fn>

  // Step 2: Clear previous call history and configure return values
  safeGetJSON.mockClear()
  safeSetJSON.mockClear()
  emitStreakDay.mockClear()
  safeGetJSON.mockReturnValue(storedValue)

  // Step 3: Now import the hook (it will call safeGetJSON during useState init)
  const hookMod = await import('../useVisitStreak')

  return {
    useVisitStreak: hookMod.useVisitStreak,
    safeGetJSON,
    safeSetJSON,
    emitStreakDay,
  }
}

describe('useVisitStreak', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // 1. First-ever visit — streak starts at 1
  // -----------------------------------------------------------------------
  it('returns streak of 1 on first-ever visit (no stored data)', async () => {
    const { useVisitStreak } = await importFreshWithData(null)
    const { result } = renderHook(() => useVisitStreak())

    expect(result.current.streak).toBe(1)
  })

  // -----------------------------------------------------------------------
  // 2. Persists first visit to storage
  // -----------------------------------------------------------------------
  it('persists streak data to localStorage on first visit', async () => {
    const { useVisitStreak, safeSetJSON } = await importFreshWithData(null)
    renderHook(() => useVisitStreak())

    const today = toDateStr(new Date())
    expect(safeSetJSON).toHaveBeenCalledWith('kc-visit-streak', {
      lastVisitDate: today,
      currentStreak: 1,
    })
  })

  // -----------------------------------------------------------------------
  // 3. Same-day visit — streak unchanged
  // -----------------------------------------------------------------------
  it('returns the existing streak on a same-day revisit', async () => {
    const today = toDateStr(new Date())
    const { useVisitStreak, safeSetJSON } = await importFreshWithData({
      lastVisitDate: today,
      currentStreak: 5,
    })
    const { result } = renderHook(() => useVisitStreak())

    expect(result.current.streak).toBe(5)
    // Should NOT write to storage on same-day revisit (early return)
    expect(safeSetJSON).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 4. Consecutive day — streak increments
  // -----------------------------------------------------------------------
  it('increments streak when last visit was yesterday', async () => {
    const yesterday = dateStringThatHookReadsAsNDaysAgo(1)
    const { useVisitStreak } = await importFreshWithData({
      lastVisitDate: yesterday,
      currentStreak: 3,
    })
    const { result } = renderHook(() => useVisitStreak())

    expect(result.current.streak).toBe(4)
  })

  // -----------------------------------------------------------------------
  // 5. Streak increments — persists new value
  // -----------------------------------------------------------------------
  it('persists the incremented streak to localStorage', async () => {
    const yesterday = dateStringThatHookReadsAsNDaysAgo(1)
    const { useVisitStreak, safeSetJSON } = await importFreshWithData({
      lastVisitDate: yesterday,
      currentStreak: 3,
    })
    renderHook(() => useVisitStreak())

    const today = toDateStr(new Date())
    expect(safeSetJSON).toHaveBeenCalledWith('kc-visit-streak', {
      lastVisitDate: today,
      currentStreak: 4,
    })
  })

  // -----------------------------------------------------------------------
  // 6. Streak resets after a gap of 2+ days
  // -----------------------------------------------------------------------
  it('resets streak to 1 when last visit was 2 days ago', async () => {
    const twoDaysAgo = dateStringThatHookReadsAsNDaysAgo(2)
    const { useVisitStreak } = await importFreshWithData({
      lastVisitDate: twoDaysAgo,
      currentStreak: 10,
    })
    const { result } = renderHook(() => useVisitStreak())

    expect(result.current.streak).toBe(1)
  })

  // -----------------------------------------------------------------------
  // 7. Streak resets after a long gap
  // -----------------------------------------------------------------------
  it('resets streak to 1 when last visit was 30 days ago', async () => {
    const thirtyDaysAgo = dateStringThatHookReadsAsNDaysAgo(30)
    const { useVisitStreak } = await importFreshWithData({
      lastVisitDate: thirtyDaysAgo,
      currentStreak: 99,
    })
    const { result } = renderHook(() => useVisitStreak())

    expect(result.current.streak).toBe(1)
  })

  // -----------------------------------------------------------------------
  // 8. GA4 event fires on streak increment (yesterday -> today)
  // -----------------------------------------------------------------------
  it('emits GA4 streak event when streak increments', async () => {
    const yesterday = dateStringThatHookReadsAsNDaysAgo(1)
    const { useVisitStreak, emitStreakDay } = await importFreshWithData({
      lastVisitDate: yesterday,
      currentStreak: 6,
    })
    renderHook(() => useVisitStreak())

    expect(emitStreakDay).toHaveBeenCalledTimes(1)
    expect(emitStreakDay).toHaveBeenCalledWith(7)
  })

  // -----------------------------------------------------------------------
  // 9. GA4 event does NOT fire on streak reset
  // -----------------------------------------------------------------------
  it('does not emit GA4 event when streak resets', async () => {
    const twoDaysAgo = dateStringThatHookReadsAsNDaysAgo(2)
    const { useVisitStreak, emitStreakDay } = await importFreshWithData({
      lastVisitDate: twoDaysAgo,
      currentStreak: 5,
    })
    renderHook(() => useVisitStreak())

    expect(emitStreakDay).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 10. GA4 event does NOT fire on same-day revisit
  // -----------------------------------------------------------------------
  it('does not emit GA4 event on same-day revisit', async () => {
    const today = toDateStr(new Date())
    const { useVisitStreak, emitStreakDay } = await importFreshWithData({
      lastVisitDate: today,
      currentStreak: 3,
    })
    renderHook(() => useVisitStreak())

    expect(emitStreakDay).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 11. GA4 event does NOT fire on first-ever visit
  // -----------------------------------------------------------------------
  it('does not emit GA4 event on first-ever visit', async () => {
    const { useVisitStreak, emitStreakDay } = await importFreshWithData(null)
    renderHook(() => useVisitStreak())

    expect(emitStreakDay).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 12. Handles corrupt / partial stored data gracefully
  // -----------------------------------------------------------------------
  it('treats missing lastVisitDate as first visit (streak = 1)', async () => {
    const { useVisitStreak } = await importFreshWithData({
      currentStreak: 5,
      // lastVisitDate is missing
    })
    const { result } = renderHook(() => useVisitStreak())

    expect(result.current.streak).toBe(1)
  })

  // -----------------------------------------------------------------------
  // 13. Return type shape
  // -----------------------------------------------------------------------
  it('returns an object with a numeric streak property', async () => {
    const { useVisitStreak } = await importFreshWithData(null)
    const { result } = renderHook(() => useVisitStreak())

    expect(result.current).toHaveProperty('streak')
    expect(typeof result.current.streak).toBe('number')
  })
})
