import { describe, it, expect } from 'vitest'
import { DAPR_DEMO_DATA } from '../dapr'

describe('DAPR_DEMO_DATA re-export', () => {
  it('exports a valid object with health status', () => {
    expect(DAPR_DEMO_DATA).toBeDefined()
    expect(['healthy', 'degraded', 'not-installed']).toContain(DAPR_DEMO_DATA.health)
  })

  it('has control plane pods', () => {
    expect(DAPR_DEMO_DATA.controlPlane.length).toBeGreaterThan(0)
  })

  it('has summary with required fields', () => {
    expect(typeof DAPR_DEMO_DATA.summary.totalControlPlanePods).toBe('number')
    expect(typeof DAPR_DEMO_DATA.summary.runningControlPlanePods).toBe('number')
    expect(typeof DAPR_DEMO_DATA.summary.totalComponents).toBe('number')
    expect(typeof DAPR_DEMO_DATA.summary.totalDaprApps).toBe('number')
  })
})
