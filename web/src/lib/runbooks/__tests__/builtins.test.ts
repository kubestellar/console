import { describe, it, expect } from 'vitest'
import { BUILTIN_RUNBOOKS, findRunbookForCondition } from '../builtins'

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

describe('findRunbookForCondition', () => {
  it('finds a runbook by exact condition type', () => {
    const rb = findRunbookForCondition('pod_crash')
    expect(rb).toBeDefined()
    expect(rb?.id).toBe('pod-crash-investigation')
  })

  it('finds node_not_ready runbook', () => {
    const rb = findRunbookForCondition('node_not_ready')
    expect(rb).toBeDefined()
    expect(rb?.id).toBe('node-not-ready-investigation')
  })

  it('finds dns_failure runbook', () => {
    const rb = findRunbookForCondition('dns_failure')
    expect(rb).toBeDefined()
    expect(rb?.id).toBe('dns-failure-investigation')
  })

  it('finds cluster_unreachable runbook', () => {
    const rb = findRunbookForCondition('cluster_unreachable')
    expect(rb).toBeDefined()
    expect(rb?.id).toBe('cluster-unreachable-investigation')
  })

  it('finds memory_pressure runbook', () => {
    const rb = findRunbookForCondition('memory_pressure')
    expect(rb).toBeDefined()
    expect(rb?.id).toBe('memory-pressure-investigation')
  })

  it('returns undefined for unknown condition type', () => {
    expect(findRunbookForCondition('unknown_condition')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(findRunbookForCondition('')).toBeUndefined()
  })

  it('is case-sensitive — does not match uppercase', () => {
    expect(findRunbookForCondition('POD_CRASH')).toBeUndefined()
  })
})
