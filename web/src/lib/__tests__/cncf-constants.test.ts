import { describe, it, expect } from 'vitest'
import {
  CNCF_CATEGORY_GRADIENTS,
  CNCF_CATEGORY_ICONS,
  MATURITY_CONFIG,
  DIFFICULTY_CONFIG,
} from '../../lib/cncf-constants'

describe('CNCF_CATEGORY_GRADIENTS', () => {
  it('has entries for core CNCF categories', () => {
    const expectedCategories = [
      'Observability',
      'Orchestration',
      'Runtime',
      'Provisioning',
      'Security',
      'Service Mesh',
      'Networking',
      'Storage',
    ]
    for (const cat of expectedCategories) {
      expect(CNCF_CATEGORY_GRADIENTS).toHaveProperty(cat)
    }
  })

  it('each gradient entry is a tuple of two CSS var strings', () => {
    for (const [, gradient] of Object.entries(CNCF_CATEGORY_GRADIENTS)) {
      expect(gradient).toHaveLength(2)
      expect(gradient[0]).toMatch(/^var\(--/)
      expect(gradient[1]).toMatch(/^var\(--/)
    }
  })
})

describe('CNCF_CATEGORY_ICONS', () => {
  it('has an SVG path for every gradient category', () => {
    for (const key of Object.keys(CNCF_CATEGORY_GRADIENTS)) {
      expect(CNCF_CATEGORY_ICONS).toHaveProperty(key)
      expect(typeof CNCF_CATEGORY_ICONS[key]).toBe('string')
      expect(CNCF_CATEGORY_ICONS[key].length).toBeGreaterThan(0)
    }
  })
})

describe('MATURITY_CONFIG', () => {
  it('has graduated, incubating, and sandbox entries', () => {
    expect(MATURITY_CONFIG).toHaveProperty('graduated')
    expect(MATURITY_CONFIG).toHaveProperty('incubating')
    expect(MATURITY_CONFIG).toHaveProperty('sandbox')
  })

  it('each entry has color, bg, border, and label', () => {
    for (const [, config] of Object.entries(MATURITY_CONFIG)) {
      expect(config).toHaveProperty('color')
      expect(config).toHaveProperty('bg')
      expect(config).toHaveProperty('border')
      expect(config).toHaveProperty('label')
      expect(typeof config.label).toBe('string')
    }
  })
})

describe('DIFFICULTY_CONFIG', () => {
  it('has beginner, intermediate, and advanced entries', () => {
    expect(DIFFICULTY_CONFIG).toHaveProperty('beginner')
    expect(DIFFICULTY_CONFIG).toHaveProperty('intermediate')
    expect(DIFFICULTY_CONFIG).toHaveProperty('advanced')
  })

  it('each entry has color and bg', () => {
    for (const [, config] of Object.entries(DIFFICULTY_CONFIG)) {
      expect(config).toHaveProperty('color')
      expect(config).toHaveProperty('bg')
    }
  })
})
