import { describe, it, expect } from 'vitest'
import {
  STATUS_COLORS,
  getHealthColors,
  getSeverityColors,
  type StatusType,
  type SeverityType,
} from '../statusColors'

describe('STATUS_COLORS', () => {
  it('exposes the five documented status keys', () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual(
      ['error', 'info', 'neutral', 'success', 'warning'].sort()
    )
  })

  it.each(['success', 'error', 'warning', 'info', 'neutral'] as StatusType[])(
    'every status entry (%s) has text/bg/border/dot class strings',
    (key) => {
      const entry = STATUS_COLORS[key]
      expect(entry).toEqual({
        text: expect.stringMatching(/\S/),
        bg: expect.stringMatching(/\S/),
        border: expect.stringMatching(/\S/),
        dot: expect.stringMatching(/\S/),
      })
    }
  )

  it('uses tailwind text-* classes for the text field', () => {
    for (const key of Object.keys(STATUS_COLORS) as StatusType[]) {
      expect(STATUS_COLORS[key].text).toMatch(/^text-/)
    }
  })

  it('uses tailwind bg-* classes for the bg and dot fields', () => {
    for (const key of Object.keys(STATUS_COLORS) as StatusType[]) {
      expect(STATUS_COLORS[key].bg).toMatch(/^bg-/)
      expect(STATUS_COLORS[key].dot).toMatch(/^bg-/)
    }
  })

  it('uses tailwind border-* classes for the border field', () => {
    for (const key of Object.keys(STATUS_COLORS) as StatusType[]) {
      expect(STATUS_COLORS[key].border).toMatch(/^border-/)
    }
  })

  it('assigns a distinct color family to each status (no cross-status collisions on the text class)', () => {
    const texts = Object.values(STATUS_COLORS).map((c) => c.text)
    expect(new Set(texts).size).toBe(texts.length)
  })
})

describe('getHealthColors', () => {
  it('returns the success palette when healthy', () => {
    expect(getHealthColors(true)).toBe(STATUS_COLORS.success)
  })

  it('returns the error palette when unhealthy', () => {
    expect(getHealthColors(false)).toBe(STATUS_COLORS.error)
  })

  it('returns the exact same object reference on repeated calls (no clone)', () => {
    // The function returns the shared STATUS_COLORS entry, not a copy.
    // Callers rely on referential equality for memoization.
    expect(getHealthColors(true)).toBe(getHealthColors(true))
    expect(getHealthColors(false)).toBe(getHealthColors(false))
  })
})

describe('getSeverityColors', () => {
  it('maps "critical" to the error palette', () => {
    expect(getSeverityColors('critical')).toBe(STATUS_COLORS.error)
  })

  it('maps "warning" to the warning palette', () => {
    expect(getSeverityColors('warning')).toBe(STATUS_COLORS.warning)
  })

  it('maps "info" to the info palette', () => {
    expect(getSeverityColors('info')).toBe(STATUS_COLORS.info)
  })

  it.each<SeverityType>(['critical', 'warning', 'info'])(
    'returns a fully-populated palette for %s',
    (sev) => {
      const palette = getSeverityColors(sev)
      expect(palette).toBeDefined()
      expect(palette.text).toBeTruthy()
      expect(palette.bg).toBeTruthy()
      expect(palette.border).toBeTruthy()
      expect(palette.dot).toBeTruthy()
    }
  )

  it('returns distinct palettes for each severity', () => {
    const c = getSeverityColors('critical')
    const w = getSeverityColors('warning')
    const i = getSeverityColors('info')
    expect(c).not.toBe(w)
    expect(w).not.toBe(i)
    expect(c).not.toBe(i)
  })

  it('never maps a documented severity to the neutral palette', () => {
    // Neutral is intentionally reserved for non-severity UI. A regression
    // that routed a severity through neutral would silently swallow signal.
    for (const sev of ['critical', 'warning', 'info'] as SeverityType[]) {
      expect(getSeverityColors(sev)).not.toBe(STATUS_COLORS.neutral)
    }
  })
})
