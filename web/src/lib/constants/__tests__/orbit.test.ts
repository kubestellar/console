import { describe, it, expect } from 'vitest'
import {
  ORBIT_CADENCE_HOURS,
  ORBIT_OVERDUE_GRACE_HOURS,
  ORBIT_MAX_HISTORY_ENTRIES,
  ORBIT_DEFAULT_CADENCE,
  GROUND_CONTROL_DASHBOARD_NAME_TEMPLATE,
  ORBIT_AUTORUN_CHECK_INTERVAL_MS,
} from '../orbit'

describe('orbit constants', () => {
  it('defines cadence hours for all cadences', () => {
    expect(ORBIT_CADENCE_HOURS.daily).toBe(24)
    expect(ORBIT_CADENCE_HOURS.weekly).toBe(168)
    expect(ORBIT_CADENCE_HOURS.monthly).toBe(720)
  })

  it('weekly cadence equals 7 days', () => {
    const HOURS_PER_DAY = 24
    const DAYS_PER_WEEK = 7
    expect(ORBIT_CADENCE_HOURS.weekly).toBe(HOURS_PER_DAY * DAYS_PER_WEEK)
  })

  it('monthly cadence equals 30 days', () => {
    const HOURS_PER_DAY = 24
    const DAYS_PER_MONTH = 30
    expect(ORBIT_CADENCE_HOURS.monthly).toBe(HOURS_PER_DAY * DAYS_PER_MONTH)
  })

  it('has reasonable overdue grace period', () => {
    expect(ORBIT_OVERDUE_GRACE_HOURS).toBe(4)
    expect(ORBIT_OVERDUE_GRACE_HOURS).toBeGreaterThan(0)
  })

  it('limits history entries', () => {
    expect(ORBIT_MAX_HISTORY_ENTRIES).toBe(50)
  })

  it('defaults to weekly cadence', () => {
    expect(ORBIT_DEFAULT_CADENCE).toBe('weekly')
  })

  it('dashboard template contains {project} placeholder', () => {
    expect(GROUND_CONTROL_DASHBOARD_NAME_TEMPLATE).toContain('{project}')
  })

  it('autorun check interval is 1 minute in ms', () => {
    const MS_PER_MINUTE = 60_000
    expect(ORBIT_AUTORUN_CHECK_INTERVAL_MS).toBe(MS_PER_MINUTE)
  })
})
