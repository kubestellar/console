import { describe, it, expect } from 'vitest'
import {
  validateMigration,
  createValidationSummary,
  validateConfig,
  checkFeatureCompatibility,
} from '../validator'

describe('validateMigration', () => {
  it('returns valid for matching empty arrays', () => {
    const result = validateMigration('test', [], [])
    expect(result.isValid).toBe(true)
    expect(result.dataParityPassed).toBe(true)
  })

  it('detects data count mismatch', () => {
    const result = validateMigration('test', [{ id: '1' }], [])
    expect(result.isValid).toBe(false)
    expect(result.issues.some(i => i.message.includes('count mismatch'))).toBe(true)
  })

  it('detects field value mismatch', () => {
    const legacy = [{ id: '1', name: 'foo', status: 'ok' }]
    const unified = [{ id: '1', name: 'bar', status: 'ok' }]
    const result = validateMigration('test', legacy, unified)
    expect(result.issues.some(i => i.message.includes('"name" mismatch'))).toBe(true)
  })

  it('detects missing fields', () => {
    const legacy = [{ id: '1', name: 'foo', extra: 'val' }]
    const unified = [{ id: '1', name: 'foo' }]
    const result = validateMigration('test', legacy, unified)
    expect(result.issues.some(i => i.message.includes('missing'))).toBe(true)
  })

  it('reports extra fields as warnings', () => {
    const legacy = [{ id: '1' }]
    const unified = [{ id: '1', extra: 'val' }]
    const result = validateMigration('test', legacy, unified)
    expect(result.warnings.some(w => w.includes('Extra fields'))).toBe(true)
  })

  it('validates matching data correctly', () => {
    const data = [
      { id: '1', name: 'pod-1', namespace: 'default', cluster: 'c1', status: 'running' },
      { id: '2', name: 'pod-2', namespace: 'kube-system', cluster: 'c2', status: 'pending' },
    ]
    const result = validateMigration('test', data, [...data])
    expect(result.isValid).toBe(true)
    expect(result.dataParityPassed).toBe(true)
  })
})

describe('createValidationSummary', () => {
  it('summarizes multiple validations', () => {
    const validations = {
      card1: {
        isValid: true,
        dataParityPassed: true,
        uiParityPassed: true,
        featureParityPassed: true,
        issues: [],
        warnings: ['minor warning'],
      },
      card2: {
        isValid: false,
        dataParityPassed: false,
        uiParityPassed: true,
        featureParityPassed: true,
        issues: [{ severity: 'error' as const, category: 'data' as const, message: 'count mismatch' }],
        warnings: [],
      },
    }

    const summary = createValidationSummary(validations)
    expect(summary.totalCards).toBe(2)
    expect(summary.validCards).toBe(1)
    expect(summary.invalidCards).toBe(1)
    expect(summary.warnings).toBe(1)
    expect(summary.issues).toHaveLength(1)
  })

  it('handles empty input', () => {
    const summary = createValidationSummary({})
    expect(summary.totalCards).toBe(0)
    expect(summary.validCards).toBe(0)
  })
})

describe('validateConfig', () => {
  it('reports missing required fields', () => {
    const issues = validateConfig('test', {})
    expect(issues.length).toBeGreaterThanOrEqual(4)
    expect(issues.some(i => i.message.includes('type'))).toBe(true)
    expect(issues.some(i => i.message.includes('title'))).toBe(true)
    expect(issues.some(i => i.message.includes('dataSource'))).toBe(true)
    expect(issues.some(i => i.message.includes('content'))).toBe(true)
  })

  it('validates dataSource hook type', () => {
    const issues = validateConfig('test', {
      type: 'card',
      title: 'Test',
      dataSource: { type: 'hook' },
      content: { type: 'list', columns: [] },
    })
    expect(issues.some(i => i.message.includes('hook name is missing'))).toBe(true)
  })

  it('warns about list content without columns', () => {
    const issues = validateConfig('test', {
      type: 'card',
      title: 'Test',
      dataSource: { type: 'static' },
      content: { type: 'list' },
    })
    expect(issues.some(i => i.message.includes('columns'))).toBe(true)
  })

  it('passes for valid config', () => {
    const issues = validateConfig('test', {
      type: 'card',
      title: 'Test',
      dataSource: { type: 'static' },
      content: { type: 'table', columns: [] },
    })
    const errors = issues.filter(i => i.severity === 'error')
    expect(errors).toHaveLength(0)
  })
})

describe('checkFeatureCompatibility', () => {
  it('returns compatible when all features are supported', () => {
    const result = checkFeatureCompatibility('test', ['list-visualization', 'pagination', 'sorting'])
    expect(result.compatible).toBe(true)
    expect(result.missingFeatures).toHaveLength(0)
  })

  it('reports unsupported features', () => {
    const result = checkFeatureCompatibility('test', ['list-visualization', 'custom-widget'])
    expect(result.compatible).toBe(false)
    expect(result.missingFeatures).toContain('custom-widget')
  })

  it('handles empty features list', () => {
    const result = checkFeatureCompatibility('test', [])
    expect(result.compatible).toBe(true)
  })
})
