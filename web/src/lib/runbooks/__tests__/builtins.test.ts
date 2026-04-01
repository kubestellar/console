import { describe, it, expect } from 'vitest'
import { BUILTIN_RUNBOOKS } from '../builtins'

describe('BUILTIN_RUNBOOKS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(BUILTIN_RUNBOOKS)).toBe(true)
    expect(BUILTIN_RUNBOOKS.length).toBeGreaterThan(0)
  })

  it('each runbook has required fields', () => {
    for (const rb of BUILTIN_RUNBOOKS) {
      expect(rb.id).toBeTruthy()
      expect(rb.title).toBeTruthy()
      expect(rb.description).toBeTruthy()
      expect(Array.isArray(rb.triggers)).toBe(true)
      expect(rb.triggers.length).toBeGreaterThan(0)
      expect(Array.isArray(rb.evidenceSteps)).toBe(true)
      expect(rb.evidenceSteps.length).toBeGreaterThan(0)
      expect(rb.analysisPrompt).toBeTruthy()
    }
  })

  it('each evidence step has required fields', () => {
    for (const rb of BUILTIN_RUNBOOKS) {
      for (const step of rb.evidenceSteps) {
        expect(step.id).toBeTruthy()
        expect(step.label).toBeTruthy()
        expect(step.source).toBeTruthy()
        expect(step.tool).toBeTruthy()
        expect(step.args).toBeDefined()
      }
    }
  })

  it('has unique IDs', () => {
    const ids = BUILTIN_RUNBOOKS.map(rb => rb.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes pod crash investigation', () => {
    expect(BUILTIN_RUNBOOKS.some(rb => rb.id === 'pod-crash-investigation')).toBe(true)
  })

  it('analysis prompts contain template variables', () => {
    for (const rb of BUILTIN_RUNBOOKS) {
      expect(rb.analysisPrompt).toContain('{{evidence}}')
    }
  })
})
