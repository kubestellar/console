/**
 * Tests for lib/constants/time.ts — time unit arithmetic constants.
 */
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
} from '../constants/time'

describe('base constants', () => {
  it('MS_PER_SECOND is 1000', () => expect(MS_PER_SECOND).toBe(1_000))
  it('SECONDS_PER_MINUTE is 60', () => expect(SECONDS_PER_MINUTE).toBe(60))
  it('MINUTES_PER_HOUR is 60', () => expect(MINUTES_PER_HOUR).toBe(60))
  it('HOURS_PER_DAY is 24', () => expect(HOURS_PER_DAY).toBe(24))
  it('DAYS_PER_MONTH is 30', () => expect(DAYS_PER_MONTH).toBe(30))
  it('DAYS_PER_YEAR is 365', () => expect(DAYS_PER_YEAR).toBe(365))
})

describe('derived millisecond constants', () => {
  it('MS_PER_MINUTE = MS_PER_SECOND * 60', () =>
    expect(MS_PER_MINUTE).toBe(MS_PER_SECOND * SECONDS_PER_MINUTE))

  it('MS_PER_HOUR = MS_PER_MINUTE * 60', () =>
    expect(MS_PER_HOUR).toBe(MS_PER_MINUTE * MINUTES_PER_HOUR))

  it('MS_PER_DAY = MS_PER_HOUR * 24', () =>
    expect(MS_PER_DAY).toBe(MS_PER_HOUR * HOURS_PER_DAY))

  it('MS_PER_MONTH = MS_PER_DAY * 30', () =>
    expect(MS_PER_MONTH).toBe(MS_PER_DAY * DAYS_PER_MONTH))

  it('MS_PER_YEAR = MS_PER_DAY * 365', () =>
    expect(MS_PER_YEAR).toBe(MS_PER_DAY * DAYS_PER_YEAR))
})

describe('derived second constants', () => {
  it('SECONDS_PER_HOUR = 60 * 60 = 3600', () =>
    expect(SECONDS_PER_HOUR).toBe(SECONDS_PER_MINUTE * MINUTES_PER_HOUR))

  it('SECONDS_PER_DAY = SECONDS_PER_HOUR * 24 = 86400', () =>
    expect(SECONDS_PER_DAY).toBe(SECONDS_PER_HOUR * HOURS_PER_DAY))
})

describe('derived hour constants', () => {
  it('HOURS_PER_MONTH = HOURS_PER_DAY * DAYS_PER_MONTH', () =>
    expect(HOURS_PER_MONTH).toBe(HOURS_PER_DAY * DAYS_PER_MONTH))
})

describe('spot-check absolute values', () => {
  it('MS_PER_MINUTE is 60000', () => expect(MS_PER_MINUTE).toBe(60_000))
  it('MS_PER_HOUR is 3600000', () => expect(MS_PER_HOUR).toBe(3_600_000))
  it('MS_PER_DAY is 86400000', () => expect(MS_PER_DAY).toBe(86_400_000))
  it('SECONDS_PER_DAY is 86400', () => expect(SECONDS_PER_DAY).toBe(86_400))
  it('SECONDS_PER_HOUR is 3600', () => expect(SECONDS_PER_HOUR).toBe(3_600))
})
