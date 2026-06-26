import { describe, it, expect } from 'vitest'
import {
  VOLCANO_DEMO_DATA,
  type VolcanoHealth,
  type VolcanoJobPhase,
  type QueueState,
} from '../volcano_status/demoData'

describe('VOLCANO_DEMO_DATA', () => {
  it('is defined', () => {
    expect(VOLCANO_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: VolcanoHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(VOLCANO_DEMO_DATA.health)
  })

  it('has jobs array with entries', () => {
    expect(Array.isArray(VOLCANO_DEMO_DATA.jobs)).toBe(true)
    expect(VOLCANO_DEMO_DATA.jobs.length).toBeGreaterThan(0)
  })

  it('each job has required fields', () => {
    for (const job of VOLCANO_DEMO_DATA.jobs) {
      expect(typeof job.name).toBe('string')
      expect(typeof job.namespace).toBe('string')
      expect(typeof job.cluster).toBe('string')
      expect(typeof job.minAvailable).toBe('number')
    }
  })

  it('each job has a valid phase', () => {
    const validPhases: VolcanoJobPhase[] = ['Pending', 'Running', 'Completing', 'Completed', 'Terminating', 'Terminated', 'Aborting', 'Aborted', 'Failed', 'Unknown']
    for (const job of VOLCANO_DEMO_DATA.jobs) {
      expect(validPhases).toContain(job.phase)
    }
  })

  it('has queues array', () => {
    expect(Array.isArray(VOLCANO_DEMO_DATA.queues)).toBe(true)
  })

  it('each queue has required fields', () => {
    for (const queue of VOLCANO_DEMO_DATA.queues) {
      expect(typeof queue.name).toBe('string')
      const validStates: QueueState[] = ['Open', 'Closed', 'Closing']
      expect(validStates).toContain(queue.state)
    }
  })

  it('has stats with required numeric fields', () => {
    expect(typeof VOLCANO_DEMO_DATA.stats.totalJobs).toBe('number')
    expect(typeof VOLCANO_DEMO_DATA.stats.runningJobs).toBe('number')
    expect(typeof VOLCANO_DEMO_DATA.stats.completedJobs).toBe('number')
    expect(typeof VOLCANO_DEMO_DATA.stats.failedJobs).toBe('number')
    expect(typeof VOLCANO_DEMO_DATA.stats.totalQueues).toBe('number')
  })

  it('has summary with schedulerVersion', () => {
    expect(typeof VOLCANO_DEMO_DATA.stats.schedulerVersion).toBe('string')
    expect(typeof VOLCANO_DEMO_DATA.stats.totalJobs).toBe('number')
  })

  it('stats counts are non-negative', () => {
    expect(VOLCANO_DEMO_DATA.stats.totalJobs).toBeGreaterThanOrEqual(0)
    expect(VOLCANO_DEMO_DATA.stats.runningJobs).toBeGreaterThanOrEqual(0)
  })
})
