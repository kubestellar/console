import { describe, it, expect } from 'vitest'
import { VOLCANO_DEMO_DATA } from '../volcano'

describe('VOLCANO_DEMO_DATA re-export', () => {
  it('exports a valid object with health status', () => {
    expect(VOLCANO_DEMO_DATA).toBeDefined()
    expect(['healthy', 'degraded', 'not-installed']).toContain(VOLCANO_DEMO_DATA.health)
  })

  it('has queues array', () => {
    expect(VOLCANO_DEMO_DATA.queues.length).toBeGreaterThan(0)
  })

  it('has jobs array', () => {
    expect(VOLCANO_DEMO_DATA.jobs.length).toBeGreaterThan(0)
  })

  it('has summary', () => {
    expect(typeof VOLCANO_DEMO_DATA.summary.totalQueues).toBe('number')
    expect(typeof VOLCANO_DEMO_DATA.summary.totalJobs).toBe('number')
  })
})
