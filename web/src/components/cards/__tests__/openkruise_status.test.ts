import { describe, it, expect } from 'vitest'
import {
  OPENKRUISE_DEMO_DATA,
  type OpenKruiseDemoCloneSet,
  type OpenKruiseDemoAdvancedStatefulSet,
} from '../openkruise_status/demoData'

describe('OPENKRUISE_DEMO_DATA', () => {
  it('is defined', () => {
    expect(OPENKRUISE_DEMO_DATA).toBeDefined()
  })

  it('has cloneSets array with entries', () => {
    expect(Array.isArray(OPENKRUISE_DEMO_DATA.cloneSets)).toBe(true)
    expect(OPENKRUISE_DEMO_DATA.cloneSets.length).toBeGreaterThan(0)
  })

  it('each cloneSet has required fields', () => {
    const validStatuses = ['healthy', 'updating', 'degraded', 'failed'] as const
    const validStrategies = ['ReCreate', 'InPlaceIfPossible', 'InPlaceOnly'] as const
    for (const cs of OPENKRUISE_DEMO_DATA.cloneSets) {
      expect(typeof cs.name).toBe('string')
      expect(typeof cs.namespace).toBe('string')
      expect(typeof cs.cluster).toBe('string')
      expect(typeof cs.replicas).toBe('number')
      expect(typeof cs.readyReplicas).toBe('number')
      expect(validStatuses).toContain(cs.status)
      expect(validStrategies).toContain(cs.updateStrategy)
    }
  })

  it('cloneSet readyReplicas <= replicas', () => {
    for (const cs of OPENKRUISE_DEMO_DATA.cloneSets) {
      expect(cs.readyReplicas).toBeLessThanOrEqual(cs.replicas)
    }
  })

  it('has advancedStatefulSets array', () => {
    expect(Array.isArray(OPENKRUISE_DEMO_DATA.advancedStatefulSets)).toBe(true)
  })

  it('each advancedStatefulSet has required fields', () => {
    for (const ss of OPENKRUISE_DEMO_DATA.advancedStatefulSets) {
      expect(typeof ss.name).toBe('string')
      expect(typeof ss.namespace).toBe('string')
      expect(typeof ss.cluster).toBe('string')
      expect(typeof ss.replicas).toBe('number')
      expect(typeof ss.readyReplicas).toBe('number')
    }
  })

  it('has advancedDaemonSets array', () => {
    expect(Array.isArray(OPENKRUISE_DEMO_DATA.advancedDaemonSets)).toBe(true)
  })

  it('has sidecarSets array', () => {
    expect(Array.isArray(OPENKRUISE_DEMO_DATA.sidecarSets)).toBe(true)
  })

  it('has broadcastJobs array', () => {
    expect(Array.isArray(OPENKRUISE_DEMO_DATA.broadcastJobs)).toBe(true)
  })

  it('has advancedCronJobs array', () => {
    expect(Array.isArray(OPENKRUISE_DEMO_DATA.advancedCronJobs)).toBe(true)
  })

  it('has controllerVersion string', () => {
    expect(typeof OPENKRUISE_DEMO_DATA.controllerVersion).toBe('string')
    expect(OPENKRUISE_DEMO_DATA.controllerVersion.length).toBeGreaterThan(0)
  })

  it('has totalInjectedPods count', () => {
    expect(typeof OPENKRUISE_DEMO_DATA.totalInjectedPods).toBe('number')
    expect(OPENKRUISE_DEMO_DATA.totalInjectedPods).toBeGreaterThanOrEqual(0)
  })
})
