import { describe, it, expect } from 'vitest'
import {
  TOOLTIP_ROW_PADDING_PX,
  TOOLTIP_TIGHT_GAP_PX,
  TOOLTIP_HEADER_MARGIN_PX,
  TOOLTIP_INLINE_GAP_PX,
  TOOLTIP_SWATCH_SIZE_PX,
} from '../tooltipSpacing'

describe('tooltipSpacing constants', () => {
  it('follows 4px grid spacing scale', () => {
    expect(TOOLTIP_ROW_PADDING_PX).toBe(1)
    expect(TOOLTIP_TIGHT_GAP_PX).toBe(2)
    expect(TOOLTIP_HEADER_MARGIN_PX).toBe(4)
    expect(TOOLTIP_INLINE_GAP_PX).toBe(6)
    expect(TOOLTIP_SWATCH_SIZE_PX).toBe(8)
  })

  it('all values are positive integers', () => {
    const values = [
      TOOLTIP_ROW_PADDING_PX,
      TOOLTIP_TIGHT_GAP_PX,
      TOOLTIP_HEADER_MARGIN_PX,
      TOOLTIP_INLINE_GAP_PX,
      TOOLTIP_SWATCH_SIZE_PX,
    ]
    for (const v of values) {
      expect(v).toBeGreaterThan(0)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('values are in ascending order', () => {
    const values = [
      TOOLTIP_ROW_PADDING_PX,
      TOOLTIP_TIGHT_GAP_PX,
      TOOLTIP_HEADER_MARGIN_PX,
      TOOLTIP_INLINE_GAP_PX,
      TOOLTIP_SWATCH_SIZE_PX,
    ]
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })
})
