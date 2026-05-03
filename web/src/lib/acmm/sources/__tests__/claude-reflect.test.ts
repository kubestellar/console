import { describe, it, expect } from 'vitest'
import { claudeReflectSource } from '../claude-reflect'

describe('claudeReflectSource', () => {
  it('has the correct source metadata', () => {
    expect(claudeReflectSource.id).toBe('claude-reflect')
    expect(claudeReflectSource.name).toBe('Claude Reflect')
    expect(claudeReflectSource.definesLevels).toBe(false)
    expect(claudeReflectSource.url).toContain('github.com')
    expect(claudeReflectSource.citation).toBeTruthy()
  })

  it('does not define levels', () => {
    expect(claudeReflectSource.levels).toBeUndefined()
  })

  it('has a non-empty criteria array', () => {
    expect(claudeReflectSource.criteria.length).toBeGreaterThan(0)
  })

  it('all criteria have required fields', () => {
    for (const c of claudeReflectSource.criteria) {
      expect(c.id).toBeTruthy()
      expect(c.source).toBe('claude-reflect')
      expect(typeof c.level).toBe('number')
      expect(c.level).toBeGreaterThanOrEqual(0)
      expect(c.level).toBeLessThanOrEqual(6)
      expect(c.name).toBeTruthy()
      expect(c.description).toBeTruthy()
      expect(c.rationale).toBeTruthy()
      expect(c.detection).toBeDefined()
    }
  })

  it('all criteria IDs start with claude-reflect:', () => {
    for (const c of claudeReflectSource.criteria) {
      expect(c.id.startsWith('claude-reflect:')).toBe(true)
    }
  })

  it('criteria IDs are unique', () => {
    const ids = claudeReflectSource.criteria.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all criteria have valid detection types', () => {
    for (const c of claudeReflectSource.criteria) {
      expect(c.detection.type).toBe('any-of')
      const patterns = Array.isArray(c.detection.pattern)
        ? c.detection.pattern
        : [c.detection.pattern]
      expect(patterns.length).toBeGreaterThan(0)
    }
  })

  it('all criteria are in self-tuning category', () => {
    for (const c of claudeReflectSource.criteria) {
      expect(c.category).toBe('self-tuning')
    }
  })
})
