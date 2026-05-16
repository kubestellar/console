/**
 * Tests for contexts/alertStorage.ts
 *
 * Covers: loadNotifiedAlertKeys, saveNotifiedAlertKeys, loadFromStorage,
 * saveToStorage, saveAlerts — including quota-exceeded handling, stale
 * entry pruning, and hard-cap enforcement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock safeLocalStorage before importing the module under test
vi.mock('../../lib/safeLocalStorage', () => ({
  safeGet: vi.fn(),
  safeSet: vi.fn(),
  safeRemove: vi.fn(),
  safeGetJSON: vi.fn((_key: string, fallback: unknown) => fallback),
}))

import {
  loadNotifiedAlertKeys,
  saveNotifiedAlertKeys,
  loadFromStorage,
  saveToStorage,
  saveAlerts,
  ALERTS_KEY,
  MAX_ALERTS,
  MAX_RESOLVED_ALERTS_AFTER_PRUNE,
  NOTIFICATION_DEDUP_MAX_AGE_MS,
  MAX_DEDUP_KEYS,
  NOTIFICATION_COOLDOWN_BY_SEVERITY,
  DEFAULT_NOTIFICATION_COOLDOWN_MS,
  DEFAULT_TEMPERATURE_THRESHOLD_F,
  DEFAULT_WIND_SPEED_THRESHOLD_MPH,
} from '../alertStorage'
import { safeGet, safeSet, safeRemove, safeGetJSON } from '../../lib/safeLocalStorage'
import type { Alert } from '../../types/alerts'

// Type helpers for mocked functions
const mockSafeGet = safeGet as ReturnType<typeof vi.fn>
const mockSafeSet = safeSet as ReturnType<typeof vi.fn>
const mockSafeRemove = safeRemove as ReturnType<typeof vi.fn>
const mockSafeGetJSON = safeGetJSON as ReturnType<typeof vi.fn>

/** Create a minimal Alert object for testing */
function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    ruleName: 'test-rule',
    severity: 'warning',
    message: 'Test alert',
    status: 'firing',
    firedAt: new Date().toISOString(),
    ...overrides,
  } as Alert
}

// Store the real localStorage for mocking
let mockLocalStorage: Record<string, string> = {}

beforeEach(() => {
  vi.clearAllMocks()
  mockLocalStorage = {}

  // Mock localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key]
      }),
      clear: vi.fn(() => {
        mockLocalStorage = {}
      }),
      get length() {
        return Object.keys(mockLocalStorage).length
      },
      key: vi.fn((i: number) => Object.keys(mockLocalStorage)[i] ?? null),
    },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// =============================================================================
// Constants
// =============================================================================

describe('alertStorage constants', () => {
  it('exports expected constant values', () => {
    expect(ALERTS_KEY).toBe('kc_alerts')
    expect(MAX_ALERTS).toBe(500)
    expect(MAX_RESOLVED_ALERTS_AFTER_PRUNE).toBe(50)
    expect(DEFAULT_TEMPERATURE_THRESHOLD_F).toBe(100)
    expect(DEFAULT_WIND_SPEED_THRESHOLD_MPH).toBe(40)
  })

  it('defines severity-tiered notification cooldowns', () => {
    expect(NOTIFICATION_COOLDOWN_BY_SEVERITY.critical).toBeLessThan(
      NOTIFICATION_COOLDOWN_BY_SEVERITY.warning
    )
    expect(NOTIFICATION_COOLDOWN_BY_SEVERITY.warning).toBeLessThan(
      NOTIFICATION_COOLDOWN_BY_SEVERITY.info
    )
  })

  it('DEFAULT_NOTIFICATION_COOLDOWN_MS matches warning cooldown', () => {
    expect(DEFAULT_NOTIFICATION_COOLDOWN_MS).toBe(
      NOTIFICATION_COOLDOWN_BY_SEVERITY.warning
    )
  })

  it('NOTIFICATION_DEDUP_MAX_AGE_MS is 30 days', () => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    expect(NOTIFICATION_DEDUP_MAX_AGE_MS).toBe(THIRTY_DAYS_MS)
  })
})

// =============================================================================
// loadNotifiedAlertKeys
// =============================================================================

describe('loadNotifiedAlertKeys', () => {
  it('returns empty Map when no stored data', () => {
    mockSafeGet.mockReturnValue(null)
    const result = loadNotifiedAlertKeys()
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('loads and returns stored entries', () => {
    const now = Date.now()
    const entries: [string, number][] = [
      ['alert-key-1', now - 1000],
      ['alert-key-2', now - 2000],
    ]
    mockSafeGet.mockReturnValue(JSON.stringify(entries))
    const result = loadNotifiedAlertKeys()
    expect(result.size).toBe(2)
    expect(result.get('alert-key-1')).toBe(now - 1000)
    expect(result.get('alert-key-2')).toBe(now - 2000)
  })

  it('prunes stale entries older than NOTIFICATION_DEDUP_MAX_AGE_MS', () => {
    const now = Date.now()
    const entries: [string, number][] = [
      ['fresh', now - 1000],
      ['stale', now - NOTIFICATION_DEDUP_MAX_AGE_MS - 1],
    ]
    mockSafeGet.mockReturnValue(JSON.stringify(entries))
    const result = loadNotifiedAlertKeys()
    expect(result.size).toBe(1)
    expect(result.has('fresh')).toBe(true)
    expect(result.has('stale')).toBe(false)
    // Should persist cleaned map back
    expect(mockSafeSet).toHaveBeenCalledOnce()
  })

  it('does not re-save when no entries are pruned', () => {
    const now = Date.now()
    const entries: [string, number][] = [['fresh', now - 1000]]
    mockSafeGet.mockReturnValue(JSON.stringify(entries))
    loadNotifiedAlertKeys()
    expect(mockSafeSet).not.toHaveBeenCalled()
  })

  it('returns empty Map on corrupt JSON', () => {
    mockSafeGet.mockReturnValue('not-valid-json{{{')
    const result = loadNotifiedAlertKeys()
    expect(result.size).toBe(0)
  })

  it('returns empty Map when stored value is not an array', () => {
    mockSafeGet.mockReturnValue(JSON.stringify({ corrupted: true }))
    const result = loadNotifiedAlertKeys()
    expect(result.size).toBe(0)
  })

  it('returns empty Map when stored value is a json string', () => {
    mockSafeGet.mockReturnValue(JSON.stringify('a-string'))
    const result = loadNotifiedAlertKeys()
    expect(result.size).toBe(0)
  })

  it('skips entries that are not [string, number] tuples', () => {
    mockSafeGet.mockReturnValue(JSON.stringify([{}, 123, 'string', null]))
    const result = loadNotifiedAlertKeys()
    expect(result.size).toBe(0)
  })

  it('keeps valid entries while skipping invalid ones in the same array', () => {
    const now = Date.now()
    mockSafeGet.mockReturnValue(JSON.stringify([
      ['valid-1', now - 100],
      {},
      ['valid-2', now - 200],
      'corrupted',
      [42, now],
      ['no-timestamp', 'not-a-number'],
    ]))
    const result = loadNotifiedAlertKeys()
    expect(result.size).toBe(2)
    expect(result.has('valid-1')).toBe(true)
    expect(result.has('valid-2')).toBe(true)
    expect(mockSafeSet).toHaveBeenCalledOnce()
  })

  it('enforces MAX_DEDUP_KEYS hard cap by keeping newest entries', () => {
    const now = Date.now()
    const entries = Array.from({ length: MAX_DEDUP_KEYS + 10 }, (_, i) => [
      `k-${i}`,
      now - i,
    ] as [string, number])
    mockSafeGet.mockReturnValue(JSON.stringify(entries))

    const result = loadNotifiedAlertKeys()

    expect(result.size).toBe(MAX_DEDUP_KEYS)
    expect(result.has('k-0')).toBe(true)
    expect(result.has(`k-${MAX_DEDUP_KEYS + 9}`)).toBe(false)
    expect(mockSafeSet).toHaveBeenCalledOnce()
  })
})

// =============================================================================
// saveNotifiedAlertKeys
// =============================================================================

describe('saveNotifiedAlertKeys', () => {
  it('saves entries to localStorage', () => {
    const now = Date.now()
    const keys = new Map<string, number>([
      ['key1', now - 100],
      ['key2', now - 200],
    ])
    saveNotifiedAlertKeys(keys)
    expect(mockSafeSet).toHaveBeenCalledOnce()
    const saved = JSON.parse(mockSafeSet.mock.calls[0][1])
    expect(saved).toHaveLength(2)
  })

  it('prunes stale entries before saving', () => {
    const now = Date.now()
    const keys = new Map<string, number>([
      ['fresh', now - 1000],
      ['stale', now - NOTIFICATION_DEDUP_MAX_AGE_MS - 1],
    ])
    saveNotifiedAlertKeys(keys)
    // Stale key should be deleted from the original map
    expect(keys.has('stale')).toBe(false)
    expect(keys.has('fresh')).toBe(true)
    const saved = JSON.parse(mockSafeSet.mock.calls[0][1])
    expect(saved).toHaveLength(1)
  })

  it('handles empty map', () => {
    const keys = new Map<string, number>()
    saveNotifiedAlertKeys(keys)
    expect(mockSafeSet).toHaveBeenCalledWith(
      expect.any(String),
      '[]'
    )
  })

  it('evicts oldest keys when map exceeds MAX_DEDUP_KEYS', () => {
    const now = Date.now()
    const keys = new Map<string, number>()
    for (let i = 0; i < MAX_DEDUP_KEYS + 7; i++) {
      keys.set(`key-${i}`, now - i)
    }

    saveNotifiedAlertKeys(keys)

    expect(keys.size).toBe(MAX_DEDUP_KEYS)
    expect(keys.has('key-0')).toBe(true)
    expect(keys.has(`key-${MAX_DEDUP_KEYS + 6}`)).toBe(false)
  })

  it('silently handles localStorage errors', () => {
    mockSafeSet.mockImplementation(() => {
      throw new Error('localStorage unavailable')
    })
    const keys = new Map<string, number>([['key1', Date.now()]])
    // Should not throw
    expect(() => saveNotifiedAlertKeys(keys)).not.toThrow()
  })
})

// =============================================================================
// loadFromStorage
// =============================================================================

describe('loadFromStorage', () => {
  it('delegates to safeGetJSON with key and default', () => {
    mockSafeGetJSON.mockReturnValue([1, 2, 3])
    const result = loadFromStorage('my-key', [])
    expect(mockSafeGetJSON).toHaveBeenCalledWith('my-key', [])
    expect(result).toEqual([1, 2, 3])
  })

  it('returns default value when key is missing', () => {
    mockSafeGetJSON.mockReturnValue('default-val')
    const result = loadFromStorage('missing', 'default-val')
    expect(result).toBe('default-val')
  })
})

// =============================================================================
// saveToStorage
// =============================================================================

describe('saveToStorage', () => {
  it('writes JSON-stringified value to localStorage', () => {
    saveToStorage('my-key', { a: 1 })
    expect(localStorage.setItem).toHaveBeenCalledWith('my-key', '{"a":1}')
  })

  it('handles arrays', () => {
    saveToStorage('arr', [1, 2, 3])
    expect(localStorage.setItem).toHaveBeenCalledWith('arr', '[1,2,3]')
  })

  it('logs error on localStorage failure', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    saveToStorage('key', 'value')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save key'),
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })
})

// =============================================================================
// saveAlerts
// =============================================================================

describe('saveAlerts', () => {
  it('saves alerts to localStorage under ALERTS_KEY', () => {
    const alerts = [makeAlert({ id: '1' }), makeAlert({ id: '2' })]
    saveAlerts(alerts)
    expect(localStorage.setItem).toHaveBeenCalledWith(
      ALERTS_KEY,
      expect.any(String)
    )
    const saved = JSON.parse(
      (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
    )
    expect(saved).toHaveLength(2)
  })

  it('enforces MAX_ALERTS cap — keeps firing alerts first', () => {
    const firingAlerts = Array.from({ length: MAX_ALERTS + 10 }, (_, i) =>
      makeAlert({
        id: `firing-${i}`,
        status: 'firing',
        firedAt: new Date(Date.now() - i * 1000).toISOString(),
      })
    )
    saveAlerts(firingAlerts)
    const saved = JSON.parse(
      (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
    )
    expect(saved.length).toBeLessThanOrEqual(MAX_ALERTS)
  })

  it('keeps resolved alerts when room is available under cap', () => {
    const firing = Array.from({ length: 100 }, (_, i) =>
      makeAlert({ id: `firing-${i}`, status: 'firing', firedAt: new Date(Date.now() - i * 1000).toISOString() })
    )
    const resolved = Array.from({ length: MAX_ALERTS }, (_, i) =>
      makeAlert({
        id: `resolved-${i}`,
        status: 'resolved',
        firedAt: new Date(Date.now() - i * 1000).toISOString(),
        resolvedAt: new Date().toISOString(),
      })
    )
    saveAlerts([...firing, ...resolved])
    const saved = JSON.parse(
      (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
    )
    expect(saved.length).toBeLessThanOrEqual(MAX_ALERTS)
    // All 100 firing alerts should be kept
    const savedFiring = saved.filter((a: Alert) => a.status === 'firing')
    expect(savedFiring).toHaveLength(100)
  })

  it('sorts resolved alerts by resolvedAt with firedAt fallback', () => {
    const fixedNow = Date.now()
    const alerts = [
      makeAlert({ id: 'firing-1', status: 'firing', firedAt: new Date(fixedNow - 500).toISOString() }),
      makeAlert({
        id: 'resolved-with-resolvedAt',
        status: 'resolved',
        firedAt: new Date(fixedNow - 60_000).toISOString(),
        resolvedAt: new Date(fixedNow - 1_000).toISOString(),
      }),
      makeAlert({
        id: 'resolved-fallback-firedAt',
        status: 'resolved',
        firedAt: new Date(fixedNow - 2_000).toISOString(),
      }),
    ]

    saveAlerts(alerts)

    const saved = JSON.parse(
      (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
    ) as Alert[]
    const resolved = saved.filter((a) => a.status === 'resolved')
    expect(resolved).toHaveLength(2)
    expect(resolved[0].id).toBe('resolved-with-resolvedAt')
    expect(resolved[1].id).toBe('resolved-fallback-firedAt')
  })

  it('handles QuotaExceededError by pruning resolved alerts', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let callCount = 0
    ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const err = new DOMException('quota exceeded', 'QuotaExceededError')
        throw err
      }
    })

    const alerts = [
      makeAlert({ id: '1', status: 'firing' }),
      ...Array.from({ length: 100 }, (_, i) =>
        makeAlert({
          id: `resolved-${i}`,
          status: 'resolved',
          firedAt: new Date(Date.now() - i * 1000).toISOString(),
          resolvedAt: new Date(Date.now() - i * 500).toISOString(),
        })
      ),
    ]
    saveAlerts(alerts)

    // Should have called setItem twice (first fails, retry succeeds)
    expect(localStorage.setItem).toHaveBeenCalledTimes(2)
    const retrySaved = JSON.parse(
      (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[1][1]
    )
    // Firing alert should be kept
    const retryFiring = retrySaved.filter((a: Alert) => a.status === 'firing')
    expect(retryFiring).toHaveLength(1)
    // Resolved alerts should be limited to MAX_RESOLVED_ALERTS_AFTER_PRUNE
    const retryResolved = retrySaved.filter((a: Alert) => a.status === 'resolved')
    expect(retryResolved.length).toBeLessThanOrEqual(MAX_RESOLVED_ALERTS_AFTER_PRUNE)
    consoleSpy.mockRestore()
  })

  it('uses resolvedAt fallback to firedAt during quota pruning sort', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let callCount = 0
    ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
    })

    const now = Date.now()
    const alerts = [
      makeAlert({ id: 'firing', status: 'firing', firedAt: new Date(now - 100).toISOString() }),
      makeAlert({
        id: 'resolved-newer-fallback',
        status: 'resolved',
        firedAt: new Date(now - 200).toISOString(),
      }),
      makeAlert({
        id: 'resolved-older',
        status: 'resolved',
        firedAt: new Date(now - 5_000).toISOString(),
        resolvedAt: new Date(now - 4_000).toISOString(),
      }),
    ]

    saveAlerts(alerts)

    const retrySaved = JSON.parse(
      (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[1][1]
    ) as Alert[]
    const retryResolved = retrySaved.filter((a) => a.status === 'resolved')
    expect(retryResolved[0].id).toBe('resolved-newer-fallback')
  })

  it('clears alerts when retry also fails with quota error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })

    saveAlerts([makeAlert()])
    expect(mockSafeRemove).toHaveBeenCalledWith(ALERTS_KEY)
    consoleSpy.mockRestore()
  })

  it('logs non-quota errors without retrying', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('generic error')
    })

    saveAlerts([makeAlert()])
    // Should log the error
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save'),
      expect.any(Error)
    )
    // Should NOT call safeRemove (that's only for quota retry failure)
    expect(mockSafeRemove).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('handles legacy QuotaExceededError with code 22', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let callCount = 0
    ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const err = new DOMException('quota exceeded')
        // Simulate legacy browser with code 22
        Object.defineProperty(err, 'code', { value: 22 })
        throw err
      }
    })

    saveAlerts([makeAlert({ status: 'firing' })])
    // Should retry (recognized as quota error via code 22)
    expect(localStorage.setItem).toHaveBeenCalledTimes(2)
  })
})
