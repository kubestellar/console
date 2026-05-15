import { describe, it, expect } from 'vitest'

import { ACCENT_CLASSES } from '../styles'
import type { AccentColor } from '../styles'

describe('ACCENT_CLASSES', () => {
  it('has purple and teal entries', () => {
    expect(ACCENT_CLASSES).toHaveProperty('purple')
    expect(ACCENT_CLASSES).toHaveProperty('teal')
  })

  const REQUIRED_KEYS = [
    'bg', 'bgHover', 'bgLight', 'bgLighter', 'bgLightest',
    'text', 'text300', 'text300_80',
    'border', 'borderLight', 'borderHover',
    'gradient', 'gradientText', 'glow',
    'borderBottom', 'tabActive',
  ] as const

  for (const color of ['purple', 'teal'] as AccentColor[]) {
    describe(`${color} palette`, () => {
      for (const key of REQUIRED_KEYS) {
        it(`has non-empty '${key}'`, () => {
          const value = ACCENT_CLASSES[color][key]
          expect(typeof value).toBe('string')
          expect(value.length).toBeGreaterThan(0)
        })
      }

      it('classes reference the correct color name', () => {
        expect(ACCENT_CLASSES[color].bg).toContain(color)
        expect(ACCENT_CLASSES[color].text).toContain(color)
      })
    })
  }
})
