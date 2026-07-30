import { describe, expect, it } from 'vitest'

import type { KubescapeClusterStatus } from '../hooks/useKubescape'
import type { KyvernoClusterStatus } from '../hooks/useKyverno'

import {
  DEMO_COMPLIANCE_BREAKDOWN,
  DEMO_COMPLIANCE_SCORE,
  buildComplianceScoreSummary,
} from './complianceScore'

function makeKubescape(
  overrides: Partial<KubescapeClusterStatus> = {},
): KubescapeClusterStatus {
  return {
    cluster: 'c',
    installed: true,
    loading: false,
    overallScore: 80,
    frameworks: [],
    totalControls: 100,
    passedControls: 80,
    failedControls: 20,
    controls: [],
    ...overrides,
  }
}

function makeKyverno(
  overrides: Partial<KyvernoClusterStatus> = {},
): KyvernoClusterStatus {
  return {
    cluster: 'c',
    installed: true,
    loading: false,
    policies: [],
    reports: [],
    totalPolicies: 10,
    totalViolations: 1,
    enforcingCount: 0,
    auditCount: 0,
    ...overrides,
  }
}

describe('DEMO_COMPLIANCE_SCORE / DEMO_COMPLIANCE_BREAKDOWN', () => {
  it('exposes the demo score constant', () => {
    expect(DEMO_COMPLIANCE_SCORE).toBe(85)
  })

  it('exposes a three-item demo breakdown with expected names', () => {
    expect(DEMO_COMPLIANCE_BREAKDOWN).toHaveLength(3)
    expect(DEMO_COMPLIANCE_BREAKDOWN.map((b) => b.name)).toEqual([
      'CIS',
      'NSA',
      'PCI',
    ])
  })

  it('demo breakdown items all have numeric values', () => {
    for (const item of DEMO_COMPLIANCE_BREAKDOWN) {
      expect(typeof item.value).toBe('number')
      expect(Number.isFinite(item.value)).toBe(true)
    }
  })
})

describe('buildComplianceScoreSummary — fallback path', () => {
  it('returns the demo fallback when both kubescape and kyverno statuses are empty', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {},
    })
    expect(result.usingFallback).toBe(true)
    expect(result.score).toBe(DEMO_COMPLIANCE_SCORE)
    expect(result.breakdown).toEqual(DEMO_COMPLIANCE_BREAKDOWN)
  })

  it('returns the demo fallback when all kubescape clusters are uninstalled', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ installed: false }),
      },
      kyvernoStatuses: {},
    })
    expect(result.usingFallback).toBe(true)
    expect(result.score).toBe(DEMO_COMPLIANCE_SCORE)
  })

  it('returns the demo fallback when kubescape clusters have zero controls', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ totalControls: 0 }),
      },
      kyvernoStatuses: {},
    })
    expect(result.usingFallback).toBe(true)
  })

  it('returns the demo fallback when all kyverno clusters are uninstalled', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        a: makeKyverno({ installed: false }),
      },
    })
    expect(result.usingFallback).toBe(true)
  })

  it('returns the demo fallback when kyverno has no policies across clusters', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 0, totalViolations: 0 }),
      },
    })
    expect(result.usingFallback).toBe(true)
  })

  it('returns the demo fallback when selectedClusters filters out every source', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: { a: makeKubescape() },
      kyvernoStatuses: { a: makeKyverno() },
      selectedClusters: ['not-present'],
    })
    expect(result.usingFallback).toBe(true)
  })
})

describe('buildComplianceScoreSummary — kubescape scoring', () => {
  it('averages kubescape overallScore across included clusters', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 80 }),
        b: makeKubescape({ overallScore: 60 }),
      },
      kyvernoStatuses: {},
    })
    expect(result.usingFallback).toBe(false)
    expect(result.breakdown).toEqual([{ name: 'Kubescape', value: 70 }])
    expect(result.score).toBe(70)
  })

  it('rounds the averaged kubescape score', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 81 }),
        b: makeKubescape({ overallScore: 82 }),
        c: makeKubescape({ overallScore: 84 }),
      },
      kyvernoStatuses: {},
    })
    // (81 + 82 + 84) / 3 = 82.33 → 82
    expect(result.breakdown[0].value).toBe(82)
  })

  it('ignores uninstalled kubescape clusters when computing the average', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 90 }),
        b: makeKubescape({ overallScore: 0, installed: false }),
      },
      kyvernoStatuses: {},
    })
    expect(result.breakdown).toEqual([{ name: 'Kubescape', value: 90 }])
  })

  it('ignores kubescape clusters with zero totalControls', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 40 }),
        b: makeKubescape({ overallScore: 100, totalControls: 0 }),
      },
      kyvernoStatuses: {},
    })
    expect(result.breakdown).toEqual([{ name: 'Kubescape', value: 40 }])
  })
})

describe('buildComplianceScoreSummary — kyverno scoring', () => {
  it('reports 100 when there are policies but zero violations', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 20, totalViolations: 0 }),
      },
    })
    expect(result.breakdown).toEqual([{ name: 'Kyverno', value: 100 }])
    expect(result.score).toBe(100)
  })

  it('computes rate as 100 - round(violations/policies * 100)', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 10, totalViolations: 3 }),
      },
    })
    // 100 - round(30) = 70
    expect(result.breakdown).toEqual([{ name: 'Kyverno', value: 70 }])
  })

  it('clamps the kyverno rate at 0 when violations exceed policies', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 5, totalViolations: 50 }),
      },
    })
    expect(result.breakdown).toEqual([{ name: 'Kyverno', value: 0 }])
  })

  it('aggregates policies and violations across included kyverno clusters', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 10, totalViolations: 2 }),
        b: makeKyverno({ totalPolicies: 30, totalViolations: 6 }),
      },
    })
    // totals: 40 policies, 8 violations → 100 - round(20) = 80
    expect(result.breakdown).toEqual([{ name: 'Kyverno', value: 80 }])
  })

  it('skips uninstalled kyverno clusters in the aggregate', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 10, totalViolations: 0 }),
        b: makeKyverno({
          installed: false,
          totalPolicies: 999,
          totalViolations: 999,
        }),
      },
    })
    expect(result.breakdown).toEqual([{ name: 'Kyverno', value: 100 }])
  })
})

describe('buildComplianceScoreSummary — combined scoring', () => {
  it('averages the kubescape and kyverno scores when both are available', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 80 }),
      },
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 10, totalViolations: 4 }),
      },
    })
    // kubescape = 80, kyverno = 100 - 40 = 60 → avg 70
    expect(result.usingFallback).toBe(false)
    expect(result.breakdown).toEqual([
      { name: 'Kubescape', value: 80 },
      { name: 'Kyverno', value: 60 },
    ])
    expect(result.score).toBe(70)
  })

  it('rounds the combined score', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 75 }),
      },
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 10, totalViolations: 2 }),
      },
    })
    // kubescape=75, kyverno=80 → avg 77.5 → 78
    expect(result.score).toBe(78)
  })
})

describe('buildComplianceScoreSummary — selectedClusters filter', () => {
  it('treats an omitted selectedClusters as "include all"', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 50 }),
        b: makeKubescape({ overallScore: 90 }),
      },
      kyvernoStatuses: {},
    })
    expect(result.breakdown[0].value).toBe(70)
  })

  it('treats an empty selectedClusters array as "include all"', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 50 }),
        b: makeKubescape({ overallScore: 90 }),
      },
      kyvernoStatuses: {},
      selectedClusters: [],
    })
    expect(result.breakdown[0].value).toBe(70)
  })

  it('filters kubescape clusters by selectedClusters', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 50 }),
        b: makeKubescape({ overallScore: 90 }),
      },
      kyvernoStatuses: {},
      selectedClusters: ['b'],
    })
    expect(result.breakdown).toEqual([{ name: 'Kubescape', value: 90 }])
  })

  it('filters kyverno clusters by selectedClusters', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {},
      kyvernoStatuses: {
        a: makeKyverno({ totalPolicies: 10, totalViolations: 10 }),
        b: makeKyverno({ totalPolicies: 10, totalViolations: 0 }),
      },
      selectedClusters: ['b'],
    })
    expect(result.breakdown).toEqual([{ name: 'Kyverno', value: 100 }])
  })

  it('applies selectedClusters to both sources independently', () => {
    const result = buildComplianceScoreSummary({
      kubescapeStatuses: {
        a: makeKubescape({ overallScore: 60 }),
        c: makeKubescape({ overallScore: 100 }),
      },
      kyvernoStatuses: {
        b: makeKyverno({ totalPolicies: 10, totalViolations: 2 }),
        c: makeKyverno({ totalPolicies: 10, totalViolations: 0 }),
      },
      selectedClusters: ['a', 'b'],
    })
    // kubescape only 'a' = 60, kyverno only 'b' = 80 → avg 70
    expect(result.breakdown).toEqual([
      { name: 'Kubescape', value: 60 },
      { name: 'Kyverno', value: 80 },
    ])
    expect(result.score).toBe(70)
  })
})
