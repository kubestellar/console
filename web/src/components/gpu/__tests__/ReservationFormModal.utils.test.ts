import { describe, it, expect } from 'vitest'
import {
  toDateInputValue,
  toRFC3339StartDate,
  deriveQuotaName,
  QUOTA_NAME_TITLE_MAX_LEN,
  DEFAULT_RESERVATION_DURATION_HOURS,
  GPU_KEYS,
} from '../ReservationFormModal.utils'

// ─── constants ───────────────────────────────────────────────────────────────

describe('ReservationFormModal.utils constants', () => {
  it('exposes numeric limits', () => {
    expect(QUOTA_NAME_TITLE_MAX_LEN).toBe(40)
    expect(DEFAULT_RESERVATION_DURATION_HOURS).toBe(24)
  })

  it('lists all recognized GPU resource keys', () => {
    expect(GPU_KEYS).toEqual(['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915'])
  })
})

// ─── toDateInputValue ────────────────────────────────────────────────────────

describe('toDateInputValue', () => {
  it('returns empty string for undefined/null/empty', () => {
    expect(toDateInputValue(undefined)).toBe('')
    expect(toDateInputValue(null)).toBe('')
    expect(toDateInputValue('')).toBe('')
  })

  it('strips the time portion of an ISO timestamp', () => {
    expect(toDateInputValue('2026-05-01T12:30:00Z')).toBe('2026-05-01')
    expect(toDateInputValue('2026-05-01T00:00:00+05:00')).toBe('2026-05-01')
  })

  it('leaves a bare date value unchanged', () => {
    expect(toDateInputValue('2026-05-01')).toBe('2026-05-01')
  })
})

// ─── toRFC3339StartDate ──────────────────────────────────────────────────────

describe('toRFC3339StartDate', () => {
  it('returns empty string for empty input', () => {
    expect(toRFC3339StartDate('')).toBe('')
  })

  it('passes through values that already contain a "T"', () => {
    expect(toRFC3339StartDate('2026-05-01T12:00:00Z')).toBe('2026-05-01T12:00:00Z')
    expect(toRFC3339StartDate('2026-05-01T00:00:00+05:30')).toBe('2026-05-01T00:00:00+05:30')
  })

  it('appends midnight-local timestamp with the local timezone offset', () => {
    const out = toRFC3339StartDate('2026-05-01')
    // Format: YYYY-MM-DDT00:00:00±HH:MM
    expect(out).toMatch(/^2026-05-01T00:00:00[+-]\d{2}:\d{2}$/)
  })

  it('produces an offset consistent with Date#getTimezoneOffset()', () => {
    const out = toRFC3339StartDate('2026-05-01')
    const match = out.match(/T00:00:00([+-])(\d{2}):(\d{2})$/)
    expect(match).not.toBeNull()

    const [, sign, hh, mm] = match!
    const signedMinutes = (sign === '+' ? 1 : -1) * (Number(hh) * 60 + Number(mm))
    // toRFC3339StartDate flips the sign of getTimezoneOffset() (minutes-west-of-UTC → offset-east-of-UTC).
    // Adding 0 normalizes a possible -0 (e.g. in UTC, where the offset is zero) to +0 so the
    // comparison doesn't fail due to Object.is distinguishing -0 from 0.
    expect(signedMinutes + 0).toBe(-new Date().getTimezoneOffset() + 0)
  })

  it('zero-pads single-digit hour and minute components of the offset', () => {
    const out = toRFC3339StartDate('2026-05-01')
    const off = out.slice('2026-05-01T00:00:00'.length + 1) // skip sign
    const [hh, mm] = off.split(':')
    expect(hh).toHaveLength(2)
    expect(mm).toHaveLength(2)
  })
})

// ─── deriveQuotaName ─────────────────────────────────────────────────────────

describe('deriveQuotaName', () => {
  it('returns empty string for empty title', () => {
    expect(deriveQuotaName('')).toBe('')
  })

  it('produces the "gpu-" prefix and lowercased slug', () => {
    expect(deriveQuotaName('My Reservation')).toBe('gpu-my-reservation')
  })

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(deriveQuotaName('foo!!!bar   baz')).toBe('gpu-foo-bar-baz')
    expect(deriveQuotaName('a__b--c')).toBe('gpu-a-b-c')
  })

  it('trims leading and trailing hyphens from the slug', () => {
    // "!hello!" → "-hello-" → trimmed to "hello"
    expect(deriveQuotaName('!hello!')).toBe('gpu-hello')
    expect(deriveQuotaName('   spaced   ')).toBe('gpu-spaced')
  })

  it('truncates the sanitized title to QUOTA_NAME_TITLE_MAX_LEN before prefixing', () => {
    const veryLong = 'a'.repeat(100)
    const result = deriveQuotaName(veryLong)
    // The slug portion after "gpu-" is capped at QUOTA_NAME_TITLE_MAX_LEN chars
    expect(result.length).toBe('gpu-'.length + QUOTA_NAME_TITLE_MAX_LEN)
    expect(result.startsWith('gpu-')).toBe(true)
    expect(result.slice(4)).toBe('a'.repeat(QUOTA_NAME_TITLE_MAX_LEN))
  })

  it('preserves already-safe alphanumeric characters', () => {
    expect(deriveQuotaName('abc123')).toBe('gpu-abc123')
  })
})
