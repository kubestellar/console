import { describe, it, expect, beforeEach } from 'vitest'
import {
  STATUS_CONFIG,
  normalizeStatus,
  getPatternClass,
  loadAccessibilitySettings,
  saveAccessibilitySettings,
  updateAccessibilitySetting,
  getSeverityColors,
  SEVERITY_COLORS,
} from '../accessibility'
import type { StatusLevel, PatternType } from '../accessibility'

describe('STATUS_CONFIG', () => {
  const ALL_STATUSES: StatusLevel[] = ['healthy', 'success', 'warning', 'error', 'critical', 'info', 'unknown', 'pending', 'loading']

  it('has config for all status levels', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_CONFIG[status]).toBeDefined()
      expect(STATUS_CONFIG[status].icon).toBeDefined()
      expect(STATUS_CONFIG[status].label).toBeTruthy()
      expect(STATUS_CONFIG[status].ariaLabel).toBeTruthy()
    }
  })
})

describe('normalizeStatus', () => {
  it('normalizes healthy variants', () => {
    expect(normalizeStatus('healthy')).toBe('healthy')
    expect(normalizeStatus('ok')).toBe('healthy')
    expect(normalizeStatus('Running')).toBe('healthy')
    expect(normalizeStatus('READY')).toBe('healthy')
    expect(normalizeStatus('active')).toBe('healthy')
    expect(normalizeStatus('synced')).toBe('healthy')
  })

  it('normalizes success variants', () => {
    expect(normalizeStatus('success')).toBe('success')
    expect(normalizeStatus('succeeded')).toBe('success')
    expect(normalizeStatus('completed')).toBe('success')
    expect(normalizeStatus('passed')).toBe('success')
  })

  it('normalizes warning variants', () => {
    expect(normalizeStatus('warning')).toBe('warning')
    expect(normalizeStatus('degraded')).toBe('warning')
    expect(normalizeStatus('progressing')).toBe('warning')
  })

  it('normalizes error variants', () => {
    expect(normalizeStatus('error')).toBe('error')
    expect(normalizeStatus('failed')).toBe('error')
    expect(normalizeStatus('unhealthy')).toBe('error')
    expect(normalizeStatus('CrashLoopBackOff')).toBe('error')
  })

  it('normalizes critical variants', () => {
    expect(normalizeStatus('critical')).toBe('critical')
    expect(normalizeStatus('fatal')).toBe('critical')
    expect(normalizeStatus('emergency')).toBe('critical')
  })

  it('normalizes info variants', () => {
    expect(normalizeStatus('info')).toBe('info')
    expect(normalizeStatus('normal')).toBe('info')
  })

  it('normalizes loading variants', () => {
    expect(normalizeStatus('loading')).toBe('loading')
    expect(normalizeStatus('initializing')).toBe('loading')
    expect(normalizeStatus('ContainersCreating')).toBe('loading')
  })

  it('returns unknown for unrecognized', () => {
    expect(normalizeStatus('foobar')).toBe('unknown')
  })

  it('handles whitespace', () => {
    expect(normalizeStatus('  running  ')).toBe('healthy')
  })

  // Note: 'pending' matches warning first in the code (line 164)
  it('normalizes pending to warning (checked first)', () => {
    expect(normalizeStatus('pending')).toBe('warning')
  })
})

describe('getPatternClass', () => {
  it('returns correct classes', () => {
    expect(getPatternClass('striped')).toBe('bg-stripes')
    expect(getPatternClass('dotted')).toBe('bg-dots')
    expect(getPatternClass('dashed')).toBe('bg-dashes')
    expect(getPatternClass('solid')).toBe('')
    expect(getPatternClass('none')).toBe('')
  })
})

describe('loadAccessibilitySettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults when nothing stored', () => {
    const settings = loadAccessibilitySettings()
    expect(settings.colorBlindMode).toBe(false)
    expect(settings.reduceMotion).toBe(false)
    expect(settings.highContrast).toBe(false)
  })

  it('loads stored settings', () => {
    localStorage.setItem('accessibility-settings', JSON.stringify({
      colorBlindMode: true,
      reduceMotion: true,
    }))
    const settings = loadAccessibilitySettings()
    expect(settings.colorBlindMode).toBe(true)
    expect(settings.reduceMotion).toBe(true)
    expect(settings.highContrast).toBe(false)
  })

  it('returns defaults for invalid JSON', () => {
    localStorage.setItem('accessibility-settings', 'not json')
    const settings = loadAccessibilitySettings()
    expect(settings.colorBlindMode).toBe(false)
  })
})

describe('saveAccessibilitySettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves settings to localStorage', () => {
    saveAccessibilitySettings({
      colorBlindMode: true,
      reduceMotion: false,
      highContrast: true,
    })
    const stored = JSON.parse(localStorage.getItem('accessibility-settings')!)
    expect(stored.colorBlindMode).toBe(true)
    expect(stored.highContrast).toBe(true)
  })
})

describe('updateAccessibilitySetting', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('updates a single setting', () => {
    const result = updateAccessibilitySetting('colorBlindMode', true)
    expect(result.colorBlindMode).toBe(true)
    expect(result.reduceMotion).toBe(false)
  })
})

describe('getSeverityColors', () => {
  it('returns colors for known severities', () => {
    expect(getSeverityColors('critical')).toBe(SEVERITY_COLORS.critical)
    expect(getSeverityColors('high')).toBe(SEVERITY_COLORS.high)
    expect(getSeverityColors('medium')).toBe(SEVERITY_COLORS.medium)
    expect(getSeverityColors('low')).toBe(SEVERITY_COLORS.low)
    expect(getSeverityColors('info')).toBe(SEVERITY_COLORS.info)
    expect(getSeverityColors('none')).toBe(SEVERITY_COLORS.none)
  })

  it('normalizes case', () => {
    expect(getSeverityColors('CRITICAL')).toBe(SEVERITY_COLORS.critical)
  })

  it('maps aliases', () => {
    expect(getSeverityColors('error')).toBe(SEVERITY_COLORS.critical)
    expect(getSeverityColors('danger')).toBe(SEVERITY_COLORS.critical)
    expect(getSeverityColors('warning')).toBe(SEVERITY_COLORS.medium)
    expect(getSeverityColors('caution')).toBe(SEVERITY_COLORS.medium)
  })

  it('returns info for unknown', () => {
    expect(getSeverityColors('something')).toBe(SEVERITY_COLORS.info)
  })
})
