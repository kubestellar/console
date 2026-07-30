import { describe, it, expect } from 'vitest'
import { agenticEngineeringFrameworkSource } from '../agentic-engineering-framework'

describe('agenticEngineeringFrameworkSource', () => {
  it('has the correct source metadata', () => {
    expect(agenticEngineeringFrameworkSource.id).toBe('agentic-engineering-framework')
    expect(agenticEngineeringFrameworkSource.name).toBe('Agentic Engineering Framework')
    expect(agenticEngineeringFrameworkSource.definesLevels).toBe(false)
    expect(agenticEngineeringFrameworkSource.url).toContain('github.com')
    expect(agenticEngineeringFrameworkSource.citation).toBeTruthy()
  })

  it('does not define levels', () => {
    expect(agenticEngineeringFrameworkSource.levels).toBeUndefined()
  })

  it('has a non-empty criteria array', () => {
    expect(agenticEngineeringFrameworkSource.criteria.length).toBeGreaterThan(0)
  })

  it('all criteria have required fields', () => {
    for (const c of agenticEngineeringFrameworkSource.criteria) {
      expect(c.id).toBeTruthy()
      expect(c.source).toBe('agentic-engineering-framework')
      expect(typeof c.level).toBe('number')
      expect(c.level).toBeGreaterThanOrEqual(0)
      expect(c.level).toBeLessThanOrEqual(6)
      expect(c.name).toBeTruthy()
      expect(c.description).toBeTruthy()
      expect(c.rationale).toBeTruthy()
      expect(c.detection).toBeDefined()
    }
  })

  it('all criteria IDs start with aef:', () => {
    for (const c of agenticEngineeringFrameworkSource.criteria) {
      expect(c.id.startsWith('aef:')).toBe(true)
    }
  })

  it('criteria IDs are unique', () => {
    const ids = agenticEngineeringFrameworkSource.criteria.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all criteria have valid detection types', () => {
    for (const c of agenticEngineeringFrameworkSource.criteria) {
      expect(c.detection.type).toBe('any-of')
      const patterns = Array.isArray(c.detection.pattern)
        ? c.detection.pattern
        : [c.detection.pattern]
      expect(patterns.length).toBeGreaterThan(0)
    }
  })

  it('all criteria are in governance category', () => {
    for (const c of agenticEngineeringFrameworkSource.criteria) {
      expect(c.category).toBe('governance')
    }
  })
})
