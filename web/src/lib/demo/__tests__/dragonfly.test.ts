import { describe, it, expect } from 'vitest'
import { DRAGONFLY_DEMO_DATA } from '../dragonfly'

describe('dragonfly demo data', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(DRAGONFLY_DEMO_DATA.health)
  })

  it('has a cluster name', () => {
    expect(DRAGONFLY_DEMO_DATA.clusterName).toBeTruthy()
  })

  it('has consistent summary', () => {
    const { summary } = DRAGONFLY_DEMO_DATA
    expect(typeof summary.managerReplicas).toBe('number')
    expect(typeof summary.schedulerReplicas).toBe('number')
    expect(typeof summary.seedPeers).toBe('number')
    expect(summary.dfdaemonNodesUp).toBeLessThanOrEqual(summary.dfdaemonNodesTotal)
  })

  it('has a lastCheckTime', () => {
    expect(DRAGONFLY_DEMO_DATA.lastCheckTime).toBeTruthy()
  })
})
