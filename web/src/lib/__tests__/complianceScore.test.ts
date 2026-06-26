/**
 * Tests for lib/complianceScore.ts — compliance score aggregation.
 */
import { describe, it, expect } from 'vitest'
import {
  buildComplianceScoreSummary,
  DEMO_COMPLIANCE_SCORE,
  DEMO_COMPLIANCE_BREAKDOWN,
} from '../complianceScore'
import type { KubescapeClusterStatus } from '../../hooks/useKubescape'
import type { KyvernoClusterStatus } from '../../hooks/useKyverno'

function makeKubescape(overrides: Partial<KubescapeClusterStatus> = {}): KubescapeClusterStatus {
  return {
    installed: true,
    totalControls: 100,
    passedControls: 80,
    failedControls: 20,
    overallScore: 80,
    ...overrides,
  }
}

function makeKyverno(overrides: Partial<KyvernoClusterStatus> = {}): KyvernoClusterStatus {
  return {
    installed: true,
    totalPolicies: 50,
    totalViolations: 5,
    ...overrides,
  }
}

describe('buildComplianceScoreSummary — fallback when no data', () => {
  it('returns demo fallback when both inputs are empty', () => {
    const result = buildComplianceScoreSummary({ kubescapeStatuses: {}, kyvernoStatuses: {} })
    expect(result.usingFallback).toBe(true)
    expect(result.score).toBe(DEMO_COMPLIANCE_SCORE)
    expect(result.breakdown).toEqual(DEMO_COMPLIANCE_BREAKDOWN)
  })

  it('returns fallback when kubescape not installed and no kyverno', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: { prod: makeKubescape({ installed: false }) },
      kyvernoStatuses: {},
    })
    expect(result.usingFallback).toBe(true)
  })

  it('returns fallback when kubescape totalControls is 0', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: { prod: makeKubescape({ totalControls: 0 }) },
      kyvernoStatuses: {},
    })
    expect(result.usingFallback).toBe(true)
  })

  it('returns fallback when kyverno not installed', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: { prod: makeKyverno({ installed: false }) },
    })
    expect(result.usingFallback).toBe(true)
  })

  it('returns fallback when kyverno has 0 totalPolicies', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: { prod: makeKyverno({ totalPolicies: 0 }) },
    })
    expect(result.usingFallback).toBe(true)
  })
})

describe('buildComplianceScoreSummary — kubescape only', () => {
  it('averages scores across multiple clusters', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 60 }),
        b: makeKubescape({ overallScore: 80 }),
      },
      kyvernoStatuses: {},
    })
    expect(result.usingFallback).toBe(false)
    const ks = result.breakdown.find(b => b.name === 'Kubescape')
    expect(ks?.value).toBe(70) // avg(60,80)
    expect(result.score).toBe(70)
  })

  it('single cluster score passes through', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: { prod: makeKubescape({ overallScore: 92 }) },
      kyvernoStatuses: {},
    })
    expect(result.breakdown[0].value).toBe(92)
  })
})

describe('buildComplianceScoreSummary — kyverno only', () => {
  it('100 when no violations', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: { prod: makeKyverno({ totalPolicies: 40, totalViolations: 0 }) },
    })
    expect(result.usingFallback).toBe(false)
    const kv = result.breakdown.find(b => b.name === 'Kyverno')
    expect(kv?.value).toBe(100)
  })

  it('calculates violation rate correctly', () => {
    // 10 violations / 100 policies = 10% violation rate → score 90
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: { prod: makeKyverno({ totalPolicies: 100, totalViolations: 10 }) },
    })
    const kv = result.breakdown.find(b => b.name === 'Kyverno')
    expect(kv?.value).toBe(90)
  })

  it('aggregates across multiple clusters', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 100, totalViolations: 50 }),
        b: makeKyverno({ totalPolicies: 100, totalViolations: 0 }),
      },
    })
    // total: 200 policies, 50 violations → score = round(100 - 50/200*100) = 75
    const kv = result.breakdown.find(b => b.name === 'Kyverno')
    expect(kv?.value).toBe(75)
  })

  it('clamps to 0 when violations > policies', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: { prod: makeKyverno({ totalPolicies: 10, totalViolations: 200 }) },
    })
    const kv = result.breakdown.find(b => b.name === 'Kyverno')
    expect(kv?.value).toBeGreaterThanOrEqual(0)
  })
})

describe('buildComplianceScoreSummary — combined kubescape + kyverno', () => {
  it('averages both scores for overall', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: { prod: makeKubescape({ overallScore: 80 }) },
      kyvernoStatuses: { prod: makeKyverno({ totalPolicies: 100, totalViolations: 0 }) },
    })
    // Kubescape:80, Kyverno:100 → avg = 90
    expect(result.score).toBe(90)
    expect(result.breakdown).toHaveLength(2)
    expect(result.usingFallback).toBe(false)
  })
})

describe('buildComplianceScoreSummary — selectedClusters filter', () => {
  it('excludes clusters not in selectedClusters', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        prod: makeKubescape({ overallScore: 90 }),
        staging: makeKubescape({ overallScore: 50 }),
      },
      kyvernoStatuses: {},
      selectedClusters: ['prod'],
    })
    const ks = result.breakdown.find(b => b.name === 'Kubescape')
    expect(ks?.value).toBe(90)
  })

  it('includes all clusters when selectedClusters is empty array', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 60 }),
        b: makeKubescape({ overallScore: 80 }),
      },
      kyvernoStatuses: {},
      selectedClusters: [],
    })
    const ks = result.breakdown.find(b => b.name === 'Kubescape')
    expect(ks?.value).toBe(70)
  })

  it('returns fallback when selectedClusters excludes all with data', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: { prod: makeKubescape({ overallScore: 80 }) },
      kyvernoStatuses: {},
      selectedClusters: ['dev'],
    })
    expect(result.usingFallback).toBe(true)
  })

  it('kyverno respects selectedClusters filter', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        prod: makeKyverno({ totalPolicies: 100, totalViolations: 0 }),
        dev: makeKyverno({ totalPolicies: 100, totalViolations: 100 }),
      },
      selectedClusters: ['prod'],
    })
    const kv = result.breakdown.find(b => b.name === 'Kyverno')
    expect(kv?.value).toBe(100)
  })
})
