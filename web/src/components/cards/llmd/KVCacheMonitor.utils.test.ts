import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TFunction } from 'i18next'
import {
  calculateAggregateMetrics,
  calculateTrend,
  generateMonitorStats,
  getDisplayPodName,
  getGaugeGridClass,
  getGaugeSize,
  getHeatCellColors,
  getHorseshoeGridClass,
  getHorseshoeSize,
  updatePodHistory,
  HEATMAP_LEGEND,
  KVCACHE_MONITOR_DIV_STYLE_1,
  KVCACHE_MONITOR_DIV_STYLE_2,
} from './KVCacheMonitor.utils'
import type { PodHistoryMap } from './KVCacheMonitor.types'
import type { KVCacheStats } from '../../../lib/llmd/mockData'
import type { LLMdStack, LLMdStackComponent } from '../../../hooks/useStackDiscovery'
import type { PodMetrics } from '../../../hooks/usePrometheusMetrics'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 20
const RANDOM_STUB = 0.5
const DETERMINISTIC_TIME_MS = 1_700_000_000_000 // fixed Date.now() value

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const identityT = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction<any>

function buildStat(overrides: Partial<KVCacheStats> = {}): KVCacheStats {
  return {
    cluster: 'kind-hub',
    evictionRate: 0.01,
    hitRate: 0.9,
    lastUpdated: new Date(DETERMINISTIC_TIME_MS),
    namespace: 'llmd',
    podName: 'vllm-prefill-0',
    totalCapacityGB: 80,
    usedGB: 40,
    utilizationPercent: 50,
    ...overrides,
  }
}

function buildComponent(overrides: Partial<LLMdStackComponent> = {}): LLMdStackComponent {
  return {
    cluster: 'kind-hub',
    name: 'prefill-deployment',
    namespace: 'llmd',
    podNames: ['vllm-prefill-0'],
    readyReplicas: 1,
    replicas: 1,
    status: 'running',
    type: 'prefill',
    ...overrides,
  }
}

function buildStack(components: Partial<LLMdStack['components']> = {}): LLMdStack {
  return {
    cluster: 'kind-hub',
    components: {
      both: [],
      decode: [],
      epp: null,
      gateway: null,
      prefill: [],
      ...components,
    },
    hasDisaggregation: false,
    id: 'llmd@kind-hub',
    name: 'llmd',
    namespace: 'llmd',
    status: 'healthy',
  }
}

// ---------------------------------------------------------------------------
// Static exports
// ---------------------------------------------------------------------------

describe('static exports', () => {
  it('HEATMAP_LEGEND has five ordered utilization buckets', () => {
    expect(HEATMAP_LEGEND).toHaveLength(5)
    expect(HEATMAP_LEGEND.map(item => item.label)).toEqual([
      '<25%',
      '25-50%',
      '50-75%',
      '75-90%',
      '>90%',
    ])
    for (const item of HEATMAP_LEGEND) {
      expect(item.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('div style presets carry a textShadow property', () => {
    expect(KVCACHE_MONITOR_DIV_STYLE_1.textShadow).toContain('rgba(34,197,94')
    expect(KVCACHE_MONITOR_DIV_STYLE_2.textShadow).toContain('rgba(6,182,212')
  })
})

// ---------------------------------------------------------------------------
// calculateAggregateMetrics
// ---------------------------------------------------------------------------

describe('calculateAggregateMetrics', () => {
  it('returns the zero-valued aggregate for an empty list', () => {
    expect(calculateAggregateMetrics([])).toEqual({
      avgHitRate: 0,
      avgUtil: 0,
      totalCapacity: 0,
      totalUsed: 0,
    })
  })

  it('treats a null-ish array as empty without throwing', () => {
    // exercises the `(stats || [])` guard
    expect(calculateAggregateMetrics(null as unknown as KVCacheStats[])).toEqual({
      avgHitRate: 0,
      avgUtil: 0,
      totalCapacity: 0,
      totalUsed: 0,
    })
  })

  it('averages utilization and hit rate and sums capacity/used across stats', () => {
    const stats = [
      buildStat({ hitRate: 0.9, utilizationPercent: 60, totalCapacityGB: 80, usedGB: 40 }),
      buildStat({ hitRate: 0.7, utilizationPercent: 40, totalCapacityGB: 80, usedGB: 20 }),
    ]

    expect(calculateAggregateMetrics(stats)).toEqual({
      avgHitRate: 80, // ((0.9 + 0.7) / 2) * 100
      avgUtil: 50,    // (60 + 40) / 2
      totalCapacity: 160,
      totalUsed: 60,
    })
  })

  it('rounds averaged values to the nearest integer', () => {
    const stats = [
      buildStat({ hitRate: 0.888, utilizationPercent: 33, totalCapacityGB: 10, usedGB: 3 }),
      buildStat({ hitRate: 0.777, utilizationPercent: 34, totalCapacityGB: 10, usedGB: 4 }),
    ]

    const metrics = calculateAggregateMetrics(stats)
    expect(metrics.avgHitRate).toBe(Math.round(((0.888 + 0.777) / 2) * 100))
    expect(metrics.avgUtil).toBe(Math.round((33 + 34) / 2))
  })
})

// ---------------------------------------------------------------------------
// calculateTrend
// ---------------------------------------------------------------------------

describe('calculateTrend', () => {
  it('returns 0 when history is empty', () => {
    expect(calculateTrend([])).toBe(0)
  })

  it('returns 0 when history has only one sample', () => {
    expect(calculateTrend([42])).toBe(0)
  })

  it('returns 0 when history is null-ish', () => {
    expect(calculateTrend(null as unknown as number[])).toBe(0)
  })

  it('returns the delta between the last two samples', () => {
    expect(calculateTrend([10, 15])).toBe(5)
    expect(calculateTrend([1, 2, 3, 10])).toBe(7)
  })

  it('returns a negative delta when the trend is downward', () => {
    expect(calculateTrend([50, 40, 30])).toBe(-10)
  })
})

// ---------------------------------------------------------------------------
// getGaugeGridClass / getGaugeSize
// ---------------------------------------------------------------------------

describe('getGaugeGridClass', () => {
  describe('when expanded', () => {
    it('uses a flex layout for <= 2 stats', () => {
      expect(getGaugeGridClass(1, true)).toContain('flex')
      expect(getGaugeGridClass(2, true)).toContain('flex')
    })

    it('uses a 4-column grid for 3-4 stats', () => {
      expect(getGaugeGridClass(3, true)).toContain('grid-cols-2 @md:grid-cols-4')
      expect(getGaugeGridClass(3, true)).toContain('gap-8')
      expect(getGaugeGridClass(4, true)).toContain('grid-cols-2 @md:grid-cols-4')
    })

    it('uses a 3-column grid for 5-6 stats', () => {
      expect(getGaugeGridClass(5, true)).toContain('@md:grid-cols-3')
      expect(getGaugeGridClass(6, true)).toContain('gap-6')
    })

    it('falls back to a dense 4-column grid for > 6 stats', () => {
      expect(getGaugeGridClass(20, true)).toContain('@md:grid-cols-4')
      expect(getGaugeGridClass(20, true)).toContain('gap-4')
    })
  })

  describe('when not expanded', () => {
    it('uses a flex layout for <= 2 stats', () => {
      expect(getGaugeGridClass(2, false)).toContain('flex')
      expect(getGaugeGridClass(2, false)).toContain('gap-12')
    })

    it('uses a 3-column grid for 3 stats', () => {
      expect(getGaugeGridClass(3, false)).toContain('@md:grid-cols-3')
      expect(getGaugeGridClass(3, false)).toContain('gap-6')
    })

    it('uses a 3-column grid with tight gaps for 4-6 stats', () => {
      expect(getGaugeGridClass(6, false)).toContain('@md:grid-cols-3')
      expect(getGaugeGridClass(6, false)).toContain('gap-3')
    })

    it('uses a 3-column grid with tighter gaps for 7-9 stats', () => {
      expect(getGaugeGridClass(9, false)).toContain('@md:grid-cols-3')
      expect(getGaugeGridClass(9, false)).toContain('gap-2')
    })

    it('falls back to a 4-column grid for > 9 stats', () => {
      expect(getGaugeGridClass(50, false)).toContain('@md:grid-cols-4')
      expect(getGaugeGridClass(50, false)).toContain('gap-2')
    })
  })
})

describe('getGaugeSize', () => {
  it('scales down monotonically with more stats when expanded', () => {
    expect(getGaugeSize(2, true)).toBe(200)
    expect(getGaugeSize(4, true)).toBe(180)
    expect(getGaugeSize(6, true)).toBe(160)
    expect(getGaugeSize(20, true)).toBe(140)
  })

  it('scales down monotonically with more stats when collapsed', () => {
    expect(getGaugeSize(2, false)).toBe(120)
    expect(getGaugeSize(3, false)).toBe(130)
    expect(getGaugeSize(6, false)).toBe(110)
    expect(getGaugeSize(9, false)).toBe(100)
    expect(getGaugeSize(50, false)).toBe(85)
  })
})

// ---------------------------------------------------------------------------
// getHorseshoeGridClass / getHorseshoeSize
// ---------------------------------------------------------------------------

describe('getHorseshoeGridClass', () => {
  it('picks a 2-column layout for <= 2 stats when expanded', () => {
    expect(getHorseshoeGridClass(2, true)).toBe('grid-cols-2 gap-6')
  })

  it('picks a 4-column layout for 3-4 stats when expanded', () => {
    expect(getHorseshoeGridClass(4, true)).toContain('@md:grid-cols-4')
    expect(getHorseshoeGridClass(4, true)).toContain('gap-4')
  })

  it('picks a 3-column layout for 5-6 stats when expanded', () => {
    expect(getHorseshoeGridClass(6, true)).toContain('@md:grid-cols-3')
  })

  it('picks a dense 4-column layout for > 6 stats when expanded', () => {
    expect(getHorseshoeGridClass(20, true)).toContain('@md:grid-cols-4')
    expect(getHorseshoeGridClass(20, true)).toContain('gap-3')
  })

  it('picks tighter gaps in collapsed mode', () => {
    expect(getHorseshoeGridClass(2, false)).toBe('grid-cols-2 gap-2')
    expect(getHorseshoeGridClass(3, false)).toContain('gap-1')
    expect(getHorseshoeGridClass(6, false)).toContain('@md:grid-cols-3')
    expect(getHorseshoeGridClass(50, false)).toContain('@md:grid-cols-4')
  })
})

describe('getHorseshoeSize', () => {
  it('scales down monotonically with more stats when expanded', () => {
    expect(getHorseshoeSize(2, true)).toBe(240)
    expect(getHorseshoeSize(4, true)).toBe(200)
    expect(getHorseshoeSize(6, true)).toBe(180)
    expect(getHorseshoeSize(20, true)).toBe(160)
  })

  it('scales down monotonically with more stats when collapsed', () => {
    expect(getHorseshoeSize(2, false)).toBe(180)
    expect(getHorseshoeSize(3, false)).toBe(160)
    expect(getHorseshoeSize(6, false)).toBe(140)
    expect(getHorseshoeSize(50, false)).toBe(120)
  })
})

// ---------------------------------------------------------------------------
// getHeatCellColors
// ---------------------------------------------------------------------------

describe('getHeatCellColors', () => {
  it('returns critical red for utilization >= 90%', () => {
    expect(getHeatCellColors(90).bg).toBe('#ef4444')
    expect(getHeatCellColors(100).bg).toBe('#ef4444')
  })

  it('returns high orange for utilization in [75, 90)', () => {
    expect(getHeatCellColors(75).bg).toBe('#f59e0b')
    expect(getHeatCellColors(89).bg).toBe('#f59e0b')
  })

  it('returns medium yellow for utilization in [50, 75)', () => {
    expect(getHeatCellColors(50).bg).toBe('#eab308')
    expect(getHeatCellColors(74).bg).toBe('#eab308')
  })

  it('returns low green for utilization in [25, 50)', () => {
    expect(getHeatCellColors(25).bg).toBe('#22c55e')
    expect(getHeatCellColors(49).bg).toBe('#22c55e')
  })

  it('returns dark green for utilization < 25%', () => {
    expect(getHeatCellColors(0).bg).toBe('#166534')
    expect(getHeatCellColors(24).bg).toBe('#166534')
  })

  it('returns a matching glow rgba per bucket', () => {
    expect(getHeatCellColors(95).glow).toContain('239,68,68')
    expect(getHeatCellColors(80).glow).toContain('245,158,11')
    expect(getHeatCellColors(60).glow).toContain('234,179,8')
    expect(getHeatCellColors(30).glow).toContain('34,197,94')
    expect(getHeatCellColors(10).glow).toContain('22,101,52')
  })
})

// ---------------------------------------------------------------------------
// getDisplayPodName
// ---------------------------------------------------------------------------

describe('getDisplayPodName', () => {
  it('strips the vllm- prefix from ordinary pod names', () => {
    expect(getDisplayPodName(identityT, 'vllm-prefill-0')).toBe('prefill-0')
  })

  it('does not modify pod names without the vllm- prefix', () => {
    expect(getDisplayPodName(identityT, 'decode-worker-1')).toBe('decode-worker-1')
  })

  it('translates the Prefill aggregate label', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = ((_key: string, fallback?: string) => fallback) as unknown as TFunction<any>
    expect(getDisplayPodName(t, 'Prefill (2)')).toBe('Prefill (2)')
  })

  it('translates aggregate labels using the t function', () => {
    const t = ((key: string) => {
      if (key === 'llmd.prefill') return 'PRE'
      if (key === 'llmd.decode') return 'DEC'
      if (key === 'llmd.unified') return 'UNI'
      return key
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as unknown as TFunction<any>

    expect(getDisplayPodName(t, 'Prefill (3)')).toBe('PRE (3)')
    expect(getDisplayPodName(t, 'Decode (5)')).toBe('DEC (5)')
    expect(getDisplayPodName(t, 'Unified (1)')).toBe('UNI (1)')
  })

  it('does not translate labels that only match the substring, not the prefix', () => {
    // "Prefill" without the trailing " (" is left unchanged
    expect(getDisplayPodName(identityT, 'Prefill-node')).toBe('Prefill-node')
  })

  it('truncates the display name when maxLength is provided', () => {
    expect(getDisplayPodName(identityT, 'vllm-prefill-0', 4)).toBe('pref')
  })

  it('does not truncate when maxLength is not a number', () => {
    // undefined => no slicing
    expect(getDisplayPodName(identityT, 'vllm-prefill-0', undefined)).toBe('prefill-0')
  })
})

// ---------------------------------------------------------------------------
// updatePodHistory
// ---------------------------------------------------------------------------

describe('updatePodHistory', () => {
  it('initializes empty history for a previously-unknown pod', () => {
    const next = updatePodHistory({}, [buildStat({ podName: 'p1', hitRate: 0.5, utilizationPercent: 60 })])
    expect(next.p1.hitRate).toEqual([50])
    expect(next.p1.util).toEqual([60])
  })

  it('appends new samples to the tail of the history', () => {
    const prev: PodHistoryMap = { p1: { hitRate: [10, 20], util: [30, 40] } }
    const next = updatePodHistory(prev, [buildStat({ podName: 'p1', hitRate: 0.75, utilizationPercent: 55 })])
    expect(next.p1.hitRate).toEqual([10, 20, 75])
    expect(next.p1.util).toEqual([30, 40, 55])
  })

  it('trims history to the last HISTORY_LIMIT samples', () => {
    const seed = Array.from({ length: HISTORY_LIMIT }, (_, i) => i)
    const prev: PodHistoryMap = { p1: { hitRate: [...seed], util: [...seed] } }
    const next = updatePodHistory(prev, [buildStat({ podName: 'p1', hitRate: 0.99, utilizationPercent: 88 })])

    expect(next.p1.hitRate).toHaveLength(HISTORY_LIMIT)
    expect(next.p1.util).toHaveLength(HISTORY_LIMIT)
    // Oldest sample (0) has been dropped; newest sample is at the tail.
    expect(next.p1.hitRate[0]).toBe(1)
    expect(next.p1.hitRate[HISTORY_LIMIT - 1]).toBe(99)
    expect(next.p1.util[HISTORY_LIMIT - 1]).toBe(88)
  })

  it('does not mutate the previous history object', () => {
    const prev: PodHistoryMap = { p1: { hitRate: [10], util: [20] } }
    const prevSnapshot = JSON.parse(JSON.stringify(prev))
    updatePodHistory(prev, [buildStat({ podName: 'p1', hitRate: 0.5, utilizationPercent: 60 })])
    expect(prev).toEqual(prevSnapshot)
  })

  it('preserves history for pods not present in the new stats', () => {
    const prev: PodHistoryMap = {
      p1: { hitRate: [10], util: [20] },
      p2: { hitRate: [30], util: [40] },
    }
    const next = updatePodHistory(prev, [buildStat({ podName: 'p1', hitRate: 0.4, utilizationPercent: 50 })])
    expect(next.p2).toEqual({ hitRate: [30], util: [40] })
  })

  it('accepts a null-ish stats list without throwing', () => {
    const prev: PodHistoryMap = { p1: { hitRate: [10], util: [20] } }
    // exercises the `(nextStats || [])` guard
    const next = updatePodHistory(prev, null as unknown as KVCacheStats[])
    expect(next).toEqual(prev)
  })
})

// ---------------------------------------------------------------------------
// generateMonitorStats
// ---------------------------------------------------------------------------

describe('generateMonitorStats', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(RANDOM_STUB)
    vi.spyOn(Date, 'now').mockReturnValue(DETERMINISTIC_TIME_MS)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns demo stats when no stack is selected and demo mode is on', () => {
    const result = generateMonitorStats({
      aggregationMode: 'aggregated',
      isDemoMode: true,
      prometheusMetrics: null,
      selectedStack: null,
    })
    // generateKVCacheStats() returns a non-empty array of KVCacheStats
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    for (const stat of result) {
      expect(stat).toHaveProperty('podName')
      expect(stat).toHaveProperty('utilizationPercent')
    }
  })

  it('returns an empty list when no stack is selected and demo mode is off', () => {
    const result = generateMonitorStats({
      aggregationMode: 'aggregated',
      isDemoMode: false,
      prometheusMetrics: null,
      selectedStack: null,
    })
    expect(result).toEqual([])
  })

  it('aggregated mode: emits one entry per non-empty role with combined capacity', () => {
    const stack = buildStack({
      prefill: [buildComponent({ replicas: 2, readyReplicas: 2, podNames: ['vllm-prefill-0', 'vllm-prefill-1'] })],
      decode: [buildComponent({ name: 'decode', type: 'decode', replicas: 1, readyReplicas: 1, podNames: ['vllm-decode-0'] })],
    })

    const result = generateMonitorStats({
      aggregationMode: 'aggregated',
      isDemoMode: false,
      prometheusMetrics: null,
      selectedStack: stack,
    })

    expect(result).toHaveLength(2)
    const podNames = result.map(stat => stat.podName)
    expect(podNames).toEqual(expect.arrayContaining(['Prefill (2)', 'Decode (1)']))

    const prefillEntry = result.find(stat => stat.podName === 'Prefill (2)')!
    // Two prefill replicas @ 80 GB each == 160 GB total capacity.
    expect(prefillEntry.totalCapacityGB).toBe(160)
    expect(prefillEntry.cluster).toBe('kind-hub')
    expect(prefillEntry.namespace).toBe('llmd')
  })

  it('aggregated mode: uses prometheus utilization when available and caps at 100', () => {
    const stack = buildStack({
      prefill: [buildComponent({ replicas: 1, readyReplicas: 1, podNames: ['vllm-prefill-0'] })],
    })

    const result = generateMonitorStats({
      aggregationMode: 'aggregated',
      isDemoMode: false,
      prometheusMetrics: {
        // kvCacheUsage is 0-1; 1.5 exercises the >100 clamp.
        'vllm-prefill-0': {
          kvCacheUsage: 1.5,
          gpuUtilization: 0,
          requestRate: 0,
          latencyP95: 0,
          latencyP99: 0,
          tokenRate: 0,
          activeRequests: 0,
          errorRate: 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as PodMetrics,
      },
      selectedStack: stack,
    })

    expect(result).toHaveLength(1)
    expect(result[0].utilizationPercent).toBe(100)
  })

  it('aggregated mode: skips roles that have no components', () => {
    const stack = buildStack({
      prefill: [buildComponent({ replicas: 1, readyReplicas: 1, podNames: ['vllm-prefill-0'] })],
    })

    const result = generateMonitorStats({
      aggregationMode: 'aggregated',
      isDemoMode: false,
      prometheusMetrics: null,
      selectedStack: stack,
    })
    // Only Prefill has components => exactly one entry, none for decode/unified.
    expect(result).toHaveLength(1)
    expect(result[0].podName).toBe('Prefill (1)')
  })

  it('disaggregated mode: emits one entry per replica per component', () => {
    const stack = buildStack({
      prefill: [buildComponent({ replicas: 2, readyReplicas: 2, podNames: ['vllm-prefill-0', 'vllm-prefill-1'] })],
      decode: [buildComponent({ name: 'decode', type: 'decode', replicas: 1, readyReplicas: 1, podNames: ['vllm-decode-0'] })],
    })

    const result = generateMonitorStats({
      aggregationMode: 'disaggregated',
      isDemoMode: false,
      prometheusMetrics: null,
      selectedStack: stack,
    })

    // 2 prefill + 1 decode = 3 replicas total.
    expect(result).toHaveLength(3)
    const prefixes = result.map(stat => stat.podName.split('-')[0])
    expect(prefixes.filter(p => p === 'P')).toHaveLength(2)
    expect(prefixes.filter(p => p === 'D')).toHaveLength(1)
    for (const stat of result) {
      expect(stat.totalCapacityGB).toBeGreaterThan(0)
      expect(stat.utilizationPercent).toBeGreaterThanOrEqual(0)
      expect(stat.utilizationPercent).toBeLessThanOrEqual(100)
    }
  })

  it('disaggregated mode: uses prometheus utilization for a specific pod when available', () => {
    const stack = buildStack({
      decode: [buildComponent({ name: 'decode', type: 'decode', replicas: 1, readyReplicas: 1, podNames: ['vllm-decode-0'] })],
    })

    const result = generateMonitorStats({
      aggregationMode: 'disaggregated',
      isDemoMode: false,
      prometheusMetrics: {
        'vllm-decode-0': {
          kvCacheUsage: 0.42,
          gpuUtilization: 0,
          requestRate: 0,
          latencyP95: 0,
          latencyP99: 0,
          tokenRate: 0,
          activeRequests: 0,
          errorRate: 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as PodMetrics,
      },
      selectedStack: stack,
    })

    expect(result).toHaveLength(1)
    // 0.42 * 100 = 42 -> Math.round => 42
    expect(result[0].utilizationPercent).toBe(42)
  })

  it('disaggregated mode: guarantees at least one replica per component even when replicas=0', () => {
    const stack = buildStack({
      prefill: [buildComponent({ replicas: 0, readyReplicas: 0, podNames: [] })],
    })

    const result = generateMonitorStats({
      aggregationMode: 'disaggregated',
      isDemoMode: false,
      prometheusMetrics: null,
      selectedStack: stack,
    })
    expect(result).toHaveLength(1)
  })
})
