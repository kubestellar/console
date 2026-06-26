import { describe, it, expect } from 'vitest'
import type {
  AggregationMode,
  ViewMode,
  MetricType,
  PodMetricHistory,
  PodHistoryMap,
  AggregateMetrics,
} from '../KVCacheMonitor.types'

describe('KVCacheMonitor.types', () => {
  describe('type guards and constants', () => {
    it('AggregationMode accepts aggregated and disaggregated', () => {
      const modes: AggregationMode[] = ['aggregated', 'disaggregated']
      expect(modes).toHaveLength(2)
    })

    it('ViewMode accepts gauges, horseshoe, and heatmap', () => {
      const views: ViewMode[] = ['gauges', 'horseshoe', 'heatmap']
      expect(views).toHaveLength(3)
    })

    it('MetricType accepts util and hitRate', () => {
      const metrics: MetricType[] = ['util', 'hitRate']
      expect(metrics).toHaveLength(2)
    })
  })

  describe('PodMetricHistory interface', () => {
    it('stores util and hitRate arrays', () => {
      const history: PodMetricHistory = {
        util: [50, 60, 70],
        hitRate: [90, 91, 92],
      }
      expect(history.util).toHaveLength(3)
      expect(history.hitRate).toHaveLength(3)
    })
  })

  describe('PodHistoryMap type', () => {
    it('maps pod names to metric histories', () => {
      const map: PodHistoryMap = {
        'pod-0': { util: [50], hitRate: [90] },
        'pod-1': { util: [60], hitRate: [85] },
      }
      expect(Object.keys(map)).toHaveLength(2)
      expect(map['pod-0'].util[0]).toBe(50)
    })
  })

  describe('AggregateMetrics interface', () => {
    it('contains aggregate statistics fields', () => {
      const metrics: AggregateMetrics = {
        avgUtil: 55.5,
        totalUsed: 120,
        totalCapacity: 200,
        avgHitRate: 88.3,
      }
      expect(metrics.avgUtil).toBe(55.5)
      expect(metrics.totalCapacity).toBe(200)
    })
  })
})
