import { describe, it, expect } from 'vitest'
import { classifyScaleError, buildLabelSelector } from '../helpers'

describe('classifyScaleError', () => {
  it('returns generic key for empty string', () => {
    expect(classifyScaleError('')).toBe('drilldown.scale.failedGeneric')
  })

  it.each([
    ['forbidden: user cannot patch', 'drilldown.scale.failedForbidden'],
    ['cannot patch deployments.apps', 'drilldown.scale.failedForbidden'],
    ['Unauthorized', 'drilldown.scale.failedForbidden'],
    ['deployments.apps "nginx" not found', 'drilldown.scale.failedNotFound'],
    ['NotFound', 'drilldown.scale.failedNotFound'],
    ['Invalid value: -1: must be non-negative', 'drilldown.scale.failedInvalid'],
    ['spec.replicas: value out of range', 'drilldown.scale.failedInvalid'],
    ['the object has been modified; please apply your changes', 'drilldown.scale.failedConflict'],
    ['Operation cannot be fulfilled: conflict', 'drilldown.scale.failedConflict'],
    ['context deadline exceeded', 'drilldown.scale.failedTimeout'],
    ['request timed out', 'drilldown.scale.failedTimeout'],
    ['unknown wire error', 'drilldown.scale.failedGeneric'],
  ] as const)('classifies %j → %s', (raw, expected) => {
    expect(classifyScaleError(raw)).toBe(expected)
  })

  it('is case-insensitive', () => {
    expect(classifyScaleError('FORBIDDEN')).toBe('drilldown.scale.failedForbidden')
    expect(classifyScaleError('Timeout')).toBe('drilldown.scale.failedTimeout')
  })

  it('privileges forbidden over other tokens when both appear', () => {
    // Regression guard: check order matters for i18n stability.
    expect(classifyScaleError('forbidden: not found')).toBe('drilldown.scale.failedForbidden')
  })

  it('returns generic for deadline-unrelated deadline word', () => {
    expect(classifyScaleError('context deadline exceeded')).toBe('drilldown.scale.failedTimeout')
  })
})

describe('buildLabelSelector', () => {
  it('returns empty string when no inputs given', () => {
    expect(buildLabelSelector()).toBe('')
    expect(buildLabelSelector({}, [])).toBe('')
  })

  it('serializes matchLabels as key=value pairs', () => {
    expect(buildLabelSelector({ app: 'nginx', tier: 'frontend' }))
      .toBe('app=nginx,tier=frontend')
  })

  it('serializes In expressions', () => {
    expect(buildLabelSelector(undefined, [
      { key: 'env', operator: 'In', values: ['prod', 'stage'] },
    ])).toBe('env in (prod,stage)')
  })

  it('serializes NotIn expressions', () => {
    expect(buildLabelSelector(undefined, [
      { key: 'env', operator: 'NotIn', values: ['dev'] },
    ])).toBe('env notin (dev)')
  })

  it('serializes Exists as bare key', () => {
    expect(buildLabelSelector(undefined, [
      { key: 'canary', operator: 'Exists' },
    ])).toBe('canary')
  })

  it('serializes DoesNotExist with leading !', () => {
    expect(buildLabelSelector(undefined, [
      { key: 'canary', operator: 'DoesNotExist' },
    ])).toBe('!canary')
  })

  it('combines matchLabels and matchExpressions with commas', () => {
    expect(buildLabelSelector(
      { app: 'nginx' },
      [{ key: 'env', operator: 'In', values: ['prod', 'stage'] }],
    )).toBe('app=nginx,env in (prod,stage)')
  })

  it('handles In/NotIn with empty values array', () => {
    expect(buildLabelSelector(undefined, [
      { key: 'env', operator: 'In', values: [] },
    ])).toBe('env in ()')
  })

  it('handles In/NotIn with undefined values', () => {
    expect(buildLabelSelector(undefined, [
      { key: 'env', operator: 'In' },
    ])).toBe('env in ()')
  })

  it('coerces non-string matchLabel values via template', () => {
    expect(buildLabelSelector({ replicas: 3 as unknown as string })).toBe('replicas=3')
  })
})
