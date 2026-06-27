import { describe, it, expect } from 'vitest'
import {
  OTEL_DEMO_DATA,
  type OtelCollectorState,
  type OtelSignal,
} from '../../../lib/demo/otel'

describe('OTEL_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(OTEL_DEMO_DATA.health)
  })

  describe('collectors', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(OTEL_DEMO_DATA.collectors)).toBe(true)
      expect(OTEL_DEMO_DATA.collectors.length).toBeGreaterThan(0)
    })

    it('each collector has required fields with valid state', () => {
      const validStates: OtelCollectorState[] = ['Running', 'Degraded', 'Pending', 'Failed']
      for (const c of OTEL_DEMO_DATA.collectors) {
        expect(typeof c.name).toBe('string')
        expect(c.name.length).toBeGreaterThan(0)
        expect(typeof c.namespace).toBe('string')
        expect(typeof c.cluster).toBe('string')
        expect(validStates).toContain(c.state)
        expect(typeof c.version).toBe('string')
        expect(typeof c.mode).toBe('string')
      }
    })

    it('each collector has pipelines array', () => {
      const validSignals: OtelSignal[] = ['traces', 'metrics', 'logs']
      for (const c of OTEL_DEMO_DATA.collectors) {
        expect(Array.isArray(c.pipelines)).toBe(true)
        for (const p of c.pipelines) {
          expect(typeof p.name).toBe('string')
          expect(validSignals).toContain(p.signal)
          expect(Array.isArray(p.receivers)).toBe(true)
          expect(Array.isArray(p.processors)).toBe(true)
          expect(Array.isArray(p.exporters)).toBe(true)
          expect(typeof p.healthy).toBe('boolean')
        }
      }
    })

    it('each collector has non-negative counters', () => {
      for (const c of OTEL_DEMO_DATA.collectors) {
        expect(c.spansAccepted).toBeGreaterThanOrEqual(0)
        expect(c.spansDropped).toBeGreaterThanOrEqual(0)
        expect(c.metricsAccepted).toBeGreaterThanOrEqual(0)
        expect(c.metricsDropped).toBeGreaterThanOrEqual(0)
        expect(c.logsAccepted).toBeGreaterThanOrEqual(0)
        expect(c.logsDropped).toBeGreaterThanOrEqual(0)
        expect(c.exportErrors).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('summary', () => {
    it('totalCollectors matches collectors array', () => {
      expect(OTEL_DEMO_DATA.summary.totalCollectors).toBe(
        OTEL_DEMO_DATA.collectors.length,
      )
    })

    it('running + degraded does not exceed total', () => {
      const { runningCollectors, degradedCollectors, totalCollectors } = OTEL_DEMO_DATA.summary
      expect(runningCollectors + degradedCollectors).toBeLessThanOrEqual(totalCollectors)
    })

    it('healthyPipelines does not exceed totalPipelines', () => {
      expect(OTEL_DEMO_DATA.summary.healthyPipelines).toBeLessThanOrEqual(
        OTEL_DEMO_DATA.summary.totalPipelines,
      )
    })

    it('uniqueReceivers and uniqueExporters are arrays', () => {
      expect(Array.isArray(OTEL_DEMO_DATA.summary.uniqueReceivers)).toBe(true)
      expect(Array.isArray(OTEL_DEMO_DATA.summary.uniqueExporters)).toBe(true)
    })

    it('aggregated counters are non-negative', () => {
      const s = OTEL_DEMO_DATA.summary
      expect(s.totalSpansAccepted).toBeGreaterThanOrEqual(0)
      expect(s.totalSpansDropped).toBeGreaterThanOrEqual(0)
      expect(s.totalMetricsAccepted).toBeGreaterThanOrEqual(0)
      expect(s.totalExportErrors).toBeGreaterThanOrEqual(0)
    })
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(OTEL_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
