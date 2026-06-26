import { describe, it, expect } from 'vitest'
import { CONTAINERD_DEMO_DATA, CONTAINERD_DEMO_CONTAINERS } from '../containerd'

describe('containerd demo data', () => {
  it('has demo containers array', () => {
    expect(CONTAINERD_DEMO_CONTAINERS.length).toBeGreaterThan(0)
    for (const c of CONTAINERD_DEMO_CONTAINERS) {
      expect(c.id).toBeTruthy()
      expect(c.image).toBeTruthy()
      expect(c.state).toBeTruthy()
    }
  })

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(CONTAINERD_DEMO_DATA.health)
  })

  it('has consistent summary', () => {
    const { summary } = CONTAINERD_DEMO_DATA
    expect(typeof summary.totalContainers).toBe('number')
    expect(typeof summary.running).toBe('number')
    expect(summary.running).toBeLessThanOrEqual(summary.totalContainers)
  })

  it('has a lastCheckTime', () => {
    expect(CONTAINERD_DEMO_DATA.lastCheckTime).toBeTruthy()
  })
})
