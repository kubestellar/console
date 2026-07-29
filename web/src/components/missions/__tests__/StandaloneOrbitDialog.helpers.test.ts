import { describe, expect, it } from 'vitest'

import { CADENCE_OPTIONS, buildScopeString } from '../StandaloneOrbitDialog.helpers'
import type { OrbitResourceFilter } from '../../../lib/missions/types'

describe('CADENCE_OPTIONS', () => {
  it('exposes daily, weekly, monthly in a stable order', () => {
    expect(CADENCE_OPTIONS).toEqual(['daily', 'weekly', 'monthly'])
  })
})

describe('buildScopeString', () => {
  it('returns empty string when there are no filters', () => {
    expect(buildScopeString({})).toBe('')
  })

  it('returns empty string when every cluster maps to an empty filter list', () => {
    expect(buildScopeString({ prod: [], stage: [] })).toBe('')
  })

  it('formats a single namespaced-resource filter', () => {
    const filters: Record<string, OrbitResourceFilter[]> = {
      prod: [{ kind: 'Pod', namespaces: ['default'] } as OrbitResourceFilter],
    }
    const out = buildScopeString(filters)
    expect(out).toBe('\n\nFocus on:\n- prod: Pod in namespaces: default')
  })

  it('joins multiple namespaces with a comma-space separator', () => {
    const filters: Record<string, OrbitResourceFilter[]> = {
      prod: [{ kind: 'Deployment', namespaces: ['a', 'b', 'c'] } as OrbitResourceFilter],
    }
    expect(buildScopeString(filters)).toContain('Deployment in namespaces: a, b, c')
  })

  it('marks cluster-scoped resources explicitly', () => {
    const filters: Record<string, OrbitResourceFilter[]> = {
      prod: [{ kind: 'ClusterRole', clusterScoped: true } as OrbitResourceFilter],
    }
    expect(buildScopeString(filters)).toContain('- prod: ClusterRole (cluster-scoped)')
  })

  it('marks namespaced resources with an empty namespaces array as "(all namespaces)"', () => {
    const filters: Record<string, OrbitResourceFilter[]> = {
      prod: [{ kind: 'Pod', namespaces: [] } as OrbitResourceFilter],
    }
    expect(buildScopeString(filters)).toContain('- prod: Pod (all namespaces)')
  })

  it('treats an omitted namespaces field the same as empty', () => {
    const filters: Record<string, OrbitResourceFilter[]> = {
      prod: [{ kind: 'Pod' } as OrbitResourceFilter],
    }
    expect(buildScopeString(filters)).toContain('- prod: Pod (all namespaces)')
  })

  it('joins multiple resource filters within one cluster using semicolons', () => {
    const filters: Record<string, OrbitResourceFilter[]> = {
      prod: [
        { kind: 'Pod', namespaces: ['default'] } as OrbitResourceFilter,
        { kind: 'Service', namespaces: ['default'] } as OrbitResourceFilter,
      ],
    }
    expect(buildScopeString(filters)).toContain(
      '- prod: Pod in namespaces: default; Service in namespaces: default',
    )
  })

  it('emits one line per cluster (newline-separated)', () => {
    const filters: Record<string, OrbitResourceFilter[]> = {
      prod: [{ kind: 'Pod', namespaces: ['ns1'] } as OrbitResourceFilter],
      dev: [{ kind: 'Service', clusterScoped: false, namespaces: ['ns2'] } as OrbitResourceFilter],
    }
    const out = buildScopeString(filters)
    expect(out).toContain('- prod: Pod in namespaces: ns1')
    expect(out).toContain('- dev: Service in namespaces: ns2')
    // Two distinct lines under the "Focus on:" header.
    expect(out.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(2)
  })

  it('skips clusters that have an empty filter list even when other clusters have filters', () => {
    const filters: Record<string, OrbitResourceFilter[]> = {
      prod: [{ kind: 'Pod', namespaces: ['ns1'] } as OrbitResourceFilter],
      stage: [],
    }
    const out = buildScopeString(filters)
    expect(out).toContain('- prod:')
    expect(out).not.toContain('- stage:')
  })
})
