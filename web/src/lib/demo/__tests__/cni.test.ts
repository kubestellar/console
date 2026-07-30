import { describe, it, expect } from 'vitest'
import { CNI_DEMO_DATA } from '../cni'

describe('CNI_DEMO_DATA', () => {
  const data = CNI_DEMO_DATA

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(data.health)
  })

  it('has nodes with required fields', () => {
    expect(data.nodes.length).toBeGreaterThan(0)
    for (const n of data.nodes) {
      expect(n.node).toBeTruthy()
      expect(['ready', 'not-ready', 'unknown']).toContain(n.state)
    }
  })

  it('has stats with network CIDRs', () => {
    const s = data.stats
    expect(s.podNetworkCidr).toMatch(/\d+\.\d+\.\d+\.\d+\/\d+/)
    expect(s.serviceNetworkCidr).toMatch(/\d+\.\d+\.\d+\.\d+\/\d+/)
    expect(s.pluginVersion).toBeTruthy()
    expect(typeof s.nodeCount).toBe('number')
    expect(typeof s.nodesCniReady).toBe('number')
  })

  it('has consistent summary with stats', () => {
    expect(data.summary.activePlugin).toBe(data.stats.activePlugin)
    expect(data.summary.pluginVersion).toBe(data.stats.pluginVersion)
    expect(data.summary.nodeCount).toBe(data.stats.nodeCount)
    expect(data.summary.nodesCniReady).toBe(data.stats.nodesCniReady)
  })

  it('node count matches nodes array', () => {
    expect(data.stats.nodeCount).toBe(data.nodes.length)
  })

  it('has a valid lastCheckTime', () => {
    expect(new Date(data.lastCheckTime).getTime()).toBeGreaterThan(0)
  })
})
