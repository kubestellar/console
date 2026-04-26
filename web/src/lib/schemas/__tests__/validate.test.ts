import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { validateResponse, validateArrayResponse } from '../validate'

describe('validateResponse', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('returns parsed data on valid input', () => {
    const schema = z.object({ name: z.string(), age: z.number() })
    const data = { name: 'Alice', age: 30 }
    const result = validateResponse(schema, data, '/test')
    expect(result).toEqual({ name: 'Alice', age: 30 })
  })

  it('returns null on invalid input', () => {
    const schema = z.object({ name: z.string() })
    const data = { name: 123 }
    const result = validateResponse(schema, data, '/test')
    expect(result).toBeNull()
  })

  it('logs a warning on validation failure', () => {
    const schema = z.object({ id: z.number() })
    validateResponse(schema, { id: 'not-a-number' }, '/api/users')
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[Zod] API response validation failed for "/api/users"'),
    )
  })

  it('coerces values when the schema supports it', () => {
    const schema = z.object({ count: z.coerce.number() })
    const result = validateResponse(schema, { count: '42' }, '/coerce')
    expect(result).toEqual({ count: 42 })
  })

  it('truncates logged issues when there are more than 5', () => {
    const schema = z.object({
      a: z.string(), b: z.string(), c: z.string(),
      d: z.string(), e: z.string(), f: z.string(), g: z.string(),
    })
    validateResponse(schema, {
      a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7,
    }, '/many-errors')
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('and'),
    )
  })

  it('handles null and undefined data gracefully', () => {
    const schema = z.object({ id: z.number() })
    expect(validateResponse(schema, null, '/null')).toBeNull()
    expect(validateResponse(schema, undefined, '/undefined')).toBeNull()
  })
})

describe('validateArrayResponse', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  const schema = z.object({
    pods: z.array(z.object({ name: z.string() })),
  })

  it('returns original data on valid input', () => {
    const data = { pods: [{ name: 'pod-1' }, { name: 'pod-2' }] }
    const result = validateArrayResponse<{ pods: { name: string }[] }>(
      schema, data, '/pods', 'pods',
    )
    expect(result.pods).toHaveLength(2)
    expect(result.pods[0].name).toBe('pod-1')
  })

  it('returns fallback with empty array on invalid input', () => {
    const result = validateArrayResponse<{ pods: { name: string }[] }>(
      schema, { pods: 'not-an-array' }, '/pods', 'pods',
    )
    expect(result.pods).toEqual([])
  })

  it('returns fallback with correct resultKey on missing data', () => {
    const result = validateArrayResponse<{ nodes: unknown[] }>(
      z.object({ nodes: z.array(z.unknown()) }),
      null,
      '/nodes',
      'nodes',
    )
    expect(result.nodes).toEqual([])
  })

  it('logs warning on validation failure', () => {
    validateArrayResponse(schema, { pods: 123 }, '/pods-bad', 'pods')
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('/pods-bad'),
    )
  })
})
