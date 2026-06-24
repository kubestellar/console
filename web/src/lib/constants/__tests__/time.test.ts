import { describe, expect, it } from 'vitest'
import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  HOURS_PER_DAY,
  HOURS_PER_MONTH,
  MINUTES_PER_HOUR,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_MONTH,
  MS_PER_SECOND,
  MS_PER_YEAR,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from '../time'

describe('time constants', () => {
  it('keeps millisecond constants derived from smaller units', () => {
    expect(MS_PER_MINUTE).toBe(MS_PER_SECOND * SECONDS_PER_MINUTE)
    expect(MS_PER_HOUR).toBe(MS_PER_MINUTE * MINUTES_PER_HOUR)
    expect(MS_PER_DAY).toBe(MS_PER_HOUR * HOURS_PER_DAY)
  })

  it('keeps second constants derived from smaller units', () => {
    expect(SECONDS_PER_HOUR).toBe(SECONDS_PER_MINUTE * MINUTES_PER_HOUR)
    expect(SECONDS_PER_DAY).toBe(SECONDS_PER_HOUR * HOURS_PER_DAY)
  })

  it('keeps month and year constants consistent', () => {
    expect(HOURS_PER_MONTH).toBe(HOURS_PER_DAY * DAYS_PER_MONTH)
    expect(MS_PER_MONTH).toBe(MS_PER_DAY * DAYS_PER_MONTH)
    expect(MS_PER_YEAR).toBe(MS_PER_DAY * DAYS_PER_YEAR)
  })
})
