import { describe, it, expect } from 'vitest'
import {
  DAPR_DEMO_DATA,
  type DaprHealth,
  type DaprControlPlanePodStatus,
  type DaprComponentType,
} from '../dapr_status/demoData'

describe('DAPR_DEMO_DATA', () => {
  it('is defined', () => {
    expect(DAPR_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: DaprHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(DAPR_DEMO_DATA.health)
  })

  it('has controlPlane array with entries', () => {
    expect(Array.isArray(DAPR_DEMO_DATA.controlPlane)).toBe(true)
    expect(DAPR_DEMO_DATA.controlPlane.length).toBeGreaterThan(0)
  })

  it('each control plane pod has required fields', () => {
    const validStatuses: DaprControlPlanePodStatus[] = ['running', 'pending', 'failed', 'unknown']
    for (const pod of DAPR_DEMO_DATA.controlPlane) {
      expect(typeof pod.name).toBe('string')
      expect(typeof pod.namespace).toBe('string')
      expect(validStatuses).toContain(pod.status)
    }
  })

  it('has components array', () => {
    expect(Array.isArray(DAPR_DEMO_DATA.components)).toBe(true)
  })

  it('each component has valid type', () => {
    const validTypes: DaprComponentType[] = ['state-store', 'pubsub', 'binding']
    for (const comp of DAPR_DEMO_DATA.components) {
      expect(typeof comp.name).toBe('string')
      expect(validTypes).toContain(comp.type)
    }
  })

  it('has apps sidecar with total and namespaces counts', () => {
    expect(typeof DAPR_DEMO_DATA.apps.total).toBe('number')
    expect(typeof DAPR_DEMO_DATA.apps.namespaces).toBe('number')
    expect(DAPR_DEMO_DATA.apps.total).toBeGreaterThan(0)
  })

  it('has buildingBlocks with required fields', () => {
    expect(typeof DAPR_DEMO_DATA.buildingBlocks.stateStores).toBe('number')
    expect(typeof DAPR_DEMO_DATA.buildingBlocks.pubsubs).toBe('number')
  })

  it('has summary with required fields', () => {
    expect(typeof DAPR_DEMO_DATA.summary.totalControlPlanePods).toBe('number')
    expect(typeof DAPR_DEMO_DATA.summary.runningControlPlanePods).toBe('number')
    expect(typeof DAPR_DEMO_DATA.summary.totalComponents).toBe('number')
    expect(typeof DAPR_DEMO_DATA.summary.totalDaprApps).toBe('number')
  })

  it('summary running pods <= total pods', () => {
    expect(DAPR_DEMO_DATA.summary.runningControlPlanePods).toBeLessThanOrEqual(
      DAPR_DEMO_DATA.summary.totalControlPlanePods
    )
  })
})
