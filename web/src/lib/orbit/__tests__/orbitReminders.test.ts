import { describe, it, expect } from 'vitest'
import { ORBIT_CADENCE_HOURS, ORBIT_OVERDUE_GRACE_HOURS } from '../../constants/orbit'

describe('orbit cadence constants', () => {
  it('daily cadence is 24 hours', () => {
    expect(ORBIT_CADENCE_HOURS.daily).toBe(24)
  })

  it('weekly cadence is 168 hours (7 days)', () => {
    expect(ORBIT_CADENCE_HOURS.weekly).toBe(168)
  })

  it('monthly cadence is 720 hours (30 days)', () => {
    expect(ORBIT_CADENCE_HOURS.monthly).toBe(720)
  })

  it('overdue grace period is 4 hours', () => {
    expect(ORBIT_OVERDUE_GRACE_HOURS).toBe(4)
  })
})

describe('orbit overdue calculation', () => {
  function isOverdue(lastRunAt: string, cadence: keyof typeof ORBIT_CADENCE_HOURS): boolean {
    const cadenceMs = ORBIT_CADENCE_HOURS[cadence] * 3_600_000
    const elapsed = Date.now() - new Date(lastRunAt).getTime()
    return elapsed > cadenceMs
  }

  it('daily mission run 25 hours ago is overdue', () => {
    const lastRun = new Date(Date.now() - 25 * 3_600_000).toISOString()
    expect(isOverdue(lastRun, 'daily')).toBe(true)
  })

  it('daily mission run 23 hours ago is not overdue', () => {
    const lastRun = new Date(Date.now() - 23 * 3_600_000).toISOString()
    expect(isOverdue(lastRun, 'daily')).toBe(false)
  })

  it('weekly mission run 6 days ago is not overdue', () => {
    const lastRun = new Date(Date.now() - 6 * 24 * 3_600_000).toISOString()
    expect(isOverdue(lastRun, 'weekly')).toBe(false)
  })

  it('weekly mission run 8 days ago is overdue', () => {
    const lastRun = new Date(Date.now() - 8 * 24 * 3_600_000).toISOString()
    expect(isOverdue(lastRun, 'weekly')).toBe(true)
  })

  it('monthly mission run 29 days ago is not overdue', () => {
    const lastRun = new Date(Date.now() - 29 * 24 * 3_600_000).toISOString()
    expect(isOverdue(lastRun, 'monthly')).toBe(false)
  })

  it('monthly mission run 31 days ago is overdue', () => {
    const lastRun = new Date(Date.now() - 31 * 24 * 3_600_000).toISOString()
    expect(isOverdue(lastRun, 'monthly')).toBe(true)
  })
})
