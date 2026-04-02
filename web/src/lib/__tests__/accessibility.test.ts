import { describe, it, expect, beforeEach, vi } from 'vitest'
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
import type { StatusLevel, PatternType, SeverityLevel } from '../accessibility'

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

  it('has pattern field for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_CONFIG[status].pattern).toBeDefined()
      expect(['solid', 'striped', 'dotted', 'dashed', 'none']).toContain(STATUS_CONFIG[status].pattern)
    }
  })

  it('has shape field for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_CONFIG[status].shape).toBeDefined()
      expect(['circle', 'triangle', 'square', 'diamond', 'none']).toContain(STATUS_CONFIG[status].shape)
    }
  })

  it('has all CSS class fields for every status', () => {
    for (const status of ALL_STATUSES) {
      const cfg = STATUS_CONFIG[status]
      expect(cfg.colorClass).toBeTruthy()
      expect(cfg.bgClass).toBeTruthy()
      expect(cfg.borderClass).toBeTruthy()
      expect(cfg.textClass).toBeTruthy()
    }
  })

  it('ariaLabel starts with "Status:" for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_CONFIG[status].ariaLabel).toMatch(/^Status:/)
    }
  })

  it('uses distinct patterns for visually similar statuses', () => {
    // error and critical should have different patterns for accessibility
    expect(STATUS_CONFIG.error.pattern).not.toBe(STATUS_CONFIG.critical.pattern)
    // warning and pending both use striped but have different shapes
    if (STATUS_CONFIG.warning.pattern === STATUS_CONFIG.pending.pattern) {
      expect(STATUS_CONFIG.warning.shape).not.toBe(STATUS_CONFIG.pending.shape)
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

  // Additional normalizeStatus coverage

  it('normalizes remaining healthy variants: up, available', () => {
    expect(normalizeStatus('up')).toBe('healthy')
    expect(normalizeStatus('available')).toBe('healthy')
  })

  it('normalizes complete as success', () => {
    expect(normalizeStatus('complete')).toBe('success')
  })

  it('normalizes warn as warning', () => {
    expect(normalizeStatus('warn')).toBe('warning')
  })

  it('normalizes waiting as warning', () => {
    expect(normalizeStatus('waiting')).toBe('warning')
  })

  it('normalizes err/failure/down/notready as error', () => {
    expect(normalizeStatus('err')).toBe('error')
    expect(normalizeStatus('failure')).toBe('error')
    expect(normalizeStatus('down')).toBe('error')
    expect(normalizeStatus('notready')).toBe('error')
  })

  it('normalizes crit and severe as critical', () => {
    expect(normalizeStatus('crit')).toBe('critical')
    expect(normalizeStatus('severe')).toBe('critical')
  })

  it('normalizes information and notice as info', () => {
    expect(normalizeStatus('information')).toBe('info')
    expect(normalizeStatus('notice')).toBe('info')
  })

  it('normalizes starting as loading', () => {
    expect(normalizeStatus('starting')).toBe('loading')
  })

  it('handles mixed case for all branches', () => {
    expect(normalizeStatus('SUCCEEDED')).toBe('success')
    expect(normalizeStatus('DEGRADED')).toBe('warning')
    expect(normalizeStatus('FAILED')).toBe('error')
    expect(normalizeStatus('FATAL')).toBe('critical')
    expect(normalizeStatus('INFORMATION')).toBe('info')
    expect(normalizeStatus('INITIALIZING')).toBe('loading')
  })

  it('returns unknown for empty string', () => {
    expect(normalizeStatus('')).toBe('unknown')
  })

  it('returns unknown for whitespace-only string', () => {
    expect(normalizeStatus('   ')).toBe('unknown')
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

  it('returns empty string for all non-patterned types', () => {
    const nonPatterned: PatternType[] = ['solid', 'none']
    for (const p of nonPatterned) {
      expect(getPatternClass(p)).toBe('')
    }
  })

  it('returns non-empty string for all patterned types', () => {
    const patterned: PatternType[] = ['striped', 'dotted', 'dashed']
    for (const p of patterned) {
      expect(getPatternClass(p).length).toBeGreaterThan(0)
    }
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

  it('merges partial stored settings with defaults', () => {
    localStorage.setItem('accessibility-settings', JSON.stringify({
      highContrast: true,
    }))
    const settings = loadAccessibilitySettings()
    expect(settings.colorBlindMode).toBe(false) // default
    expect(settings.reduceMotion).toBe(false)   // default
    expect(settings.highContrast).toBe(true)    // overridden
  })

  it('handles empty object in localStorage', () => {
    localStorage.setItem('accessibility-settings', JSON.stringify({}))
    const settings = loadAccessibilitySettings()
    expect(settings.colorBlindMode).toBe(false)
    expect(settings.reduceMotion).toBe(false)
    expect(settings.highContrast).toBe(false)
  })

  it('logs error when JSON parse fails', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('accessibility-settings', '{{{{')
    loadAccessibilitySettings()
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load accessibility settings:',
      expect.any(SyntaxError),
    )
    consoleSpy.mockRestore()
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

  it('dispatches kubestellar-settings-changed custom event', () => {
    const handler = vi.fn()
    window.addEventListener('kubestellar-settings-changed', handler)

    saveAccessibilitySettings({
      colorBlindMode: false,
      reduceMotion: false,
      highContrast: false,
    })

    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener('kubestellar-settings-changed', handler)
  })

  it('overwrites previously saved settings', () => {
    saveAccessibilitySettings({
      colorBlindMode: true,
      reduceMotion: false,
      highContrast: false,
    })
    saveAccessibilitySettings({
      colorBlindMode: false,
      reduceMotion: true,
      highContrast: true,
    })
    const stored = JSON.parse(localStorage.getItem('accessibility-settings')!)
    expect(stored.colorBlindMode).toBe(false)
    expect(stored.reduceMotion).toBe(true)
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

  it('updates reduceMotion setting', () => {
    const result = updateAccessibilitySetting('reduceMotion', true)
    expect(result.reduceMotion).toBe(true)
    expect(result.colorBlindMode).toBe(false)
    expect(result.highContrast).toBe(false)
  })

  it('updates highContrast setting', () => {
    const result = updateAccessibilitySetting('highContrast', true)
    expect(result.highContrast).toBe(true)
  })

  it('persists the updated setting to localStorage', () => {
    updateAccessibilitySetting('colorBlindMode', true)
    const stored = JSON.parse(localStorage.getItem('accessibility-settings')!)
    expect(stored.colorBlindMode).toBe(true)
  })

  it('preserves existing settings when updating one field', () => {
    saveAccessibilitySettings({
      colorBlindMode: true,
      reduceMotion: true,
      highContrast: false,
    })
    const result = updateAccessibilitySetting('highContrast', true)
    expect(result.colorBlindMode).toBe(true)  // preserved
    expect(result.reduceMotion).toBe(true)     // preserved
    expect(result.highContrast).toBe(true)     // updated
  })

  it('can toggle a setting back to false', () => {
    updateAccessibilitySetting('colorBlindMode', true)
    const result = updateAccessibilitySetting('colorBlindMode', false)
    expect(result.colorBlindMode).toBe(false)
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

  // Additional getSeverityColors coverage

  it('maps fatal alias to critical', () => {
    expect(getSeverityColors('fatal')).toBe(SEVERITY_COLORS.critical)
  })

  it('maps emergency alias to critical', () => {
    expect(getSeverityColors('emergency')).toBe(SEVERITY_COLORS.critical)
  })

  it('maps warn alias to medium', () => {
    expect(getSeverityColors('warn')).toBe(SEVERITY_COLORS.medium)
  })

  it('handles mixed-case aliases', () => {
    expect(getSeverityColors('ERROR')).toBe(SEVERITY_COLORS.critical)
    expect(getSeverityColors('DANGER')).toBe(SEVERITY_COLORS.critical)
    expect(getSeverityColors('WARNING')).toBe(SEVERITY_COLORS.medium)
    expect(getSeverityColors('CAUTION')).toBe(SEVERITY_COLORS.medium)
  })

  it('handles whitespace in severity string', () => {
    expect(getSeverityColors('  critical  ')).toBe(SEVERITY_COLORS.critical)
    expect(getSeverityColors('  high  ')).toBe(SEVERITY_COLORS.high)
  })

  it('returns info for empty string', () => {
    expect(getSeverityColors('')).toBe(SEVERITY_COLORS.info)
  })

  it('returns correct color structure with all fields', () => {
    const allSeverities: SeverityLevel[] = ['critical', 'high', 'medium', 'low', 'info', 'none']
    for (const sev of allSeverities) {
      const colors = SEVERITY_COLORS[sev]
      expect(colors.text).toBeTruthy()
      expect(colors.bg).toBeTruthy()
      expect(colors.border).toBeTruthy()
      expect(colors.solid).toBeTruthy()
    }
  })

  it('SEVERITY_COLORS has exactly 6 levels', () => {
    expect(Object.keys(SEVERITY_COLORS)).toHaveLength(6)
  })
})
