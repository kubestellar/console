import { describe, it, expect } from 'vitest'
import { getWidgetPreviewScale } from './WidgetExportModalPreview'

// ---------------------------------------------------------------------------
// getWidgetPreviewScale — pure scaling helper
// Bounds: max 260 × 220 px (WIDGET_EXPORT_MODAL_PREVIEW_MAX_WIDTH/HEIGHT_PX)
// ---------------------------------------------------------------------------

describe('getWidgetPreviewScale', () => {
  it('returns 1 for null dimensions', () => {
    expect(getWidgetPreviewScale(null)).toBe(1)
  })

  it('returns 1 when the widget fits within both bounds', () => {
    // 200 × 180 is within 260 × 220
    expect(getWidgetPreviewScale({ width: 200, height: 180 })).toBe(1)
  })

  it('returns 1 when dimensions exactly match the bounds', () => {
    expect(getWidgetPreviewScale({ width: 260, height: 220 })).toBe(1)
  })

  it('scales down a widget that exceeds the max width', () => {
    // width=520 is 2× max (260) → scale = 260/520 = 0.5
    expect(getWidgetPreviewScale({ width: 520, height: 100 })).toBeCloseTo(0.5)
  })

  it('scales down a widget that exceeds the max height', () => {
    // height=440 is 2× max (220) → scale = 220/440 = 0.5
    expect(getWidgetPreviewScale({ width: 100, height: 440 })).toBeCloseTo(0.5)
  })

  it('uses the more constrained axis when both exceed bounds', () => {
    // width=520 → 260/520=0.5; height=550 → 220/550≈0.4 → use 0.4
    const expected = 220 / 550
    expect(getWidgetPreviewScale({ width: 520, height: 550 })).toBeCloseTo(expected)
  })

  it('never returns a scale greater than 1', () => {
    // Very small widget — should not magnify
    expect(getWidgetPreviewScale({ width: 50, height: 50 })).toBeLessThanOrEqual(1)
  })

  it('handles 1×1 dimensions without error', () => {
    expect(getWidgetPreviewScale({ width: 1, height: 1 })).toBe(1)
  })
})
