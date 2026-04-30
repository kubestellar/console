import { describe, it, expect } from 'vitest'
import {
  KEDA_DEMO_DATA,
  type KedaScaledObjectStatus,
  type KedaTriggerType,
} from '../keda_status/demoData'

describe('KEDA_DEMO_DATA', () => {
  it('is defined', () => {
    expect(KEDA_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth = ['healthy', 'degraded', 'not-installed']
    expect(validHealth).toContain(KEDA_DEMO_DATA.health)
  })

  it('has operatorPods with ready/total counts', () => {
    expect(typeof KEDA_DEMO_DATA.operatorPods.ready).toBe('number')
    expect(typeof KEDA_DEMO_DATA.operatorPods.total).toBe('number')
    expect(KEDA_DEMO_DATA.operatorPods.ready).toBeLessThanOrEqual(KEDA_DEMO_DATA.operatorPods.total)
  })

  it('has scaledObjects array with entries', () => {
    expect(Array.isArray(KEDA_DEMO_DATA.scaledObjects)).toBe(true)
    expect(KEDA_DEMO_DATA.scaledObjects.length).toBeGreaterThan(0)
  })

  it('each scaledObject has required fields', () => {
    const validStatus: KedaScaledObjectStatus[] = ['ready', 'degraded', 'paused', 'error']
    for (const so of KEDA_DEMO_DATA.scaledObjects) {
      expect(typeof so.name).toBe('string')
      expect(typeof so.namespace).toBe('string')
      expect(validStatus).toContain(so.status)
      expect(typeof so.target).toBe('string')
      expect(typeof so.currentReplicas).toBe('number')
      expect(typeof so.desiredReplicas).toBe('number')
      expect(typeof so.minReplicas).toBe('number')
      expect(typeof so.maxReplicas).toBe('number')
    }
  })

  it('each scaledObject has triggers array', () => {
    const validTypes: KedaTriggerType[] = ['kafka', 'prometheus', 'rabbitmq', 'aws-sqs-queue', 'azure-servicebus', 'redis', 'cron', 'cpu', 'memory', 'external']
    for (const so of KEDA_DEMO_DATA.scaledObjects) {
      expect(Array.isArray(so.triggers)).toBe(true)
      for (const trigger of so.triggers) {
        expect(validTypes).toContain(trigger.type)
        expect(typeof trigger.source).toBe('string')
        expect(typeof trigger.currentValue).toBe('number')
        expect(typeof trigger.targetValue).toBe('number')
      }
    }
  })

  it('has totalScaledJobs count', () => {
    expect(typeof KEDA_DEMO_DATA.totalScaledJobs).toBe('number')
    expect(KEDA_DEMO_DATA.totalScaledJobs).toBeGreaterThanOrEqual(0)
  })
})
