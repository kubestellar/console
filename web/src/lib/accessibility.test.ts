/**
 * Unit coverage for lib/accessibility.ts.
 *
 * Covers pure status/severity normalization helpers, pattern class mapping,
 * and the localStorage-backed accessibility settings persistence layer.
 * Runs in the jsdom environment configured in vitest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SEVERITY_COLORS,
  STATUS_CONFIG,
  getPatternClass,
  getSeverityColors,
  loadAccessibilitySettings,
  normalizeStatus,
  saveAccessibilitySettings,
  updateAccessibilitySetting,
  type AccessibilitySettings,
  type PatternType,
  type SeverityLevel,
  type StatusLevel,
} from './accessibility'

const STORAGE_KEY = 'accessibility-settings'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// normalizeStatus
// ---------------------------------------------------------------------------
describe('normalizeStatus', () => {
  it.each([
    ['Healthy', 'healthy'],
    ['ok', 'healthy'],
    ['UP', 'healthy'],
    ['running', 'healthy'],
    ['available', 'healthy'],
    ['ready', 'healthy'],
    ['active', 'healthy'],
    ['synced', 'healthy'],
  ])('classifies %s as healthy', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })

  it.each([
    ['success', 'success'],
    ['Succeeded', 'success'],
    ['complete', 'success'],
    ['completed', 'success'],
    ['passed', 'success'],
  ])('classifies %s as success', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })

  it.each([
    ['warning', 'warning'],
    ['warn', 'warning'],
    ['degraded', 'warning'],
    ['progressing', 'warning'],
  ])('classifies %s as warning', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })

  it.each([
    ['error', 'error'],
    ['err', 'error'],
    ['failed', 'error'],
    ['failure', 'error'],
    ['unhealthy', 'error'],
    ['down', 'error'],
    ['notready', 'error'],
    ['CrashLoopBackOff', 'error'],
  ])('classifies %s as error', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })

  it.each([
    ['critical', 'critical'],
    ['crit', 'critical'],
    ['fatal', 'critical'],
    ['emergency', 'critical'],
    ['severe', 'critical'],
  ])('classifies %s as critical', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })

  it.each([
    ['info', 'info'],
    ['information', 'info'],
    ['normal', 'info'],
    ['notice', 'info'],
  ])('classifies %s as info', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })

  it.each([
    ['loading', 'loading'],
    ['initializing', 'loading'],
    ['starting', 'loading'],
    ['ContainersCreating', 'loading'],
  ])('classifies %s as loading', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected)
  })

  it('classifies scheduled/queued as pending (via the pending code path)', () => {
    expect(normalizeStatus('scheduled')).toBe('pending')
    expect(normalizeStatus('queued')).toBe('pending')
  })

  it('returns "unknown" for anything unmapped', () => {
    expect(normalizeStatus('bogus')).toBe('unknown')
    expect(normalizeStatus('')).toBe('unknown')
    expect(normalizeStatus('   ')).toBe('unknown')
  })

  it('trims and lowercases the input before matching', () => {
    expect(normalizeStatus('  HEALTHY  ')).toBe('healthy')
    expect(normalizeStatus('Failed')).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// getPatternClass
// ---------------------------------------------------------------------------
describe('getPatternClass', () => {
  it.each<[PatternType, string]>([
    ['striped', 'bg-stripes'],
    ['dotted', 'bg-dots'],
    ['dashed', 'bg-dashes'],
    ['solid', ''],
    ['none', ''],
  ])('maps %s to %s', (pattern, expected) => {
    expect(getPatternClass(pattern)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// loadAccessibilitySettings
// ---------------------------------------------------------------------------
describe('loadAccessibilitySettings', () => {
  it('returns defaults when localStorage is empty', () => {
    expect(loadAccessibilitySettings()).toEqual({
      colorBlindMode: false,
      reduceMotion: false,
      highContrast: false,
    })
  })

  it('merges stored settings on top of defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ colorBlindMode: true }))
    expect(loadAccessibilitySettings()).toEqual({
      colorBlindMode: true,
      reduceMotion: false,
      highContrast: false,
    })
  })

  it('returns full stored settings when all keys are present', () => {
    const full: AccessibilitySettings = {
      colorBlindMode: true,
      reduceMotion: true,
      highContrast: true,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full))
    expect(loadAccessibilitySettings()).toEqual(full)
  })

  it('falls back to defaults and logs when stored JSON is malformed', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, '{not-json}')
    expect(loadAccessibilitySettings()).toEqual({
      colorBlindMode: false,
      reduceMotion: false,
      highContrast: false,
    })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('falls back to defaults when localStorage.getItem itself throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const originalGetItem = localStorage.getItem.bind(localStorage)
    localStorage.getItem = vi.fn(() => {
      throw new Error('quota exceeded')
    })
    try {
      expect(loadAccessibilitySettings()).toEqual({
        colorBlindMode: false,
        reduceMotion: false,
        highContrast: false,
      })
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      localStorage.getItem = originalGetItem
    }
  })
})

// ---------------------------------------------------------------------------
// saveAccessibilitySettings
// ---------------------------------------------------------------------------
describe('saveAccessibilitySettings', () => {
  it('writes settings to localStorage as JSON', () => {
    const settings: AccessibilitySettings = {
      colorBlindMode: true,
      reduceMotion: false,
      highContrast: true,
    }
    saveAccessibilitySettings(settings)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(settings)
  })

  it('dispatches a "kubestellar-settings-changed" event on the window', () => {
    const listener = vi.fn()
    window.addEventListener('kubestellar-settings-changed', listener)
    try {
      saveAccessibilitySettings({
        colorBlindMode: false,
        reduceMotion: false,
        highContrast: false,
      })
      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('kubestellar-settings-changed', listener)
    }
  })

  it('swallows and logs storage errors so callers keep running', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = vi.fn(() => {
      throw new Error('quota exceeded')
    })
    try {
      expect(() =>
        saveAccessibilitySettings({
          colorBlindMode: true,
          reduceMotion: false,
          highContrast: false,
        })
      ).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      localStorage.setItem = originalSetItem
    }
  })
})

// ---------------------------------------------------------------------------
// updateAccessibilitySetting
// ---------------------------------------------------------------------------
describe('updateAccessibilitySetting', () => {
  it('merges a single key into current settings and persists the result', () => {
    const result = updateAccessibilitySetting('colorBlindMode', true)
    expect(result).toEqual({
      colorBlindMode: true,
      reduceMotion: false,
      highContrast: false,
    })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(result)
  })

  it('preserves other keys that were previously set', () => {
    saveAccessibilitySettings({
      colorBlindMode: true,
      reduceMotion: true,
      highContrast: false,
    })
    const result = updateAccessibilitySetting('highContrast', true)
    expect(result).toEqual({
      colorBlindMode: true,
      reduceMotion: true,
      highContrast: true,
    })
  })

  it('returns the fully-merged snapshot each call', () => {
    const first = updateAccessibilitySetting('reduceMotion', true)
    const second = updateAccessibilitySetting('colorBlindMode', true)
    expect(first).toEqual({
      colorBlindMode: false,
      reduceMotion: true,
      highContrast: false,
    })
    expect(second).toEqual({
      colorBlindMode: true,
      reduceMotion: true,
      highContrast: false,
    })
  })
})

// ---------------------------------------------------------------------------
// getSeverityColors
// ---------------------------------------------------------------------------
describe('getSeverityColors', () => {
  it.each<SeverityLevel>(['critical', 'high', 'medium', 'low', 'info', 'none'])(
    'returns the SEVERITY_COLORS entry for %s',
    (level) => {
      expect(getSeverityColors(level)).toBe(SEVERITY_COLORS[level])
    }
  )

  it('trims and lowercases the input', () => {
    expect(getSeverityColors('  CRITICAL  ')).toBe(SEVERITY_COLORS.critical)
  })

  it.each(['error', 'danger', 'fatal', 'emergency'])(
    'maps the "%s" alias to critical',
    (alias) => {
      expect(getSeverityColors(alias)).toBe(SEVERITY_COLORS.critical)
    }
  )

  it.each(['warn', 'warning', 'caution'])(
    'maps the "%s" alias to medium',
    (alias) => {
      expect(getSeverityColors(alias)).toBe(SEVERITY_COLORS.medium)
    }
  )

  it('falls back to info for anything unrecognised', () => {
    expect(getSeverityColors('bogus')).toBe(SEVERITY_COLORS.info)
    expect(getSeverityColors('')).toBe(SEVERITY_COLORS.info)
  })
})

// ---------------------------------------------------------------------------
// STATUS_CONFIG shape guarantees
// ---------------------------------------------------------------------------
describe('STATUS_CONFIG', () => {
  const levels: StatusLevel[] = [
    'healthy', 'success', 'warning', 'error', 'critical',
    'info', 'unknown', 'pending', 'loading',
  ]

  it.each(levels)('has a fully populated config for %s', (level) => {
    const cfg = STATUS_CONFIG[level]
    expect(cfg).toBeDefined()
    expect(cfg.label.length).toBeGreaterThan(0)
    expect(cfg.ariaLabel.startsWith('Status: ')).toBe(true)
    expect(cfg.colorClass).toMatch(/^text-/)
    expect(cfg.bgClass).toMatch(/^bg-/)
    expect(cfg.borderClass).toMatch(/^border-/)
    expect(cfg.textClass).toMatch(/^text-/)
    expect(typeof cfg.icon).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// SEVERITY_COLORS shape guarantees
// ---------------------------------------------------------------------------
describe('SEVERITY_COLORS', () => {
  const levels: SeverityLevel[] = ['critical', 'high', 'medium', 'low', 'info', 'none']
  it.each(levels)('has text/bg/border/solid classes for %s', (level) => {
    const c = SEVERITY_COLORS[level]
    expect(c.text).toMatch(/^text-/)
    expect(c.bg).toMatch(/^bg-/)
    expect(c.border).toMatch(/^border-/)
    expect(c.solid).toMatch(/^bg-/)
  })
})
