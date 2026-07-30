import { describe, it, expect } from 'vitest'
import {
  SPIRE_DEMO_DATA,
  type SpireHealth,
  type SpirePodPhase,
} from '../../../lib/demo/spire'

describe('SPIRE_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    const valid: SpireHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(SPIRE_DEMO_DATA.health)
  })

  it('has a version string', () => {
    expect(typeof SPIRE_DEMO_DATA.version).toBe('string')
    expect(SPIRE_DEMO_DATA.version.length).toBeGreaterThan(0)
  })

  it('has a trustDomain string', () => {
    expect(typeof SPIRE_DEMO_DATA.trustDomain).toBe('string')
    expect(SPIRE_DEMO_DATA.trustDomain.length).toBeGreaterThan(0)
  })

  describe('serverPods', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(SPIRE_DEMO_DATA.serverPods)).toBe(true)
      expect(SPIRE_DEMO_DATA.serverPods.length).toBeGreaterThan(0)
    })

    it('each pod has required fields with valid phase', () => {
      const validPhases: SpirePodPhase[] = [
        'Running', 'Pending', 'Failed', 'Succeeded', 'Unknown',
      ]
      for (const pod of SPIRE_DEMO_DATA.serverPods) {
        expect(typeof pod.name).toBe('string')
        expect(pod.name.length).toBeGreaterThan(0)
        expect(validPhases).toContain(pod.phase)
        expect(typeof pod.ready).toBe('boolean')
        expect(typeof pod.restarts).toBe('number')
        expect(pod.restarts).toBeGreaterThanOrEqual(0)
        expect(typeof pod.node).toBe('string')
      }
    })

    it('each pod has valid startedAt ISO string', () => {
      for (const pod of SPIRE_DEMO_DATA.serverPods) {
        expect(new Date(pod.startedAt).getTime()).not.toBeNaN()
      }
    })
  })

  describe('agentDaemonSet', () => {
    it('has required fields', () => {
      const ds = SPIRE_DEMO_DATA.agentDaemonSet
      expect(typeof ds.name).toBe('string')
      expect(typeof ds.namespace).toBe('string')
      expect(typeof ds.desiredNumberScheduled).toBe('number')
      expect(typeof ds.numberReady).toBe('number')
      expect(typeof ds.numberAvailable).toBe('number')
      expect(typeof ds.numberMisscheduled).toBe('number')
    })

    it('ready does not exceed desired', () => {
      const ds = SPIRE_DEMO_DATA.agentDaemonSet
      expect(ds.numberReady).toBeLessThanOrEqual(ds.desiredNumberScheduled)
      expect(ds.numberAvailable).toBeLessThanOrEqual(ds.desiredNumberScheduled)
    })
  })

  describe('summary', () => {
    it('has non-negative counts', () => {
      const { summary } = SPIRE_DEMO_DATA
      expect(summary.registrationEntries).toBeGreaterThanOrEqual(0)
      expect(summary.attestedAgents).toBeGreaterThanOrEqual(0)
      expect(summary.trustBundleAgeHours).toBeGreaterThanOrEqual(0)
    })

    it('serverReadyReplicas does not exceed serverDesiredReplicas', () => {
      expect(SPIRE_DEMO_DATA.summary.serverReadyReplicas).toBeLessThanOrEqual(
        SPIRE_DEMO_DATA.summary.serverDesiredReplicas,
      )
    })
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(SPIRE_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
