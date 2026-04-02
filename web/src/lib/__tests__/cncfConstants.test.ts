import { describe, it, expect } from 'vitest'
import {
  CNCF_CATEGORY_GRADIENTS,
  CNCF_CATEGORY_ICONS,
  MATURITY_CONFIG,
  DIFFICULTY_CONFIG,
} from '../cncf-constants'

describe('CNCF_CATEGORY_GRADIENTS', () => {
  it('has gradient tuples for known categories', () => {
    const expectedCategories = ['Observability', 'Orchestration', 'Runtime', 'Provisioning', 'Security', 'Service Mesh', 'Storage']
    for (const cat of expectedCategories) {
      expect(CNCF_CATEGORY_GRADIENTS[cat]).toBeDefined()
      expect(CNCF_CATEGORY_GRADIENTS[cat]).toHaveLength(2)
    }
  })
})

describe('CNCF_CATEGORY_ICONS', () => {
  it('has SVG path strings for known categories', () => {
    expect(typeof CNCF_CATEGORY_ICONS['Observability']).toBe('string')
    expect(typeof CNCF_CATEGORY_ICONS['Security']).toBe('string')
    expect(CNCF_CATEGORY_ICONS['Observability'].length).toBeGreaterThan(0)
  })
})

describe('MATURITY_CONFIG', () => {
  it('has config for graduated, incubating, sandbox', () => {
    expect(MATURITY_CONFIG.graduated.label).toBe('Graduated')
    expect(MATURITY_CONFIG.incubating.label).toBe('Incubating')
    expect(MATURITY_CONFIG.sandbox.label).toBe('Sandbox')
  })

  it('has color classes', () => {
    for (const config of Object.values(MATURITY_CONFIG)) {
      expect(config.color).toBeTruthy()
      expect(config.bg).toBeTruthy()
      expect(config.border).toBeTruthy()
    }
  })
})

describe('DIFFICULTY_CONFIG', () => {
  it('has config for beginner, intermediate, advanced', () => {
    expect(DIFFICULTY_CONFIG.beginner.color).toBeTruthy()
    expect(DIFFICULTY_CONFIG.intermediate.color).toBeTruthy()
    expect(DIFFICULTY_CONFIG.advanced.color).toBeTruthy()
  })

  it('has bg classes for all difficulty levels', () => {
    for (const config of Object.values(DIFFICULTY_CONFIG)) {
      expect(config.bg).toBeTruthy()
      expect(typeof config.bg).toBe('string')
    }
  })

  it('has exactly three difficulty levels', () => {
    const keys = Object.keys(DIFFICULTY_CONFIG)
    expect(keys).toHaveLength(3)
    expect(keys).toEqual(expect.arrayContaining(['beginner', 'intermediate', 'advanced']))
  })

  it('returns undefined for unknown difficulty level', () => {
    expect(DIFFICULTY_CONFIG['expert' as keyof typeof DIFFICULTY_CONFIG]).toBeUndefined()
  })
})

describe('CNCF_CATEGORY_GRADIENTS - full coverage', () => {
  const ALL_GRADIENT_CATEGORIES = [
    'Observability', 'Orchestration', 'Runtime', 'Provisioning',
    'Security', 'Service Mesh', 'App Definition', 'Serverless',
    'Storage', 'Streaming', 'Networking',
  ]

  it('contains exactly 11 categories', () => {
    expect(Object.keys(CNCF_CATEGORY_GRADIENTS)).toHaveLength(11)
  })

  it.each(ALL_GRADIENT_CATEGORIES)('has a valid gradient tuple for "%s"', (category) => {
    const gradient = CNCF_CATEGORY_GRADIENTS[category]
    expect(gradient).toBeDefined()
    expect(gradient).toHaveLength(2)
    expect(gradient[0]).toContain('var(--cncf-')
    expect(gradient[1]).toContain('var(--cncf-')
  })

  it('gradient start and end use matching CSS variable naming pattern', () => {
    for (const [, [start, end]] of Object.entries(CNCF_CATEGORY_GRADIENTS)) {
      const startBase = start.replace('-start)', '')
      const endBase = end.replace('-end)', '')
      expect(startBase).toBe(endBase)
    }
  })

  it('returns undefined for unknown category', () => {
    expect(CNCF_CATEGORY_GRADIENTS['Unknown']).toBeUndefined()
  })
})

describe('CNCF_CATEGORY_ICONS - full coverage', () => {
  const ALL_ICON_CATEGORIES = [
    'Observability', 'Orchestration', 'Runtime', 'Provisioning',
    'Security', 'Service Mesh', 'App Definition', 'Serverless',
    'Storage', 'Streaming', 'Networking',
  ]

  it('contains exactly 11 icon categories', () => {
    expect(Object.keys(CNCF_CATEGORY_ICONS)).toHaveLength(11)
  })

  it.each(ALL_ICON_CATEGORIES)('has a non-empty SVG path for "%s"', (category) => {
    const path = CNCF_CATEGORY_ICONS[category]
    expect(typeof path).toBe('string')
    expect(path.length).toBeGreaterThan(0)
    // SVG paths typically start with M (moveto)
    expect(path).toMatch(/^[A-Z]/)
  })

  it('icon categories match gradient categories exactly', () => {
    const gradientKeys = Object.keys(CNCF_CATEGORY_GRADIENTS).sort()
    const iconKeys = Object.keys(CNCF_CATEGORY_ICONS).sort()
    expect(iconKeys).toEqual(gradientKeys)
  })

  it('returns undefined for unknown category', () => {
    expect(CNCF_CATEGORY_ICONS['Databases']).toBeUndefined()
  })
})

describe('MATURITY_CONFIG - additional coverage', () => {
  it('has exactly three maturity levels', () => {
    expect(Object.keys(MATURITY_CONFIG)).toHaveLength(3)
  })

  it('each maturity level has all four style properties', () => {
    for (const [key, config] of Object.entries(MATURITY_CONFIG)) {
      expect(config).toHaveProperty('color')
      expect(config).toHaveProperty('bg')
      expect(config).toHaveProperty('border')
      expect(config).toHaveProperty('label')
      // Label should be capitalized version of key
      expect(config.label.toLowerCase()).toBe(key)
    }
  })

  it('labels are properly capitalized', () => {
    expect(MATURITY_CONFIG.graduated.label).toBe('Graduated')
    expect(MATURITY_CONFIG.incubating.label).toBe('Incubating')
    expect(MATURITY_CONFIG.sandbox.label).toBe('Sandbox')
  })

  it('colors use Tailwind text- prefix', () => {
    for (const config of Object.values(MATURITY_CONFIG)) {
      expect(config.color).toMatch(/^text-/)
    }
  })

  it('backgrounds use Tailwind bg- prefix', () => {
    for (const config of Object.values(MATURITY_CONFIG)) {
      expect(config.bg).toMatch(/^bg-/)
    }
  })

  it('borders use Tailwind border- prefix', () => {
    for (const config of Object.values(MATURITY_CONFIG)) {
      expect(config.border).toMatch(/^border-/)
    }
  })

  it('returns undefined for unknown maturity level', () => {
    expect(MATURITY_CONFIG['archived' as keyof typeof MATURITY_CONFIG]).toBeUndefined()
  })
})
