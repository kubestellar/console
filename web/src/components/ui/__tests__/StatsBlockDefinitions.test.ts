/**
 * Tests for components/ui/StatsBlockDefinitions.ts
 */
import { describe, it, expect } from 'vitest'
import {
  STAT_BLOCK_REGISTRY,
  block,
  CLUSTERS_STAT_BLOCKS,
  WORKLOADS_STAT_BLOCKS,
  DEPLOYMENTS_STAT_BLOCKS,
  PODS_STAT_BLOCKS,
  GITOPS_STAT_BLOCKS,
  STORAGE_STAT_BLOCKS,
  NETWORK_STAT_BLOCKS,
  SECURITY_STAT_BLOCKS,
  COMPLIANCE_STAT_BLOCKS,
  COMPUTE_STAT_BLOCKS,
  EVENTS_STAT_BLOCKS,
  COST_STAT_BLOCKS,
  ALERTS_STAT_BLOCKS,
} from '../StatsBlockDefinitions'

describe('STAT_BLOCK_REGISTRY', () => {
  it('is a non-empty object', () => {
    expect(typeof STAT_BLOCK_REGISTRY).toBe('object')
    expect(Object.keys(STAT_BLOCK_REGISTRY).length).toBeGreaterThan(0)
  })

  it('every entry has id, name, icon, color', () => {
    for (const [key, entry] of Object.entries(STAT_BLOCK_REGISTRY)) {
      expect(typeof entry.id).toBe('string')
      expect(entry.id).toBe(key)
      expect(typeof entry.name).toBe('string')
      expect(entry.name.length).toBeGreaterThan(0)
      expect(typeof entry.icon).toBe('string')
      expect(entry.icon.length).toBeGreaterThan(0)
      expect(typeof entry.color).toBe('string')
      expect(entry.color.length).toBeGreaterThan(0)
    }
  })

  it('all registry ids are unique', () => {
    const ids = Object.values(STAT_BLOCK_REGISTRY).map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has standard cluster blocks', () => {
    expect('clusters' in STAT_BLOCK_REGISTRY).toBe(true)
    expect('healthy' in STAT_BLOCK_REGISTRY).toBe(true)
    expect('unhealthy' in STAT_BLOCK_REGISTRY).toBe(true)
  })

  it('has standard compute blocks', () => {
    expect('nodes' in STAT_BLOCK_REGISTRY).toBe(true)
    expect('cpus' in STAT_BLOCK_REGISTRY).toBe(true)
    expect('memory' in STAT_BLOCK_REGISTRY).toBe(true)
    expect('gpus' in STAT_BLOCK_REGISTRY).toBe(true)
  })
})

describe('block()', () => {
  it('returns StatBlockConfig with id, name, icon, color, visible', () => {
    const b = block('clusters')
    expect(b.id).toBe('clusters')
    expect(typeof b.name).toBe('string')
    expect(typeof b.icon).toBe('string')
    expect(typeof b.color).toBe('string')
    expect(typeof b.visible).toBe('boolean')
  })

  it('defaults visible to true', () => {
    expect(block('clusters').visible).toBe(true)
    expect(block('healthy').visible).toBe(true)
  })

  it('respects explicit visible=false', () => {
    expect(block('clusters', false).visible).toBe(false)
    expect(block('gpus', false).visible).toBe(false)
  })

  it('returns correct registry data for clusters', () => {
    const b = block('clusters')
    expect(b.id).toBe(STAT_BLOCK_REGISTRY.clusters.id)
    expect(b.name).toBe(STAT_BLOCK_REGISTRY.clusters.name)
    expect(b.icon).toBe(STAT_BLOCK_REGISTRY.clusters.icon)
    expect(b.color).toBe(STAT_BLOCK_REGISTRY.clusters.color)
  })

  it('each call returns a new object (spread)', () => {
    const a = block('clusters')
    const b = block('clusters')
    expect(a).not.toBe(b)
  })
})

describe('dashboard stat block arrays', () => {
  const allArrays = [
    ['CLUSTERS_STAT_BLOCKS', CLUSTERS_STAT_BLOCKS],
    ['WORKLOADS_STAT_BLOCKS', WORKLOADS_STAT_BLOCKS],
    ['DEPLOYMENTS_STAT_BLOCKS', DEPLOYMENTS_STAT_BLOCKS],
    ['PODS_STAT_BLOCKS', PODS_STAT_BLOCKS],
    ['GITOPS_STAT_BLOCKS', GITOPS_STAT_BLOCKS],
    ['STORAGE_STAT_BLOCKS', STORAGE_STAT_BLOCKS],
    ['NETWORK_STAT_BLOCKS', NETWORK_STAT_BLOCKS],
    ['SECURITY_STAT_BLOCKS', SECURITY_STAT_BLOCKS],
    ['COMPLIANCE_STAT_BLOCKS', COMPLIANCE_STAT_BLOCKS],
    ['COMPUTE_STAT_BLOCKS', COMPUTE_STAT_BLOCKS],
    ['EVENTS_STAT_BLOCKS', EVENTS_STAT_BLOCKS],
    ['COST_STAT_BLOCKS', COST_STAT_BLOCKS],
    ['ALERTS_STAT_BLOCKS', ALERTS_STAT_BLOCKS],
  ] as const

  for (const [name, arr] of allArrays) {
    it(`${name} is a non-empty array`, () => {
      expect(Array.isArray(arr)).toBe(true)
      expect(arr.length).toBeGreaterThan(0)
    })

    it(`${name} every block has id, name, icon, color, visible`, () => {
      for (const b of arr) {
        expect(typeof b.id).toBe('string')
        expect(typeof b.name).toBe('string')
        expect(typeof b.icon).toBe('string')
        expect(typeof b.color).toBe('string')
        expect(typeof b.visible).toBe('boolean')
      }
    })
  }

  it('CLUSTERS_STAT_BLOCKS contains clusters block', () => {
    expect(CLUSTERS_STAT_BLOCKS.some(b => b.id === 'clusters')).toBe(true)
  })

  it('COMPUTE_STAT_BLOCKS contains gpus block', () => {
    expect(COMPUTE_STAT_BLOCKS.some(b => b.id === 'gpus')).toBe(true)
  })

  it('ALERTS_STAT_BLOCKS contains alerts-related blocks', () => {
    expect(ALERTS_STAT_BLOCKS.length).toBeGreaterThan(0)
  })
})
