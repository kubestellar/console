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
})
