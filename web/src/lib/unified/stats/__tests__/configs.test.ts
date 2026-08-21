import { describe, it, expect } from 'vitest'
import * as configs from '../configs'
import {
  CLUSTERS_STATS_CONFIG,
  WORKLOADS_STATS_CONFIG,
  PODS_STATS_CONFIG,
  GITOPS_STATS_CONFIG,
  STORAGE_STATS_CONFIG,
  NETWORK_STATS_CONFIG,
  SECURITY_STATS_CONFIG,
  COMPLIANCE_STATS_CONFIG,
  DATA_COMPLIANCE_STATS_CONFIG,
  COMPUTE_STATS_CONFIG,
  EVENTS_STATS_CONFIG,
  COST_STATS_CONFIG,
  ALERTS_STATS_CONFIG,
  DASHBOARD_STATS_CONFIG,
  OPERATORS_STATS_CONFIG,
  DEPLOY_STATS_CONFIG,
  MULTI_TENANCY_STATS_CONFIG,
  getUnifiedStatsConfig,
  type StatsConfigType,
} from '../configs'

const ALL_TYPES: StatsConfigType[] = [
  'clusters', 'workloads', 'pods', 'gitops', 'storage', 'network',
  'security', 'compliance', 'data-compliance', 'compute', 'events',
  'cost', 'alerts', 'dashboard', 'operators', 'deploy', 'multi-tenancy',
]

const NAMED_CONFIGS = [
  ['clusters', CLUSTERS_STATS_CONFIG],
  ['workloads', WORKLOADS_STATS_CONFIG],
  ['pods', PODS_STATS_CONFIG],
  ['gitops', GITOPS_STATS_CONFIG],
  ['storage', STORAGE_STATS_CONFIG],
  ['network', NETWORK_STATS_CONFIG],
  ['security', SECURITY_STATS_CONFIG],
  ['compliance', COMPLIANCE_STATS_CONFIG],
  ['data-compliance', DATA_COMPLIANCE_STATS_CONFIG],
  ['compute', COMPUTE_STATS_CONFIG],
  ['events', EVENTS_STATS_CONFIG],
  ['cost', COST_STATS_CONFIG],
  ['alerts', ALERTS_STATS_CONFIG],
  ['dashboard', DASHBOARD_STATS_CONFIG],
  ['operators', OPERATORS_STATS_CONFIG],
  ['deploy', DEPLOY_STATS_CONFIG],
  ['multi-tenancy', MULTI_TENANCY_STATS_CONFIG],
] as const

describe('unified/stats/configs', () => {
  it('exports every expected STATS_CONFIG constant', () => {
    for (const [name, cfg] of NAMED_CONFIGS) {
      expect(cfg, `${name.toUpperCase()}_STATS_CONFIG missing`).toBeDefined()
    }
    expect(typeof configs.getUnifiedStatsConfig).toBe('function')
  })

  describe('per-config shape', () => {
    it.each(NAMED_CONFIGS.map(([n, c]) => [n, c]))(
      '%s config has expected UnifiedStatsSectionConfig shape',
      (type, cfg) => {
        expect(cfg.type).toBe(type)
        expect(typeof cfg.title).toBe('string')
        expect(cfg.title.length).toBeGreaterThan(0)
        expect(Array.isArray(cfg.blocks)).toBe(true)
        expect(cfg.blocks.length).toBeGreaterThan(0)
        expect(cfg.collapsible).toBe(true)
        expect(cfg.showConfigButton).toBe(true)
        expect(cfg.storageKey).toBe(`kubestellar-${type}-stats-collapsed`)
      },
    )

    it.each(NAMED_CONFIGS.map(([n, c]) => [n, c]))(
      '%s blocks are well-formed UnifiedStatBlockConfig entries',
      (_type, cfg) => {
        for (const block of cfg.blocks) {
          expect(typeof block.id).toBe('string')
          expect(block.id.length).toBeGreaterThan(0)
          expect(typeof block.name).toBe('string')
          expect(block.name.length).toBeGreaterThan(0)
          expect(block.icon).toBeDefined()
          expect(typeof block.color).toBe('string')
          expect(typeof block.visible).toBe('boolean')
          expect(typeof block.order).toBe('number')
          expect(Number.isInteger(block.order)).toBe(true)
          expect(block.order).toBeGreaterThanOrEqual(0)
        }
      },
    )

    it.each(NAMED_CONFIGS.map(([n, c]) => [n, c]))(
      '%s block orders are 0..n-1 contiguous',
      (_type, cfg) => {
        const orders = cfg.blocks.map(b => b.order).sort((a, b) => a - b)
        for (let i = 0; i < orders.length; i++) {
          expect(orders[i]).toBe(i)
        }
      },
    )

    it.each(NAMED_CONFIGS.map(([n, c]) => [n, c]))(
      '%s block ids are unique within the config',
      (_type, cfg) => {
        const ids = cfg.blocks.map(b => b.id)
        expect(new Set(ids).size).toBe(ids.length)
      },
    )

    it.each(NAMED_CONFIGS.map(([n, c]) => [n, c]))(
      '%s valueSource routes through the getStatValue callback',
      (_type, cfg) => {
        for (const block of cfg.blocks) {
          expect(block.valueSource).toBeDefined()
          expect(block.valueSource!.type).toBe('hook')
          expect((block.valueSource as { hookName: string }).hookName).toBe('getStatValue')
          // The "field" in the value source is the block id, so the runtime
          // knows which stat to look up.
          expect((block.valueSource as { field: string }).field).toBe(block.id)
        }
      },
    )
  })

  describe('getUnifiedStatsConfig()', () => {
    it.each(NAMED_CONFIGS.map(([n, c]) => [n, c]))(
      'returns %s config for the matching type key',
      (type, cfg) => {
        expect(getUnifiedStatsConfig(type as StatsConfigType)).toBe(cfg)
      },
    )

    it('covers every StatsConfigType', () => {
      for (const t of ALL_TYPES) {
        const cfg = getUnifiedStatsConfig(t)
        expect(cfg, `no config for ${t}`).toBeDefined()
        expect(cfg.type).toBe(t)
      }
    })

    it('every returned config has a storageKey derived from its type', () => {
      for (const t of ALL_TYPES) {
        expect(getUnifiedStatsConfig(t).storageKey).toBe(
          `kubestellar-${t}-stats-collapsed`,
        )
      }
    })
  })

  describe('cross-config invariants', () => {
    it('every config uses a unique storageKey', () => {
      const keys = NAMED_CONFIGS.map(([, c]) => c.storageKey)
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('every config has a distinct type identifier', () => {
      const types = NAMED_CONFIGS.map(([, c]) => c.type)
      expect(new Set(types).size).toBe(types.length)
    })
  })
})

