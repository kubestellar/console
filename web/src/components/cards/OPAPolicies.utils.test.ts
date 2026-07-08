import { describe, it, expect } from 'vitest'
import { generateDemoStatuses, createSortComparators } from './OPAPolicies.utils'
import type { OPAClusterItem } from './opa/types'

// ---------------------------------------------------------------------------
// generateDemoStatuses
// ---------------------------------------------------------------------------

describe('generateDemoStatuses', () => {
  it('returns exactly three demo cluster entries', () => {
    const statuses = generateDemoStatuses()
    expect(Object.keys(statuses)).toHaveLength(3)
  })

  it('includes the expected demo cluster names', () => {
    const statuses = generateDemoStatuses()
    expect(statuses['kind-hub']).toBeDefined()
    expect(statuses['kind-worker1']).toBeDefined()
    expect(statuses['kind-worker2']).toBeDefined()
  })

  it('marks every cluster as installed and not loading', () => {
    const statuses = generateDemoStatuses()
    for (const status of Object.values(statuses)) {
      expect(status.installed).toBe(true)
      expect(status.loading).toBe(false)
    }
  })

  it('each cluster has exactly 3 demo policies', () => {
    const statuses = generateDemoStatuses()
    for (const status of Object.values(statuses)) {
      expect(status.policyCount).toBe(3)
      expect(status.policies).toHaveLength(3)
    }
  })

  it('each policy has a name, kind, violations, and mode', () => {
    const statuses = generateDemoStatuses()
    for (const status of Object.values(statuses)) {
      for (const policy of status.policies ?? []) {
        expect(typeof policy.name).toBe('string')
        expect(policy.name.length).toBeGreaterThan(0)
        expect(typeof policy.kind).toBe('string')
        expect(typeof policy.violations).toBe('number')
        expect(['warn', 'enforce', 'dryrun', 'deny']).toContain(policy.mode)
      }
    }
  })

  it('violationCount is a non-negative number on every cluster', () => {
    const statuses = generateDemoStatuses()
    for (const status of Object.values(statuses)) {
      expect(typeof status.violationCount).toBe('number')
      expect(status.violationCount).toBeGreaterThanOrEqual(0)
    }
  })

  it('cluster field on each status matches its map key', () => {
    const statuses = generateDemoStatuses()
    for (const [key, status] of Object.entries(statuses)) {
      expect(status.cluster).toBe(key)
    }
  })
})

// ---------------------------------------------------------------------------
// createSortComparators
// ---------------------------------------------------------------------------

describe('createSortComparators', () => {
  const makeCluster = (name: string): OPAClusterItem => ({ name, cluster: name })

  it('violations comparator sorts ascending by violation count', () => {
    const statuses = {
      high: { cluster: 'high', installed: true, loading: false, policyCount: 1, violationCount: 10, mode: 'warn' as const, modes: ['warn' as const], policies: [], violations: [] },
      low:  { cluster: 'low',  installed: true, loading: false, policyCount: 1, violationCount: 2,  mode: 'warn' as const, modes: ['warn' as const], policies: [], violations: [] },
    }
    const { violations } = createSortComparators(statuses)

    expect(violations(makeCluster('high'), makeCluster('low'))).toBeGreaterThan(0)
    expect(violations(makeCluster('low'),  makeCluster('high'))).toBeLessThan(0)
  })

  it('violations comparator returns 0 for equal counts', () => {
    const statuses = {
      a: { cluster: 'a', installed: true, loading: false, policyCount: 1, violationCount: 5, mode: 'warn' as const, modes: ['warn' as const], policies: [], violations: [] },
      b: { cluster: 'b', installed: true, loading: false, policyCount: 1, violationCount: 5, mode: 'warn' as const, modes: ['warn' as const], policies: [], violations: [] },
    }
    const { violations } = createSortComparators(statuses)

    expect(violations(makeCluster('a'), makeCluster('b'))).toBe(0)
  })

  it('violations comparator treats unknown cluster as 0', () => {
    const { violations } = createSortComparators({})
    expect(violations(makeCluster('unknown-x'), makeCluster('unknown-y'))).toBe(0)
  })

  it('policies comparator sorts ascending by policy count', () => {
    const statuses = {
      many: { cluster: 'many', installed: true, loading: false, policyCount: 20, violationCount: 0, mode: 'enforce' as const, modes: ['enforce' as const], policies: [], violations: [] },
      few:  { cluster: 'few',  installed: true, loading: false, policyCount: 2,  violationCount: 0, mode: 'enforce' as const, modes: ['enforce' as const], policies: [], violations: [] },
    }
    const { policies } = createSortComparators(statuses)

    expect(policies(makeCluster('many'), makeCluster('few'))).toBeGreaterThan(0)
    expect(policies(makeCluster('few'),  makeCluster('many'))).toBeLessThan(0)
  })

  it('policies comparator treats unknown cluster as 0', () => {
    const { policies } = createSortComparators({})
    expect(policies(makeCluster('x'), makeCluster('y'))).toBe(0)
  })

  it('name comparator is provided and is a function', () => {
    const { name } = createSortComparators({})
    expect(typeof name).toBe('function')
  })

  it('name comparator sorts alphabetically', () => {
    const { name } = createSortComparators({})
    expect(name(makeCluster('alpha'), makeCluster('beta'))).toBeLessThan(0)
    expect(name(makeCluster('beta'),  makeCluster('alpha'))).toBeGreaterThan(0)
    expect(name(makeCluster('same'),  makeCluster('same'))).toBe(0)
  })
})
