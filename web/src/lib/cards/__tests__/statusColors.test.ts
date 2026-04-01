import { describe, it, expect } from 'vitest'
import {
  STATUS_COLORS,
  getStatusSeverity,
  getStatusColors,
  getSeverityColors,
} from '../statusColors'
import type { StatusSeverity } from '../statusColors'

describe('STATUS_COLORS', () => {
  const ALL_SEVERITIES: StatusSeverity[] = ['success', 'warning', 'error', 'info', 'neutral', 'muted']

  it('has complete color sets for all severities', () => {
    for (const sev of ALL_SEVERITIES) {
      expect(STATUS_COLORS[sev].text).toBeTruthy()
      expect(STATUS_COLORS[sev].bg).toBeTruthy()
      expect(STATUS_COLORS[sev].border).toBeTruthy()
      expect(STATUS_COLORS[sev].iconBg).toBeTruthy()
      expect(STATUS_COLORS[sev].barColor).toBeTruthy()
    }
  })
})

describe('getStatusSeverity', () => {
  it('returns neutral for null/undefined/empty', () => {
    expect(getStatusSeverity(null)).toBe('neutral')
    expect(getStatusSeverity(undefined)).toBe('neutral')
    expect(getStatusSeverity('')).toBe('neutral')
  })

  it('detects error statuses', () => {
    expect(getStatusSeverity('CrashLoopBackOff')).toBe('error')
    expect(getStatusSeverity('Failed')).toBe('error')
    expect(getStatusSeverity('OOMKilled')).toBe('error')
    expect(getStatusSeverity('ImagePullBackOff')).toBe('error')
    expect(getStatusSeverity('ErrImagePull')).toBe('error')
    expect(getStatusSeverity('Unhealthy')).toBe('error')
  })

  it('detects warning statuses', () => {
    expect(getStatusSeverity('Pending')).toBe('warning')
    expect(getStatusSeverity('Terminating')).toBe('warning')
    expect(getStatusSeverity('Unknown')).toBe('warning')
    expect(getStatusSeverity('Degraded')).toBe('warning')
  })

  it('detects success statuses', () => {
    expect(getStatusSeverity('Running')).toBe('success')
    expect(getStatusSeverity('Healthy')).toBe('success')
    expect(getStatusSeverity('Ready')).toBe('success')
    expect(getStatusSeverity('Active')).toBe('success')
    expect(getStatusSeverity('Deployed')).toBe('success')
    expect(getStatusSeverity('Succeeded')).toBe('success')
    expect(getStatusSeverity('Bound')).toBe('success')
    expect(getStatusSeverity('Synced')).toBe('success')
  })

  it('detects info statuses', () => {
    expect(getStatusSeverity('Normal')).toBe('info')
    expect(getStatusSeverity('Scheduled')).toBe('info')
    expect(getStatusSeverity('Created')).toBe('info')
  })

  it('returns neutral for unknown statuses', () => {
    expect(getStatusSeverity('SomethingWeird')).toBe('neutral')
  })

  it('is case insensitive', () => {
    expect(getStatusSeverity('RUNNING')).toBe('success')
    expect(getStatusSeverity('failed')).toBe('error')
  })
})

describe('getStatusColors', () => {
  it('returns color set for a status string', () => {
    const colors = getStatusColors('Running')
    expect(colors).toBe(STATUS_COLORS.success)
  })

  it('returns neutral for null', () => {
    const colors = getStatusColors(null)
    expect(colors).toBe(STATUS_COLORS.neutral)
  })
})

describe('getSeverityColors', () => {
  it('returns correct color set for each severity', () => {
    expect(getSeverityColors('success')).toBe(STATUS_COLORS.success)
    expect(getSeverityColors('error')).toBe(STATUS_COLORS.error)
    expect(getSeverityColors('warning')).toBe(STATUS_COLORS.warning)
    expect(getSeverityColors('info')).toBe(STATUS_COLORS.info)
    expect(getSeverityColors('neutral')).toBe(STATUS_COLORS.neutral)
    expect(getSeverityColors('muted')).toBe(STATUS_COLORS.muted)
  })
})
