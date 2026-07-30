import { describe, it, expect } from 'vitest'
import {
  WASMCLOUD_DEMO_DATA,
  type WasmcloudHealth,
  type WasmcloudHostStatus,
  type WasmcloudProviderStatus,
  type WasmcloudLinkStatus,
} from '../wasmcloud_status/demoData'

describe('WASMCLOUD_DEMO_DATA', () => {
  it('is defined', () => {
    expect(WASMCLOUD_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: WasmcloudHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(WASMCLOUD_DEMO_DATA.health)
  })

  it('has hosts array with entries', () => {
    expect(Array.isArray(WASMCLOUD_DEMO_DATA.hosts)).toBe(true)
    expect(WASMCLOUD_DEMO_DATA.hosts.length).toBeGreaterThan(0)
  })

  it('each host has required fields', () => {
    for (const host of WASMCLOUD_DEMO_DATA.hosts) {
      expect(typeof host.hostId).toBe('string')
      expect(typeof host.cluster).toBe('string')
      const validStatuses: WasmcloudHostStatus[] = ['ready', 'starting', 'unreachable']
      expect(validStatuses).toContain(host.status)
    }
  })

  it('has actors array', () => {
    expect(Array.isArray(WASMCLOUD_DEMO_DATA.actors)).toBe(true)
  })

  it('each actor has required fields', () => {
    for (const actor of WASMCLOUD_DEMO_DATA.actors) {
      expect(typeof actor.actorId).toBe('string')
      expect(typeof actor.name).toBe('string')
      expect(typeof actor.instanceCount).toBe('number')
    }
  })

  it('has providers array', () => {
    expect(Array.isArray(WASMCLOUD_DEMO_DATA.providers)).toBe(true)
  })

  it('each provider has valid status', () => {
    const validStatuses: WasmcloudProviderStatus[] = ['running', 'starting', 'failed']
    for (const provider of WASMCLOUD_DEMO_DATA.providers) {
      expect(validStatuses).toContain(provider.status)
    }
  })

  it('has links array', () => {
    expect(Array.isArray(WASMCLOUD_DEMO_DATA.links)).toBe(true)
  })

  it('each link has valid status', () => {
    const validStatuses: WasmcloudLinkStatus[] = ['active', 'pending', 'failed']
    for (const link of WASMCLOUD_DEMO_DATA.links) {
      expect(validStatuses).toContain(link.status)
    }
  })

  it('has stats with required numeric fields', () => {
    expect(typeof WASMCLOUD_DEMO_DATA.stats.hostCount).toBe('number')
    expect(typeof WASMCLOUD_DEMO_DATA.stats.actorCount).toBe('number')
    expect(typeof WASMCLOUD_DEMO_DATA.stats.providerCount).toBe('number')
    expect(typeof WASMCLOUD_DEMO_DATA.stats.linkCount).toBe('number')
  })

  it('has stats with latticeVersion', () => {
    expect(typeof WASMCLOUD_DEMO_DATA.stats.latticeVersion).toBe('string')
  })
})
