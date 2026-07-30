import { describe, it, expect } from 'vitest'
import {
  CRIO_DEMO_DATA,
  type CrioStatusDemoData,
} from '../crio_status/demoData'

describe('CRIO_DEMO_DATA', () => {
  it('is defined', () => {
    expect(CRIO_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid: CrioStatusDemoData['health'][] = ['healthy', 'degraded', 'not-installed']
    expect(valid).toContain(CRIO_DEMO_DATA.health)
  })

  it('detected is boolean', () => {
    expect(typeof CRIO_DEMO_DATA.detected).toBe('boolean')
  })

  it('totalNodes is positive', () => {
    expect(CRIO_DEMO_DATA.totalNodes).toBeGreaterThan(0)
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(CRIO_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('versions', () => {
    it('is an object', () => {
      expect(typeof CRIO_DEMO_DATA.versions).toBe('object')
    })

    it('version values are positive numbers', () => {
      for (const [ver, count] of Object.entries(CRIO_DEMO_DATA.versions)) {
        expect(typeof ver).toBe('string')
        expect(count).toBeGreaterThan(0)
      }
    })

    it('sum of version counts matches totalNodes', () => {
      const total = Object.values(CRIO_DEMO_DATA.versions).reduce((a, b) => a + b, 0)
      expect(total).toBe(CRIO_DEMO_DATA.totalNodes)
    })
  })

  describe('runtimeMetrics', () => {
    it('has non-negative container counts', () => {
      const { runtimeMetrics } = CRIO_DEMO_DATA
      expect(runtimeMetrics.runningContainers).toBeGreaterThanOrEqual(0)
      expect(runtimeMetrics.pausedContainers).toBeGreaterThanOrEqual(0)
      expect(runtimeMetrics.stoppedContainers).toBeGreaterThanOrEqual(0)
    })
  })

  describe('imagePulls', () => {
    it('successful + failed does not exceed total', () => {
      const { imagePulls } = CRIO_DEMO_DATA
      expect(imagePulls.successful + imagePulls.failed).toBeLessThanOrEqual(imagePulls.total)
    })

    it('all counts are non-negative', () => {
      expect(CRIO_DEMO_DATA.imagePulls.total).toBeGreaterThanOrEqual(0)
      expect(CRIO_DEMO_DATA.imagePulls.successful).toBeGreaterThanOrEqual(0)
      expect(CRIO_DEMO_DATA.imagePulls.failed).toBeGreaterThanOrEqual(0)
    })
  })

  describe('podSandboxes', () => {
    it('ready + notReady equals total', () => {
      const { podSandboxes } = CRIO_DEMO_DATA
      expect(podSandboxes.ready + podSandboxes.notReady).toBe(podSandboxes.total)
    })

    it('all counts are non-negative', () => {
      expect(CRIO_DEMO_DATA.podSandboxes.ready).toBeGreaterThanOrEqual(0)
      expect(CRIO_DEMO_DATA.podSandboxes.notReady).toBeGreaterThanOrEqual(0)
    })
  })

  describe('recentImagePulls', () => {
    it('is an array', () => {
      expect(Array.isArray(CRIO_DEMO_DATA.recentImagePulls)).toBe(true)
    })

    it('each pull has image and status', () => {
      for (const pull of CRIO_DEMO_DATA.recentImagePulls) {
        expect(typeof pull.image).toBe('string')
        expect(pull.image.length).toBeGreaterThan(0)
        expect(['success', 'failed']).toContain(pull.status)
        expect(typeof pull.time).toBe('string')
      }
    })

    it('covers success and failed statuses', () => {
      const statuses = new Set(CRIO_DEMO_DATA.recentImagePulls.map(p => p.status))
      expect(statuses.has('success')).toBe(true)
      expect(statuses.has('failed')).toBe(true)
    })
  })
})
