import { describe, it, expect } from 'vitest'
import {
  KNATIVE_DEMO_DATA,
  type KnativeServiceStatus,
  type KnativeBrokerStatus,
} from '../knative_status/demoData'

describe('KNATIVE_DEMO_DATA', () => {
  it('is defined', () => {
    expect(KNATIVE_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth = ['healthy', 'degraded', 'not-installed']
    expect(validHealth).toContain(KNATIVE_DEMO_DATA.health)
  })

  it('has servingControllerPods with ready/total', () => {
    expect(typeof KNATIVE_DEMO_DATA.servingControllerPods.ready).toBe('number')
    expect(typeof KNATIVE_DEMO_DATA.servingControllerPods.total).toBe('number')
    expect(KNATIVE_DEMO_DATA.servingControllerPods.ready).toBeLessThanOrEqual(
      KNATIVE_DEMO_DATA.servingControllerPods.total
    )
  })

  it('has eventingControllerPods with ready/total', () => {
    expect(typeof KNATIVE_DEMO_DATA.eventingControllerPods.ready).toBe('number')
    expect(typeof KNATIVE_DEMO_DATA.eventingControllerPods.total).toBe('number')
  })

  it('has services array with entries', () => {
    expect(Array.isArray(KNATIVE_DEMO_DATA.services)).toBe(true)
    expect(KNATIVE_DEMO_DATA.services.length).toBeGreaterThan(0)
  })

  it('each service has required fields', () => {
    const validStatus: KnativeServiceStatus[] = ['ready', 'not-ready', 'unknown']
    for (const svc of KNATIVE_DEMO_DATA.services) {
      expect(typeof svc.name).toBe('string')
      expect(typeof svc.namespace).toBe('string')
      expect(validStatus).toContain(svc.status)
    }
  })

  it('has revisions array', () => {
    expect(Array.isArray(KNATIVE_DEMO_DATA.revisions)).toBe(true)
  })

  it('has brokers array', () => {
    expect(Array.isArray(KNATIVE_DEMO_DATA.brokers)).toBe(true)
    const validBrokerStatus: KnativeBrokerStatus[] = ['ready', 'not-ready', 'unknown']
    for (const broker of KNATIVE_DEMO_DATA.brokers) {
      expect(typeof broker.name).toBe('string')
      expect(validBrokerStatus).toContain(broker.status)
    }
  })
})
