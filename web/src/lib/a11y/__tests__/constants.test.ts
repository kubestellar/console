import { describe, it, expect } from 'vitest'
import {
  WCAG_LEVEL,
  TARGET_WCAG_LEVEL,
  MIN_CONTRAST_RATIO_NORMAL,
  MIN_CONTRAST_RATIO_LARGE,
  ENHANCED_CONTRAST_RATIO_NORMAL,
  MIN_CONTRAST_RATIO_UI_COMPONENT,
  LARGE_TEXT_THRESHOLD_PX,
  FOCUS_OUTLINE_WIDTH_PX,
  FOCUS_OUTLINE_OFFSET_PX,
  FOCUS_OUTLINE_STYLE,
  REQUIRED_LANDMARKS,
  LANDMARK_DESCRIPTIONS,
  MIN_AUTO_DISMISS_MS,
  AXE_IMPACT_TO_WCAG,
  AXE_WCAG_AA_TAGS,
} from '../constants'

describe('a11y constants', () => {
  it('defines WCAG levels A, AA, AAA', () => {
    expect(WCAG_LEVEL.A).toBe('A')
    expect(WCAG_LEVEL.AA).toBe('AA')
    expect(WCAG_LEVEL.AAA).toBe('AAA')
  })

  it('targets WCAG AA compliance', () => {
    expect(TARGET_WCAG_LEVEL).toBe('AA')
  })

  describe('contrast ratios follow WCAG 2.1', () => {
    it('normal text minimum is 4.5:1', () => {
      expect(MIN_CONTRAST_RATIO_NORMAL).toBe(4.5)
    })

    it('large text minimum is 3:1', () => {
      expect(MIN_CONTRAST_RATIO_LARGE).toBe(3)
    })

    it('enhanced normal contrast is 7:1', () => {
      expect(ENHANCED_CONTRAST_RATIO_NORMAL).toBe(7)
    })

    it('UI component contrast is 3:1', () => {
      expect(MIN_CONTRAST_RATIO_UI_COMPONENT).toBe(3)
    })
  })

  it('large text threshold is 24px (18pt)', () => {
    expect(LARGE_TEXT_THRESHOLD_PX).toBe(24)
  })

  describe('focus indicators', () => {
    it('outline width is at least 2px', () => {
      expect(FOCUS_OUTLINE_WIDTH_PX).toBeGreaterThanOrEqual(2)
    })

    it('outline offset is non-negative', () => {
      expect(FOCUS_OUTLINE_OFFSET_PX).toBeGreaterThanOrEqual(0)
    })

    it('FOCUS_OUTLINE_STYLE includes width and solid', () => {
      expect(FOCUS_OUTLINE_STYLE).toContain('solid')
      expect(FOCUS_OUTLINE_STYLE).toContain(`${FOCUS_OUTLINE_WIDTH_PX}`)
    })
  })

  describe('required landmarks', () => {
    it('includes banner, main, contentinfo, navigation', () => {
      expect(REQUIRED_LANDMARKS).toContain('banner')
      expect(REQUIRED_LANDMARKS).toContain('main')
      expect(REQUIRED_LANDMARKS).toContain('contentinfo')
      expect(REQUIRED_LANDMARKS).toContain('navigation')
    })

    it('each landmark has a description', () => {
      for (const landmark of REQUIRED_LANDMARKS) {
        expect(LANDMARK_DESCRIPTIONS[landmark]).toBeTruthy()
      }
    })
  })

  it('auto-dismiss timing is at least 20 seconds (WCAG SC 2.2.1)', () => {
    expect(MIN_AUTO_DISMISS_MS).toBeGreaterThanOrEqual(20_000)
  })

  describe('axe-core mappings', () => {
    it('maps critical impact to fails-all', () => {
      expect(AXE_IMPACT_TO_WCAG['critical']).toBe('fails-all')
    })

    it('includes wcag2a and wcag2aa tags', () => {
      expect(AXE_WCAG_AA_TAGS).toContain('wcag2a')
      expect(AXE_WCAG_AA_TAGS).toContain('wcag2aa')
    })
  })
})
