import { describe, it, expect } from 'vitest'
import {
  FAILOVER_TIMELINE_DEMO_DATA,
  type FailoverTimelineData,
  type FailoverEventType,
  type FailoverSeverity,
} from '../failover_timeline/demoData'

describe('FAILOVER_TIMELINE_DEMO_DATA', () => {
  it('is defined', () => {
    expect(FAILOVER_TIMELINE_DEMO_DATA).toBeDefined()
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(FAILOVER_TIMELINE_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  it('activeClusters is non-negative', () => {
    expect(FAILOVER_TIMELINE_DEMO_DATA.activeClusters).toBeGreaterThanOrEqual(0)
  })

  it('totalClusters is positive', () => {
    expect(FAILOVER_TIMELINE_DEMO_DATA.totalClusters).toBeGreaterThan(0)
  })

  it('activeClusters does not exceed totalClusters', () => {
    expect(FAILOVER_TIMELINE_DEMO_DATA.activeClusters).toBeLessThanOrEqual(
      FAILOVER_TIMELINE_DEMO_DATA.totalClusters,
    )
  })

  it('lastFailover is a valid ISO string or null', () => {
    const { lastFailover } = FAILOVER_TIMELINE_DEMO_DATA
    if (lastFailover !== null) {
      expect(new Date(lastFailover).getTime()).toBeGreaterThan(0)
    }
  })

  describe('events', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(FAILOVER_TIMELINE_DEMO_DATA.events)).toBe(true)
      expect(FAILOVER_TIMELINE_DEMO_DATA.events.length).toBeGreaterThan(0)
    })

    it('each event has required fields', () => {
      const validTypes: FailoverEventType[] = [
        'cluster_down', 'binding_reschedule', 'cluster_recovery', 'replica_rebalance',
      ]
      const validSeverities: FailoverSeverity[] = ['critical', 'warning', 'info']
      for (const evt of FAILOVER_TIMELINE_DEMO_DATA.events) {
        expect(typeof evt.timestamp).toBe('string')
        expect(new Date(evt.timestamp).getTime()).toBeGreaterThan(0)
        expect(validTypes).toContain(evt.eventType)
        expect(typeof evt.cluster).toBe('string')
        expect(typeof evt.workload).toBe('string')
        expect(typeof evt.details).toBe('string')
        expect(validSeverities).toContain(evt.severity)
      }
    })

    it('covers multiple event types', () => {
      const types = new Set(FAILOVER_TIMELINE_DEMO_DATA.events.map(e => e.eventType))
      expect(types.size).toBeGreaterThan(1)
    })

    it('covers multiple severity levels', () => {
      const severities = new Set(FAILOVER_TIMELINE_DEMO_DATA.events.map(e => e.severity))
      expect(severities.size).toBeGreaterThan(1)
    })

    it('has at least one cluster_down event', () => {
      const hasDown = FAILOVER_TIMELINE_DEMO_DATA.events.some(e => e.eventType === 'cluster_down')
      expect(hasDown).toBe(true)
    })

    it('has at least one cluster_recovery event', () => {
      const hasRecovery = FAILOVER_TIMELINE_DEMO_DATA.events.some(
        e => e.eventType === 'cluster_recovery',
      )
      expect(hasRecovery).toBe(true)
    })
  })
})
