import { describe, it, expect } from 'vitest'
import { validateInvariantRegistry } from '../loadInvariants'
import type { VisualLoginInvariantRegistry } from '../invariantTypes'

describe('validateInvariantRegistry', () => {
  function validInvariant(overrides = {}) {
    return {
      id: 'VL-001',
      area: 'auth',
      severity: 'critical' as const,
      description: 'Login page must render',
      required: ['login-form'],
      forbidden: ['error-boundary'],
      ...overrides,
    }
  }

  function registry(invariants: unknown[]): VisualLoginInvariantRegistry {
    return { invariants } as VisualLoginInvariantRegistry
  }

  describe('valid registries', () => {
    it('returns ok for a single valid invariant', () => {
      const result = validateInvariantRegistry(registry([validInvariant()]))
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.ids).toEqual(['VL-001'])
    })

    it('returns ok for multiple valid invariants', () => {
      const result = validateInvariantRegistry(registry([
        validInvariant({ id: 'VL-001' }),
        validInvariant({ id: 'VL-002', severity: 'major' }),
        validInvariant({ id: 'VL-003', severity: 'minor' }),
      ]))
      expect(result.ok).toBe(true)
      expect(result.ids).toEqual(['VL-001', 'VL-002', 'VL-003'])
    })

    it('accepts all valid severity levels', () => {
      for (const severity of ['critical', 'major', 'minor']) {
        const result = validateInvariantRegistry(registry([validInvariant({ id: `sev-${severity}`, severity })]))
        expect(result.ok).toBe(true)
      }
    })
  })

  describe('missing or malformed registry', () => {
    it('rejects null registry', () => {
      const result = validateInvariantRegistry(null as unknown as VisualLoginInvariantRegistry)
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toContain('invariants array')
    })

    it('rejects undefined registry', () => {
      const result = validateInvariantRegistry(undefined as unknown as VisualLoginInvariantRegistry)
      expect(result.ok).toBe(false)
    })

    it('rejects registry with non-array invariants', () => {
      const result = validateInvariantRegistry({ invariants: 'not-an-array' } as unknown as VisualLoginInvariantRegistry)
      expect(result.ok).toBe(false)
    })

    it('rejects non-object invariant entry', () => {
      const result = validateInvariantRegistry(registry(['string-entry']))
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toContain('must be an object')
    })

    it('rejects null invariant entry', () => {
      const result = validateInvariantRegistry(registry([null]))
      expect(result.ok).toBe(false)
    })
  })

  describe('field validation', () => {
    it('rejects invariant without id', () => {
      const result = validateInvariantRegistry(registry([validInvariant({ id: undefined })]))
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toContain('missing a string id')
    })

    it('rejects invariant with numeric id', () => {
      const result = validateInvariantRegistry(registry([validInvariant({ id: 42 })]))
      expect(result.ok).toBe(false)
    })

    it('rejects invariant without area', () => {
      const result = validateInvariantRegistry(registry([validInvariant({ area: undefined })]))
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toContain('area is required')
    })

    it('rejects invalid severity', () => {
      const result = validateInvariantRegistry(registry([validInvariant({ severity: 'high' })]))
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toContain('severity must be critical, major, or minor')
    })

    it('rejects missing description', () => {
      const result = validateInvariantRegistry(registry([validInvariant({ description: undefined })]))
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toContain('description is required')
    })

    it('rejects non-array required field', () => {
      const result = validateInvariantRegistry(registry([validInvariant({ required: 'not-array' })]))
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toContain('required must be an array')
    })

    it('rejects non-array forbidden field', () => {
      const result = validateInvariantRegistry(registry([validInvariant({ forbidden: {} })]))
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toContain('forbidden must be an array')
    })
  })

  describe('duplicate detection', () => {
    it('detects duplicate ids', () => {
      const result = validateInvariantRegistry(registry([
        validInvariant({ id: 'VL-DUP' }),
        validInvariant({ id: 'VL-DUP' }),
      ]))
      expect(result.ok).toBe(false)
      expect(result.errors).toContainEqual(expect.stringContaining('Duplicate invariant id: VL-DUP'))
    })

    it('collects all ids even when duplicated', () => {
      const result = validateInvariantRegistry(registry([
        validInvariant({ id: 'VL-DUP' }),
        validInvariant({ id: 'VL-DUP' }),
      ]))
      expect(result.ids).toEqual(['VL-DUP', 'VL-DUP'])
    })
  })

  describe('multiple errors', () => {
    it('accumulates all errors in a single pass', () => {
      const result = validateInvariantRegistry(registry([
        validInvariant({ id: undefined }),
        validInvariant({ id: 'VL-X', severity: 'wrong', area: undefined }),
      ]))
      expect(result.ok).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(3)
    })
  })
})
