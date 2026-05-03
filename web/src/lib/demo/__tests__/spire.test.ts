import { describe, it, expect } from 'vitest'
import { SPIRE_DEMO_DATA } from '../spire'

describe('SPIRE_DEMO_DATA', () => {
  const data = SPIRE_DEMO_DATA

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(data.health)
  })

  it('has version and trust domain', () => {
    expect(data.version).toBeTruthy()
    expect(data.trustDomain).toBeTruthy()
  })

  it('has server pods with required fields', () => {
    expect(data.serverPods.length).toBeGreaterThan(0)
    for (const pod of data.serverPods) {
      expect(pod.name).toBeTruthy()
      expect(['Running', 'Pending', 'Failed', 'Succeeded', 'Unknown']).toContain(pod.phase)
      expect(typeof pod.ready).toBe('boolean')
    }
  })

  it('has agent daemonset', () => {
    expect(data.agentDaemonSet).not.toBeNull()
    const ds = data.agentDaemonSet!
    expect(typeof ds.desiredNumberScheduled).toBe('number')
    expect(typeof ds.numberReady).toBe('number')
    expect(ds.desiredNumberScheduled).toBeGreaterThanOrEqual(ds.numberReady)
  })

  it('has consistent summary', () => {
    const s = data.summary
    expect(typeof s.registrationEntries).toBe('number')
    expect(typeof s.attestedAgents).toBe('number')
    expect(typeof s.trustBundleAgeHours).toBe('number')
    expect(s.serverDesiredReplicas).toBeGreaterThanOrEqual(s.serverReadyReplicas)
  })

  it('has a valid lastCheckTime', () => {
    expect(new Date(data.lastCheckTime).getTime()).toBeGreaterThan(0)
  })
})
