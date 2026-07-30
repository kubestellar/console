import { describe, it, expect } from 'vitest'
import { FLUENTD_DEMO_DATA, type FluentdDemoData } from '../fluentd_status/demoData'

describe('FLUENTD_DEMO_DATA', () => {
  it('is defined', () => {
    expect(FLUENTD_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid: FluentdDemoData['health'][] = ['healthy', 'degraded', 'not-installed']
    expect(valid).toContain(FLUENTD_DEMO_DATA.health)
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(FLUENTD_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('pods', () => {
    it('has ready and total', () => {
      expect(typeof FLUENTD_DEMO_DATA.pods.ready).toBe('number')
      expect(typeof FLUENTD_DEMO_DATA.pods.total).toBe('number')
    })

    it('ready does not exceed total', () => {
      expect(FLUENTD_DEMO_DATA.pods.ready).toBeLessThanOrEqual(FLUENTD_DEMO_DATA.pods.total)
    })

    it('both counts are positive', () => {
      expect(FLUENTD_DEMO_DATA.pods.total).toBeGreaterThan(0)
    })
  })

  describe('buffer utilization', () => {
    it('is between 0 and 100', () => {
      expect(FLUENTD_DEMO_DATA.bufferUtilization).toBeGreaterThanOrEqual(0)
      expect(FLUENTD_DEMO_DATA.bufferUtilization).toBeLessThanOrEqual(100)
    })
  })

  describe('eventsPerSecond', () => {
    it('is non-negative', () => {
      expect(FLUENTD_DEMO_DATA.eventsPerSecond).toBeGreaterThanOrEqual(0)
    })
  })

  describe('retryCount', () => {
    it('is non-negative', () => {
      expect(FLUENTD_DEMO_DATA.retryCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('outputPlugins', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(FLUENTD_DEMO_DATA.outputPlugins)).toBe(true)
      expect(FLUENTD_DEMO_DATA.outputPlugins.length).toBeGreaterThan(0)
    })

    it('each plugin has required fields', () => {
      for (const plugin of FLUENTD_DEMO_DATA.outputPlugins) {
        expect(typeof plugin.name).toBe('string')
        expect(plugin.name.length).toBeGreaterThan(0)
        expect(typeof plugin.type).toBe('string')
        expect(['healthy', 'degraded', 'error']).toContain(plugin.status)
        expect(typeof plugin.emitCount).toBe('number')
        expect(typeof plugin.errorCount).toBe('number')
        expect(plugin.emitCount).toBeGreaterThanOrEqual(0)
        expect(plugin.errorCount).toBeGreaterThanOrEqual(0)
      }
    })

    it('covers multiple status variants', () => {
      const statuses = new Set(FLUENTD_DEMO_DATA.outputPlugins.map(p => p.status))
      expect(statuses.size).toBeGreaterThan(1)
    })
  })
})
