import { describe, it, expect } from 'vitest'
import { CLOUDEVENTS_DEMO_DATA, type CloudEventsDemoData } from '../cloudevents_status/demoData'

describe('CLOUDEVENTS_DEMO_DATA', () => {
  it('is defined', () => {
    expect(CLOUDEVENTS_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid: CloudEventsDemoData['health'][] = ['healthy', 'degraded', 'not-installed']
    expect(valid).toContain(CLOUDEVENTS_DEMO_DATA.health)
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(CLOUDEVENTS_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('brokers', () => {
    it('has non-negative counts', () => {
      const { brokers } = CLOUDEVENTS_DEMO_DATA
      expect(brokers.total).toBeGreaterThanOrEqual(0)
      expect(brokers.ready).toBeGreaterThanOrEqual(0)
      expect(brokers.notReady).toBeGreaterThanOrEqual(0)
    })

    it('ready + notReady equals total', () => {
      const { brokers } = CLOUDEVENTS_DEMO_DATA
      expect(brokers.ready + brokers.notReady).toBe(brokers.total)
    })
  })

  describe('triggers', () => {
    it('has non-negative counts', () => {
      const { triggers } = CLOUDEVENTS_DEMO_DATA
      expect(triggers.total).toBeGreaterThanOrEqual(0)
      expect(triggers.ready).toBeGreaterThanOrEqual(0)
      expect(triggers.notReady).toBeGreaterThanOrEqual(0)
    })

    it('ready + notReady equals total', () => {
      const { triggers } = CLOUDEVENTS_DEMO_DATA
      expect(triggers.ready + triggers.notReady).toBe(triggers.total)
    })
  })

  describe('eventSources', () => {
    it('has non-negative counts', () => {
      const { eventSources } = CLOUDEVENTS_DEMO_DATA
      expect(eventSources.total).toBeGreaterThanOrEqual(0)
      expect(eventSources.ready).toBeGreaterThanOrEqual(0)
      expect(eventSources.failed).toBeGreaterThanOrEqual(0)
    })

    it('ready + failed does not exceed total', () => {
      const { eventSources } = CLOUDEVENTS_DEMO_DATA
      expect(eventSources.ready + eventSources.failed).toBeLessThanOrEqual(eventSources.total)
    })
  })

  describe('deliveries', () => {
    it('all delivery counts are non-negative', () => {
      const { deliveries } = CLOUDEVENTS_DEMO_DATA
      expect(deliveries.successful).toBeGreaterThanOrEqual(0)
      expect(deliveries.failed).toBeGreaterThanOrEqual(0)
      expect(deliveries.unknown).toBeGreaterThanOrEqual(0)
    })
  })

  describe('resources', () => {
    it('is an array', () => {
      expect(Array.isArray(CLOUDEVENTS_DEMO_DATA.resources)).toBe(true)
    })

    it('each resource has required fields', () => {
      for (const res of CLOUDEVENTS_DEMO_DATA.resources) {
        expect(typeof res.name).toBe('string')
        expect(typeof res.namespace).toBe('string')
        expect(typeof res.cluster).toBe('string')
        expect(typeof res.kind).toBe('string')
        expect(['ready', 'degraded', 'error']).toContain(res.state)
        expect(typeof res.sink).toBe('string')
        expect(typeof res.lastSeen).toBe('string')
      }
    })
  })
})
