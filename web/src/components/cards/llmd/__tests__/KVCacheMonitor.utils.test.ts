// @vitest-environment node
import { describe, expect, it } from 'vitest'
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
  HEATMAP_LEGEND,
  KVCACHE_MONITOR_DIV_STYLE_1,
  KVCACHE_MONITOR_DIV_STYLE_2,
  updatePodHistory,
} from '../KVCacheMonitor.utils'
import type { KVCacheStats } from '../../../../lib/llmd/mockData'

function makeStat(overrides: Partial<KVCacheStats> = {}): KVCacheStats {
  return {
    cluster: 'test-cluster',
    evictionRate: 0.01,
    hitRate: 0.92,
    lastUpdated: new Date(),
    namespace: 'default',
    podName: 'pod-0',
    totalCapacityGB: 80,
    usedGB: 40,
    utilizationPercent: 50,
    ...overrides,
  }
}

describe('KVCacheMonitor.utils', () => {
  describe('calculateAggregateMetrics', () => {
    it('returns zeros for empty array', () => {
      const result = calculateAggregateMetrics([])
      expect(result).toEqual({
        avgHitRate: 0,
        avgUtil: 0,
        totalCapacity: 0,
        totalUsed: 0,
      })
    })

    it('returns zeros for null/undefined-like input', () => {
      const result = calculateAggregateMetrics([] as KVCacheStats[])
      expect(result.avgUtil).toBe(0)
    })

    it('calculates correct averages for single stat', () => {
      const stats = [makeStat({ hitRate: 0.9, utilizationPercent: 60, totalCapacityGB: 80, usedGB: 48 })]
      const result = calculateAggregateMetrics(stats)
      expect(result.avgHitRate).toBe(90)
      expect(result.avgUtil).toBe(60)
      expect(result.totalCapacity).toBe(80)
      expect(result.totalUsed).toBe(48)
    })

    it('calculates correct averages for multiple stats', () => {
      const stats = [
        makeStat({ hitRate: 0.8, utilizationPercent: 40, totalCapacityGB: 80, usedGB: 32 }),
        makeStat({ hitRate: 0.9, utilizationPercent: 60, totalCapacityGB: 80, usedGB: 48 }),
      ]
      const result = calculateAggregateMetrics(stats)
      expect(result.avgHitRate).toBe(85)
      expect(result.avgUtil).toBe(50)
      expect(result.totalCapacity).toBe(160)
      expect(result.totalUsed).toBe(80)
    })
  })

  describe('calculateTrend', () => {
    it('returns 0 for empty array', () => {
      expect(calculateTrend([])).toBe(0)
    })

    it('returns 0 for single-element array', () => {
      expect(calculateTrend([50])).toBe(0)
    })

    it('returns positive difference for increasing trend', () => {
      expect(calculateTrend([40, 50, 60])).toBe(10)
    })

    it('returns negative difference for decreasing trend', () => {
      expect(calculateTrend([60, 50, 40])).toBe(-10)
    })

    it('returns 0 for flat trend', () => {
      expect(calculateTrend([50, 50, 50])).toBe(0)
    })
  })

  describe('updatePodHistory', () => {
    it('creates new entry for unknown pod', () => {
      const result = updatePodHistory({}, [makeStat({ podName: 'new-pod', utilizationPercent: 75, hitRate: 0.9 })])
      expect(result['new-pod']).toBeDefined()
      expect(result['new-pod'].util).toEqual([75])
      expect(result['new-pod'].hitRate).toEqual([90])
    })

    it('appends to existing history', () => {
      const prev = { 'pod-0': { util: [50, 55], hitRate: [90, 91] } }
      const result = updatePodHistory(prev, [makeStat({ podName: 'pod-0', utilizationPercent: 60, hitRate: 0.92 })])
      expect(result['pod-0'].util).toEqual([50, 55, 60])
      expect(result['pod-0'].hitRate).toEqual([90, 91, 92])
    })

    it('trims history to limit (19 previous + 1 new = 20 max)', () => {
      const longHistory = Array.from({ length: 25 }, (_, i) => i)
      const prev = { 'pod-0': { util: longHistory, hitRate: longHistory } }
      const result = updatePodHistory(prev, [makeStat({ podName: 'pod-0', utilizationPercent: 99, hitRate: 0.99 })])
      expect(result['pod-0'].util.length).toBeLessThanOrEqual(20)
      expect(result['pod-0'].util[result['pod-0'].util.length - 1]).toBe(99)
    })
  })

  describe('getGaugeGridClass', () => {
    it('returns flex layout for <= 2 items (expanded)', () => {
      expect(getGaugeGridClass(1, true)).toContain('flex')
      expect(getGaugeGridClass(2, true)).toContain('flex')
    })

    it('returns grid layout for > 2 items (expanded)', () => {
      expect(getGaugeGridClass(3, true)).toContain('grid')
    })

    it('returns flex layout for <= 2 items (collapsed)', () => {
      expect(getGaugeGridClass(1, false)).toContain('flex')
      expect(getGaugeGridClass(2, false)).toContain('flex')
    })

    it('returns grid layout for many items (collapsed)', () => {
      expect(getGaugeGridClass(10, false)).toContain('grid')
    })
  })

  describe('getGaugeSize', () => {
    it('returns largest size for few items expanded', () => {
      expect(getGaugeSize(1, true)).toBe(200)
      expect(getGaugeSize(2, true)).toBe(200)
    })

    it('returns smaller sizes for more items', () => {
      expect(getGaugeSize(4, true)).toBe(180)
      expect(getGaugeSize(6, true)).toBe(160)
      expect(getGaugeSize(7, true)).toBe(140)
    })

    it('returns smaller sizes when collapsed', () => {
      expect(getGaugeSize(2, false)).toBe(120)
      expect(getGaugeSize(3, false)).toBe(130)
    })
  })

  describe('getHorseshoeGridClass', () => {
    it('returns 2-col grid for few items', () => {
      expect(getHorseshoeGridClass(2, true)).toContain('grid-cols-2')
      expect(getHorseshoeGridClass(2, false)).toContain('grid-cols-2')
    })

    it('adapts columns for more items', () => {
      expect(getHorseshoeGridClass(7, true)).toContain('grid-cols-2')
      expect(getHorseshoeGridClass(10, true)).toContain('grid-cols-2')
    })
  })

  describe('getHorseshoeSize', () => {
    it('returns largest size for few items expanded', () => {
      expect(getHorseshoeSize(2, true)).toBe(240)
    })

    it('decreases with more items', () => {
      expect(getHorseshoeSize(4, true)).toBe(200)
      expect(getHorseshoeSize(6, true)).toBe(180)
      expect(getHorseshoeSize(10, true)).toBe(160)
    })

    it('returns smaller sizes when collapsed', () => {
      expect(getHorseshoeSize(2, false)).toBe(180)
    })
  })

  describe('getHeatCellColors', () => {
    it('returns dark green for < 25%', () => {
      const result = getHeatCellColors(10)
      expect(result.bg).toBe('#166534')
    })

    it('returns green for 25-50%', () => {
      const result = getHeatCellColors(30)
      expect(result.bg).toBe('#22c55e')
    })

    it('returns yellow for 50-75%', () => {
      const result = getHeatCellColors(60)
      expect(result.bg).toBe('#eab308')
    })

    it('returns amber for 75-90%', () => {
      const result = getHeatCellColors(80)
      expect(result.bg).toBe('#f59e0b')
    })

    it('returns red for >= 90%', () => {
      const result = getHeatCellColors(95)
      expect(result.bg).toBe('#ef4444')
    })

    it('handles boundary values correctly', () => {
      expect(getHeatCellColors(25).bg).toBe('#22c55e')
      expect(getHeatCellColors(50).bg).toBe('#eab308')
      expect(getHeatCellColors(75).bg).toBe('#f59e0b')
      expect(getHeatCellColors(90).bg).toBe('#ef4444')
    })
  })

  describe('getDisplayPodName', () => {
    const mockT = ((key: string, fallback: string) => fallback) as unknown as Parameters<typeof getDisplayPodName>[0]

    it('translates aggregate prefill pod name', () => {
      expect(getDisplayPodName(mockT, 'Prefill (3)')).toBe('Prefill (3)')
    })

    it('translates aggregate decode pod name', () => {
      expect(getDisplayPodName(mockT, 'Decode (2)')).toBe('Decode (2)')
    })

    it('translates aggregate unified pod name', () => {
      expect(getDisplayPodName(mockT, 'Unified (4)')).toBe('Unified (4)')
    })

    it('strips vllm- prefix', () => {
      expect(getDisplayPodName(mockT, 'vllm-pod-1')).toBe('pod-1')
    })

    it('truncates to maxLength', () => {
      expect(getDisplayPodName(mockT, 'very-long-pod-name-here', 8)).toBe('very-lon')
    })

    it('does not truncate when maxLength is undefined', () => {
      expect(getDisplayPodName(mockT, 'full-name')).toBe('full-name')
    })
  })

  describe('generateMonitorStats', () => {
    it('returns empty array when no stack and not demo mode', () => {
      const result = generateMonitorStats({
        aggregationMode: 'aggregated',
        isDemoMode: false,
        prometheusMetrics: null,
        selectedStack: null,
      })
      expect(result).toEqual([])
    })

    it('returns demo data when no stack and demo mode', () => {
      const result = generateMonitorStats({
        aggregationMode: 'aggregated',
        isDemoMode: true,
        prometheusMetrics: null,
        selectedStack: null,
      })
      expect(result.length).toBeGreaterThan(0)
    })

    it('generates aggregated stats for selected stack', () => {
      const stack = {
        cluster: 'test-cluster',
        namespace: 'llmd',
        name: 'test-stack',
        components: {
          prefill: [{ name: 'prefill-svc', replicas: 2, readyReplicas: 2, podNames: ['p-0', 'p-1'] }],
          decode: [{ name: 'decode-svc', replicas: 1, readyReplicas: 1, podNames: ['d-0'] }],
          both: [],
        },
      }
      const result = generateMonitorStats({
        aggregationMode: 'aggregated',
        isDemoMode: false,
        prometheusMetrics: null,
        selectedStack: stack as any,
      })
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result.some(s => s.podName.startsWith('Prefill'))).toBe(true)
    })

    it('generates disaggregated stats for selected stack', () => {
      const stack = {
        cluster: 'test-cluster',
        namespace: 'llmd',
        name: 'test-stack',
        components: {
          prefill: [{ name: 'prefill-svc', replicas: 2, readyReplicas: 2, podNames: ['p-0', 'p-1'] }],
          decode: [],
          both: [],
        },
      }
      const result = generateMonitorStats({
        aggregationMode: 'disaggregated',
        isDemoMode: false,
        prometheusMetrics: null,
        selectedStack: stack as any,
      })
      expect(result.length).toBe(2)
      expect(result[0].podName).toMatch(/^P-/)
    })
  })

  describe('exported constants', () => {
    it('HEATMAP_LEGEND has 5 entries with correct colors', () => {
      expect(HEATMAP_LEGEND).toHaveLength(5)
      expect(HEATMAP_LEGEND[0].color).toBe('#166534')
      expect(HEATMAP_LEGEND[4].color).toBe('#ef4444')
    })

    it('DIV_STYLE constants have textShadow', () => {
      expect(KVCACHE_MONITOR_DIV_STYLE_1.textShadow).toBeDefined()
      expect(KVCACHE_MONITOR_DIV_STYLE_2.textShadow).toBeDefined()
    })
  })
})
