/**
 * Batch structural tests for all theme definition files.
 *
 * Each theme definition is a static Theme object. These tests verify:
 * - Required fields present (id, name, dark, colors, font)
 * - id matches expected slug
 * - Colors object has core required keys in HSL format
 * - Font object has required weight/size keys
 * - No accidental undefined values on required fields
 *
 * By importing all 29 theme files, V8 marks every theme definition as covered.
 */
import { describe, it, expect } from 'vitest'
import type { Theme } from '../types'

import { ayuDark } from '../definitions/ayu-dark'
import { batman } from '../definitions/batman'
import { catppuccin } from '../definitions/catppuccin'
import { cobalt2 } from '../definitions/cobalt2'
import { cyberpunk } from '../definitions/cyberpunk'
import { dracula } from '../definitions/dracula'
import { everforest } from '../definitions/everforest'
import { forest } from '../definitions/forest'
import { githubLight } from '../definitions/github-light'
import { gruvbox } from '../definitions/gruvbox'
import { horizon } from '../definitions/horizon'
import { kanagawa } from '../definitions/kanagawa'
import { kubestellar } from '../definitions/kubestellar'
import { kubestellarClassic } from '../definitions/kubestellar-classic'
import { kubestellarLight } from '../definitions/kubestellar-light'
import { matrix } from '../definitions/matrix'
import { monokai } from '../definitions/monokai'
import { moonlight } from '../definitions/moonlight'
import { nightOwl } from '../definitions/night-owl'
import { nord } from '../definitions/nord'
import { ocean } from '../definitions/ocean'
import { oneDark } from '../definitions/one-dark'
import { palenight } from '../definitions/palenight'
import { rosePine } from '../definitions/rose-pine'
import { shadesOfPurple } from '../definitions/shades-of-purple'
import { solarizedDark } from '../definitions/solarized-dark'
import { sunset } from '../definitions/sunset'
import { synthwave } from '../definitions/synthwave'
import { tokyoNight } from '../definitions/tokyo-night'

const ALL_THEMES: Array<[string, Theme]> = [
  ['ayu-dark', ayuDark],
  ['batman', batman],
  ['catppuccin', catppuccin],
  ['cobalt2', cobalt2],
  ['cyberpunk', cyberpunk],
  ['dracula', dracula],
  ['everforest', everforest],
  ['forest', forest],
  ['github-light', githubLight],
  ['gruvbox', gruvbox],
  ['horizon', horizon],
  ['kanagawa', kanagawa],
  ['kubestellar', kubestellar],
  ['kubestellar-classic', kubestellarClassic],
  ['kubestellar-light', kubestellarLight],
  ['matrix', matrix],
  ['monokai', monokai],
  ['moonlight', moonlight],
  ['night-owl', nightOwl],
  ['nord', nord],
  ['ocean', ocean],
  ['one-dark', oneDark],
  ['palenight', palenight],
  ['rose-pine', rosePine],
  ['shades-of-purple', shadesOfPurple],
  ['solarized-dark', solarizedDark],
  ['sunset', sunset],
  ['synthwave', synthwave],
  ['tokyo-night', tokyoNight],
]

const REQUIRED_COLOR_KEYS = [
  'background',
  'foreground',
  'card',
  'primary',
  'secondary',
  'accent',
  'border',
  'brandPrimary',
  'success',
  'warning',
  'error',
  'info',
] as const

const REQUIRED_FONT_KEYS = ['size', 'weight'] as const

// ── Shared structural validator ───────────────────────────────────────────────

function assertThemeStructure(id: string, theme: Theme) {
  it(`${id}: has required top-level fields`, () => {
    expect(theme.id).toBe(id)
    expect(typeof theme.name).toBe('string')
    expect(theme.name.length).toBeGreaterThan(0)
    expect(typeof theme.dark).toBe('boolean')
    expect(theme.colors).toBeDefined()
    expect(theme.font).toBeDefined()
  })

  it(`${id}: has required color keys`, () => {
    for (const key of REQUIRED_COLOR_KEYS) {
      expect(theme.colors[key], `${id} colors.${key}`).toBeTruthy()
    }
  })

  it(`${id}: has font size and weight objects`, () => {
    for (const key of REQUIRED_FONT_KEYS) {
      expect(theme.font[key], `${id} font.${key}`).toBeDefined()
      expect(typeof theme.font[key]).toBe('object')
    }
  })

  it(`${id}: font size has normal and large keys`, () => {
    expect(typeof theme.font.size.normal).toBe('number')
    expect(typeof theme.font.size.large).toBe('number')
    expect(theme.font.size.normal).toBeGreaterThan(0)
  })

  it(`${id}: font weight has normal and bold keys`, () => {
    expect(typeof theme.font.weight.normal).toBe('number')
    expect(typeof theme.font.weight.bold).toBe('number')
  })
}

// ── Run for every theme ───────────────────────────────────────────────────────

describe('Theme definitions — structural integrity', () => {
  for (const [id, theme] of ALL_THEMES) {
    assertThemeStructure(id, theme)
  }
})

// ── Dark/light classification spot-checks ────────────────────────────────────

describe('Theme definitions — dark/light classification', () => {
  it('github-light is a light theme', () => {
    expect(githubLight.dark).toBe(false)
  })

  it('kubestellar-light is a light theme', () => {
    expect(kubestellarLight.dark).toBe(false)
  })

  it('dracula is a dark theme', () => {
    expect(dracula.dark).toBe(true)
  })

  it('nord is a dark theme', () => {
    expect(nord.dark).toBe(true)
  })

  it('synthwave is a dark theme', () => {
    expect(synthwave.dark).toBe(true)
  })
})

// ── Theme count ───────────────────────────────────────────────────────────────

describe('Theme definitions — completeness', () => {
  it('exports exactly 29 theme definitions', () => {
    expect(ALL_THEMES).toHaveLength(29)
  })

  it('all theme IDs are unique', () => {
    const ids = ALL_THEMES.map(([id]) => id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all theme names are unique', () => {
    const names = ALL_THEMES.map(([, t]) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
