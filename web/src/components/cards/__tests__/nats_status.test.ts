import { describe, it, expect } from 'vitest'
import { NATS_DEMO_DATA, type NatsServerState } from '../nats_status/demoData'

describe('NATS_DEMO_DATA', () => {
  it('is defined', () => {
    expect(NATS_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth = ['healthy', 'degraded', 'not-installed']
    expect(validHealth).toContain(NATS_DEMO_DATA.health)
  })

  it('has servers object with counts', () => {
    expect(typeof NATS_DEMO_DATA.servers.total).toBe('number')
    expect(typeof NATS_DEMO_DATA.servers.ok).toBe('number')
    expect(typeof NATS_DEMO_DATA.servers.warning).toBe('number')
    expect(typeof NATS_DEMO_DATA.servers.error).toBe('number')
  })

  it('has messaging object with required fields', () => {
    expect(typeof NATS_DEMO_DATA.messaging.totalConnections).toBe('number')
    expect(typeof NATS_DEMO_DATA.messaging.inMsgsPerSec).toBe('number')
    expect(typeof NATS_DEMO_DATA.messaging.outMsgsPerSec).toBe('number')
    expect(typeof NATS_DEMO_DATA.messaging.totalSubscriptions).toBe('number')
  })

  it('has jetstream with enabled flag and counts', () => {
    expect(typeof NATS_DEMO_DATA.jetstream.enabled).toBe('boolean')
    expect(typeof NATS_DEMO_DATA.jetstream.streams).toBe('number')
    expect(typeof NATS_DEMO_DATA.jetstream.totalMessages).toBe('number')
    expect(typeof NATS_DEMO_DATA.jetstream.totalConsumers).toBe('number')
  })

  it('has serverList array', () => {
    expect(Array.isArray(NATS_DEMO_DATA.serverList)).toBe(true)
  })

  it('each server has required fields', () => {
    const validStates: NatsServerState[] = ['ok', 'warning', 'error']
    for (const srv of NATS_DEMO_DATA.serverList) {
      expect(typeof srv.name).toBe('string')
      expect(typeof srv.cluster).toBe('string')
      expect(validStates).toContain(srv.state)
    }
  })

  it('has streamList array', () => {
    expect(Array.isArray(NATS_DEMO_DATA.streamList)).toBe(true)
  })

  it('each stream has required fields', () => {
    for (const stream of NATS_DEMO_DATA.streamList) {
      expect(typeof stream.name).toBe('string')
      expect(typeof stream.consumers).toBe('number')
      expect(typeof stream.messages).toBe('number')
    }
  })
})
