import { describe, it, expect } from 'vitest'
import { fullsendSource } from '../fullsend'

describe('fullsendSource', () => {
  it('has the correct source metadata', () => {
    expect(fullsendSource.id).toBe('fullsend')
    expect(fullsendSource.name).toBe('Fullsend')
    expect(fullsendSource.definesLevels).toBe(false)
    expect(fullsendSource.url).toContain('github.com')
  })

  it('has a non-empty criteria array', () => {
    expect(fullsendSource.criteria.length).toBeGreaterThan(0)
  })

  it('all criteria have required fields', () => {
    for (const c of fullsendSource.criteria) {
      expect(c.id).toBeTruthy()
      expect(c.source).toBe('fullsend')
      expect(typeof c.level).toBe('number')
      expect(c.level).toBeGreaterThanOrEqual(2)
      expect(c.name).toBeTruthy()
      expect(c.description).toBeTruthy()
      expect(c.rationale).toBeTruthy()
      expect(c.detection).toBeDefined()
    }
  })

  it('all criteria IDs start with fullsend:', () => {
    for (const c of fullsendSource.criteria) {
      expect(c.id.startsWith('fullsend:')).toBe(true)
    }
  })

  it('all criteria have valid detection types', () => {
    for (const c of fullsendSource.criteria) {
      expect(c.detection.type).toBe('any-of')
      const patterns = Array.isArray(c.detection.pattern)
        ? c.detection.pattern
        : [c.detection.pattern]
      expect(patterns.length).toBeGreaterThan(0)
    }
  })

  it('criteria IDs are unique', () => {
    const ids = fullsendSource.criteria.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes test-coverage and ci-cd-maturity criteria', () => {
    const ids = fullsendSource.criteria.map((c) => c.id)
    expect(ids).toContain('fullsend:test-coverage')
    expect(ids).toContain('fullsend:ci-cd-maturity')
  })
})
