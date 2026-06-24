import { describe, it, expect } from 'vitest'
import {
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
  MINUTES_PER_HOUR,
  HOURS_PER_DAY,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  SECONDS_PER_HOUR,
  SECONDS_PER_DAY,
  HOURS_PER_MONTH,
  MS_PER_MONTH,
  MS_PER_YEAR,
} from '../time'

describe('time constants', () => {
  // Base constants
  it('MS_PER_SECOND = 1000', () => {
    expect(MS_PER_SECOND).toBe(1_000)
  })

  it('SECONDS_PER_MINUTE = 60', () => {
    expect(SECONDS_PER_MINUTE).toBe(60)
  })

  it('MINUTES_PER_HOUR = 60', () => {
    expect(MINUTES_PER_HOUR).toBe(60)
  })

  it('HOURS_PER_DAY = 24', () => {
    expect(HOURS_PER_DAY).toBe(24)
  })

  it('DAYS_PER_MONTH = 30', () => {
    expect(DAYS_PER_MONTH).toBe(30)
  })

  it('DAYS_PER_YEAR = 365', () => {
    expect(DAYS_PER_YEAR).toBe(365)
  })

  // Derived constants — validate values AND derivation chains
  it('MS_PER_MINUTE = 60_000', () => {
    expect(MS_PER_MINUTE).toBe(60_000)
    expect(MS_PER_MINUTE).toBe(MS_PER_SECOND * SECONDS_PER_MINUTE)
  })

  it('MS_PER_HOUR = 3_600_000', () => {
    expect(MS_PER_HOUR).toBe(3_600_000)
    expect(MS_PER_HOUR).toBe(MS_PER_MINUTE * MINUTES_PER_HOUR)
  })

  it('MS_PER_DAY = 86_400_000', () => {
    expect(MS_PER_DAY).toBe(86_400_000)
    expect(MS_PER_DAY).toBe(MS_PER_HOUR * HOURS_PER_DAY)
  })

  it('SECONDS_PER_HOUR = 3600', () => {
    expect(SECONDS_PER_HOUR).toBe(3_600)
    expect(SECONDS_PER_HOUR).toBe(SECONDS_PER_MINUTE * MINUTES_PER_HOUR)
  })

  it('SECONDS_PER_DAY = 86400', () => {
    expect(SECONDS_PER_DAY).toBe(86_400)
    expect(SECONDS_PER_DAY).toBe(SECONDS_PER_HOUR * HOURS_PER_DAY)
  })

  it('HOURS_PER_MONTH = 720', () => {
    expect(HOURS_PER_MONTH).toBe(720)
    expect(HOURS_PER_MONTH).toBe(HOURS_PER_DAY * DAYS_PER_MONTH)
  })

  it('MS_PER_MONTH = 30 days in ms', () => {
    expect(MS_PER_MONTH).toBe(2_592_000_000)
    expect(MS_PER_MONTH).toBe(MS_PER_DAY * DAYS_PER_MONTH)
  })

  it('MS_PER_YEAR = 365 days in ms', () => {
    expect(MS_PER_YEAR).toBe(31_536_000_000)
    expect(MS_PER_YEAR).toBe(MS_PER_DAY * DAYS_PER_YEAR)
  })

  // Cross-chain consistency
  it('derivation chains are internally consistent', () => {
    expect(MS_PER_HOUR).toBe(MS_PER_SECOND * SECONDS_PER_HOUR)
    expect(MS_PER_DAY).toBe(MS_PER_SECOND * SECONDS_PER_DAY)
    expect(MS_PER_MONTH).toBe(MS_PER_HOUR * HOURS_PER_MONTH)
  })
})
