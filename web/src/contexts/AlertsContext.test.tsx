import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { AlertsProvider, useAlertsContext } from './AlertsContext'
import type { Alert } from '../types/alerts'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./AlertsDataFetcher', () => ({
  default: () => null,
}))

vi.mock('../hooks/useMissions', () => ({
  useMissions: vi.fn(() => ({ startMission: vi.fn(() => 'mock-mission-id') })),
}))

vi.mock('../hooks/useDemoMode', () => ({
  useDemoMode: vi.fn(() => ({ isDemoMode: false })),
}))

vi.mock('../hooks/useDeepLink', () => ({
  sendNotificationWithDeepLink: vi.fn(),
}))

// Stub browser APIs that AlertsProvider touches on mount
vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

// ── Helpers ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AlertsProvider>{children}</AlertsProvider>
)

/** Build a minimal Alert object for seeding localStorage. */
function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: overrides.id ?? `alert-${Math.random().toString(36).slice(2)}`,
    ruleId: overrides.ruleId ?? 'rule-1',
    ruleName: overrides.ruleName ?? 'Test Rule',
    severity: overrides.severity ?? 'warning',
    status: overrides.status ?? 'firing',
    message: overrides.message ?? 'Test alert message',
    details: overrides.details ?? {},
    firedAt: overrides.firedAt ?? new Date().toISOString(),
    resolvedAt: overrides.resolvedAt,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

// ── Quota / pruning ───────────────────────────────────────────────────────────

describe('localStorage quota handling', () => {
  it('prunes resolved alerts but preserves firing alerts on QuotaExceededError', () => {
    // Seed a mix of firing and resolved alerts
    const firing1 = makeAlert({ id: 'firing-1', status: 'firing' })
    const firing2 = makeAlert({ id: 'firing-2', status: 'firing' })
    const resolved1 = makeAlert({ id: 'resolved-1', status: 'resolved', resolvedAt: '2024-01-01T00:00:00Z' })
    const resolved2 = makeAlert({ id: 'resolved-2', status: 'resolved', resolvedAt: '2025-01-01T00:00:00Z' })

    localStorage.setItem('kc_alerts', JSON.stringify([firing1, firing2, resolved1, resolved2]))

    // Intercept setItem: throw QuotaExceededError on the first kc_alerts write
    // (the save triggered by the useEffect on mount), then allow the retry.
    let alertWriteCount = 0
    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts') {
        alertWriteCount++
        if (alertWriteCount === 1) {
          throw new DOMException('quota exceeded', 'QuotaExceededError')
        }
      }
      return realSetItem(key, value)
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Mount — loadFromStorage() then saveAlerts() via useEffect
    renderHook(() => useAlertsContext(), { wrapper })

    // The pruning path must have retried
    expect(alertWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Alerts] localStorage quota exceeded, pruning resolved alerts')

    // Verify pruned data was saved (second write succeeded)
    const stored = JSON.parse(localStorage.getItem('kc_alerts')!)
    // Firing alerts must still be present
    expect(stored.some((a: { id: string }) => a.id === 'firing-1')).toBe(true)
    expect(stored.some((a: { id: string }) => a.id === 'firing-2')).toBe(true)

    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })

  it('detects QuotaExceededError via legacy numeric code 22', () => {
    const resolved1 = makeAlert({ id: 'r1', status: 'resolved' })
    localStorage.setItem('kc_alerts', JSON.stringify([resolved1]))

    let alertWriteCount = 0
    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts') {
        alertWriteCount++
        if (alertWriteCount === 1) {
          // Simulate legacy code-22 DOMException (no named exception)
          const err = new DOMException('quota exceeded')
          Object.defineProperty(err, 'code', { value: 22 })
          Object.defineProperty(err, 'name', { value: '' })
          throw err
        }
      }
      return realSetItem(key, value)
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useAlertsContext(), { wrapper })

    // The pruning branch should have fired (retry = alertWriteCount >= 2)
    expect(alertWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Alerts] localStorage quota exceeded, pruning resolved alerts')

    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })

  it('logs the error and clears storage when pruning still exceeds quota', () => {
    const firing1 = makeAlert({ id: 'f1', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([firing1]))

    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts') {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return realSetItem(key, value)
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useAlertsContext(), { wrapper })

    // Should log the inner retry error (not silently swallow it)
    expect(errorSpy).toHaveBeenCalledWith(
      '[Alerts] localStorage still full after pruning, clearing alerts',
      expect.any(DOMException),
    )

    // Storage should have been cleared as a last resort
    expect(localStorage.getItem('kc_alerts')).toBeNull()

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})

// ── MAX_ALERTS cap ────────────────────────────────────────────────────────────

describe('MAX_ALERTS cap', () => {
  it('caps alerts to at most 500 in localStorage on mount when pre-loaded with more', () => {
    // Pre-populate localStorage with 550 alerts (300 firing, 250 resolved)
    const tooManyAlerts: Alert[] = [
      ...Array.from({ length: 300 }, (_, i) =>
        makeAlert({ id: `firing-${i}`, status: 'firing' })
      ),
      ...Array.from({ length: 250 }, (_, i) =>
        makeAlert({ id: `resolved-${i}`, status: 'resolved', resolvedAt: new Date(Date.now() - i * 1000).toISOString() })
      ),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(tooManyAlerts))

    renderHook(() => useAlertsContext(), { wrapper })

    const stored: Alert[] = JSON.parse(localStorage.getItem('kc_alerts') ?? '[]')
    expect(stored.length).toBeLessThanOrEqual(500)
    // All firing alerts must be retained (there are only 300, well within the cap)
    const storedFiring = stored.filter(a => a.status === 'firing')
    expect(storedFiring.length).toBe(300)
  })

  it('keeps resolved alerts sorted by recency when trimming', () => {
    // Create 520 alerts: 300 firing + 220 resolved with distinct timestamps
    const firingAlerts: Alert[] = Array.from({ length: 300 }, (_, i) =>
      makeAlert({ id: `f-${i}`, status: 'firing' })
    )
    // Resolved alerts with timestamps spanning the last 220 seconds
    const resolvedAlerts: Alert[] = Array.from({ length: 220 }, (_, i) =>
      makeAlert({
        id: `r-${i}`,
        status: 'resolved',
        resolvedAt: new Date(Date.now() - i * 1000).toISOString(),
      })
    )
    localStorage.setItem('kc_alerts', JSON.stringify([...firingAlerts, ...resolvedAlerts]))

    renderHook(() => useAlertsContext(), { wrapper })

    const stored: Alert[] = JSON.parse(localStorage.getItem('kc_alerts') ?? '[]')
    expect(stored.length).toBeLessThanOrEqual(500)

    // The resolved alerts that remain should be the most recent ones (r-0 through r-N)
    // None of the oldest resolved ones (r-219 or close to it) should survive the trim
    const storedResolved = stored.filter(a => a.status === 'resolved')
    expect(storedResolved.length).toBeLessThanOrEqual(200) // 500 cap minus 300 firing
    const storedResolvedIds = new Set(storedResolved.map(a => a.id))
    // r-0 is the most recent resolved — must survive
    expect(storedResolvedIds.has('r-0')).toBe(true)
    // r-219 is the oldest resolved — must be evicted
    expect(storedResolvedIds.has('r-219')).toBe(false)
  })
})
