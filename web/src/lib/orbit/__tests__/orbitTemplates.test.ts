import { describe, it, expect } from 'vitest'
import { ORBIT_TEMPLATES, getApplicableOrbitTemplates } from '../orbitTemplates'

describe('ORBIT_TEMPLATES', () => {
  it('has 5 templates', () => {
    expect(ORBIT_TEMPLATES).toHaveLength(5)
  })

  it('each template has required fields', () => {
    for (const template of ORBIT_TEMPLATES) {
      expect(template.orbitType).toBeTruthy()
      expect(template.title).toBeTruthy()
      expect(template.description).toBeTruthy()
      expect(template.suggestedCadence).toMatch(/^(daily|weekly|monthly)$/)
      expect(template.applicableCategories.length).toBeGreaterThan(0)
      expect(template.steps.length).toBeGreaterThan(0)
    }
  })

  it('each template step has title and description', () => {
    for (const template of ORBIT_TEMPLATES) {
      for (const step of template.steps) {
        expect(step.title).toBeTruthy()
        expect(step.description).toBeTruthy()
      }
    }
  })

  it('has unique orbit types', () => {
    const types = ORBIT_TEMPLATES.map(t => t.orbitType)
    expect(new Set(types).size).toBe(types.length)
  })

  it('covers all 5 orbit types', () => {
    const types = ORBIT_TEMPLATES.map(t => t.orbitType).sort()
    expect(types).toEqual([
      'backup-verification',
      'cert-rotation',
      'health-check',
      'resource-quota',
      'version-drift',
    ])
  })
})

describe('getApplicableOrbitTemplates', () => {
  it('returns all templates for universal category "*"', () => {
    const universal = ORBIT_TEMPLATES.filter(t => t.applicableCategories.includes('*'))
    const result = getApplicableOrbitTemplates(['SomeCategory'])
    // Universal templates always included, plus any matching the category
    expect(result.length).toBeGreaterThanOrEqual(universal.length)
  })

  it('returns security-specific templates for Security category', () => {
    const result = getApplicableOrbitTemplates(['Security'])
    const types = result.map(t => t.orbitType)
    expect(types).toContain('cert-rotation')
  })

  it('returns storage-specific templates for Storage category', () => {
    const result = getApplicableOrbitTemplates(['Storage'])
    const types = result.map(t => t.orbitType)
    expect(types).toContain('backup-verification')
  })

  it('returns universal templates even for unknown category', () => {
    const result = getApplicableOrbitTemplates(['AlienCategory'])
    // Only universal ('*') templates should match
    expect(result.length).toBeGreaterThan(0)
    for (const t of result) {
      expect(t.applicableCategories).toContain('*')
    }
  })

  it('returns universal templates for empty category list', () => {
    const result = getApplicableOrbitTemplates([])
    expect(result.length).toBeGreaterThan(0)
  })
})
