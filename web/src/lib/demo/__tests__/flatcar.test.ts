import { describe, it, expect } from 'vitest'
import { FLATCAR_DEMO_DATA } from '../flatcar'

describe('flatcar demo data', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(FLATCAR_DEMO_DATA.health)
  })

  it('has nodes with required fields', () => {
    expect(FLATCAR_DEMO_DATA.nodes.length).toBeGreaterThan(0)
    for (const n of FLATCAR_DEMO_DATA.nodes) {
      expect(n.name).toBeTruthy()
      expect(n.currentVersion).toBeTruthy()
      expect(n.channel).toBeTruthy()
    }
  })

  it('has consistent stats', () => {
    const { stats, nodes } = FLATCAR_DEMO_DATA
    expect(stats.totalNodes).toBe(nodes.length)
    expect(stats.upToDateNodes + stats.updateAvailableNodes + stats.rebootRequiredNodes)
      .toBeLessThanOrEqual(stats.totalNodes)
  })

  it('has summary with latest version', () => {
    expect(FLATCAR_DEMO_DATA.summary.latestStableVersion).toBeTruthy()
  })

  it('has a lastCheckTime', () => {
    expect(FLATCAR_DEMO_DATA.lastCheckTime).toBeTruthy()
  })
})
