import { describe, expect, it } from 'vitest'

import { STATUS_COLORS, getHealthColors, getSeverityColors } from './statusColors'

describe('STATUS_COLORS', () => {
  it('defines the expected status keys', () => {
    expect(Object.keys(STATUS_COLORS)).toEqual(['success', 'error', 'warning', 'info', 'neutral'])
  })

  it('uses the expected shape for each color set', () => {
    for (const colors of Object.values(STATUS_COLORS)) {
      expect(Object.keys(colors)).toEqual(['text', 'bg', 'border', 'dot'])
    }
  })

  it('defines the expected success colors', () => {
    expect(STATUS_COLORS.success).toEqual({
      text: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
      dot: 'bg-green-400',
    })
  })

  it('defines the expected error colors', () => {
    expect(STATUS_COLORS.error).toEqual({
      text: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      dot: 'bg-red-400',
    })
  })
})

describe('getHealthColors', () => {
  it('returns success colors for healthy status', () => {
    expect(getHealthColors(true)).toBe(STATUS_COLORS.success)
  })

  it('returns error colors for unhealthy status', () => {
    expect(getHealthColors(false)).toBe(STATUS_COLORS.error)
  })
})

describe('getSeverityColors', () => {
  it('maps severity values to the expected color sets', () => {
    expect(getSeverityColors('critical')).toBe(STATUS_COLORS.error)
    expect(getSeverityColors('warning')).toBe(STATUS_COLORS.warning)
    expect(getSeverityColors('info')).toBe(STATUS_COLORS.info)
  })
})
