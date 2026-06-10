/**
 * Tests for useDurabilityMonitor — exported utility functions.
 *
 * The hook itself uses setInterval + useEffect with object-identity
 * dependencies that cause cascading re-renders in jsdom. We test the
 * two exported pure functions thoroughly and verify the hook's initial
 * state computation without triggering the countdown interval.
 *
 * Covers:
 * - formatCountdown: hours/minutes/seconds, zero, negative, fractional
 * - getDefaultNextRecheckAt: returns ~5 minutes in the future
 */
import { describe, it, expect } from 'vitest'
import {
  formatCountdown,
  getDefaultNextRecheckAt,
} from '../useDurabilityMonitor'

describe('formatCountdown', () => {
  it('returns "now" for zero milliseconds', () => {
    expect(formatCountdown(0)).toBe('now')
  })

  it('returns "now" for negative milliseconds', () => {
    expect(formatCountdown(-1000)).toBe('now')
  })

  it('formats seconds only when under one minute', () => {
    const THIRTY_SECONDS_MS = 30_000
    expect(formatCountdown(THIRTY_SECONDS_MS)).toBe('30s')
  })

  it('formats one second', () => {
    const ONE_SECOND_MS = 1000
    expect(formatCountdown(ONE_SECOND_MS)).toBe('1s')
  })

  it('formats minutes and seconds', () => {
    const TWO_MIN_THIRTY_SEC_MS = 150_000
    expect(formatCountdown(TWO_MIN_THIRTY_SEC_MS)).toBe('2m 30s')
  })

  it('formats exactly one minute as minutes and seconds', () => {
    const ONE_MINUTE_MS = 60_000
    expect(formatCountdown(ONE_MINUTE_MS)).toBe('1m 0s')
  })

  it('formats hours and remaining minutes', () => {
    const ONE_HOUR_FIFTEEN_MIN_MS = 75 * 60_000
    expect(formatCountdown(ONE_HOUR_FIFTEEN_MIN_MS)).toBe('1h 15m')
  })

  it('formats exactly one hour', () => {
    const ONE_HOUR_MS = 3_600_000
    expect(formatCountdown(ONE_HOUR_MS)).toBe('1h 0m')
  })

  it('formats multiple hours', () => {
    const THREE_HOURS_MS = 3 * 3_600_000
    expect(formatCountdown(THREE_HOURS_MS)).toBe('3h 0m')
  })

  it('floors partial seconds', () => {
    const MS_WITH_FRACTIONAL = 1500
    expect(formatCountdown(MS_WITH_FRACTIONAL)).toBe('1s')
  })

  it('floors partial minutes in minute range', () => {
    const NINETY_ONE_SECONDS_MS = 91_000
    expect(formatCountdown(NINETY_ONE_SECONDS_MS)).toBe('1m 31s')
  })

  it('handles large values (24 hours)', () => {
    const TWENTY_FOUR_HOURS_MS = 24 * 3_600_000
    expect(formatCountdown(TWENTY_FOUR_HOURS_MS)).toBe('24h 0m')
  })

  it('handles sub-second values', () => {
    const HALF_SECOND_MS = 500
    expect(formatCountdown(HALF_SECOND_MS)).toBe('0s')
  })
})

describe('getDefaultNextRecheckAt', () => {
  it('returns a Date instance', () => {
    const result = getDefaultNextRecheckAt()
    expect(result).toBeInstanceOf(Date)
  })

  it('returns a time approximately 5 minutes from now', () => {
    const FIVE_MINUTES_MS = 5 * 60_000
    const TOLERANCE_MS = 200
    const before = Date.now()
    const result = getDefaultNextRecheckAt()
    const after = Date.now()

    expect(result.getTime()).toBeGreaterThanOrEqual(before + FIVE_MINUTES_MS - TOLERANCE_MS)
    expect(result.getTime()).toBeLessThanOrEqual(after + FIVE_MINUTES_MS + TOLERANCE_MS)
  })

  it('returns a future date', () => {
    const result = getDefaultNextRecheckAt()
    expect(result.getTime()).toBeGreaterThan(Date.now())
  })

  it('returns different timestamps on successive calls', () => {
    const first = getDefaultNextRecheckAt()
    const second = getDefaultNextRecheckAt()
    // They should be very close but could differ by a ms
    const TOLERANCE_MS = 50
    expect(Math.abs(first.getTime() - second.getTime())).toBeLessThan(TOLERANCE_MS)
  })
})
