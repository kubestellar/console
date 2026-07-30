import { describe, it, expect } from 'vitest'
import { LIMA_DEMO_DATA, type LimaDemoData } from '../lima_status/demoData'

describe('LIMA_DEMO_DATA', () => {
  it('is defined', () => {
    expect(LIMA_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid: LimaDemoData['health'][] = ['healthy', 'degraded', 'not-detected']
    expect(valid).toContain(LIMA_DEMO_DATA.health)
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(LIMA_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('instances', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(LIMA_DEMO_DATA.instances)).toBe(true)
      expect(LIMA_DEMO_DATA.instances.length).toBeGreaterThan(0)
    })

    it('each instance has required fields', () => {
      for (const inst of LIMA_DEMO_DATA.instances) {
        expect(typeof inst.name).toBe('string')
        expect(inst.name.length).toBeGreaterThan(0)
        expect(['running', 'stopped', 'broken']).toContain(inst.status)
        expect(inst.cpuCores).toBeGreaterThan(0)
        expect(inst.memoryGB).toBeGreaterThan(0)
        expect(inst.diskGB).toBeGreaterThan(0)
        expect(typeof inst.arch).toBe('string')
        expect(typeof inst.os).toBe('string')
        expect(typeof inst.limaVersion).toBe('string')
        expect(typeof inst.lastSeen).toBe('string')
      }
    })

    it('covers multiple status variants', () => {
      const statuses = new Set(LIMA_DEMO_DATA.instances.map(i => i.status))
      expect(statuses.size).toBeGreaterThan(1)
    })
  })

  describe('node totals', () => {
    it('totalNodes matches instance count', () => {
      expect(LIMA_DEMO_DATA.totalNodes).toBe(LIMA_DEMO_DATA.instances.length)
    })

    it('runningNodes + stoppedNodes + brokenNodes equals totalNodes', () => {
      const { runningNodes, stoppedNodes, brokenNodes, totalNodes } = LIMA_DEMO_DATA
      expect(runningNodes + stoppedNodes + brokenNodes).toBe(totalNodes)
    })

    it('running count matches instances with running status', () => {
      const count = LIMA_DEMO_DATA.instances.filter(i => i.status === 'running').length
      expect(LIMA_DEMO_DATA.runningNodes).toBe(count)
    })

    it('stopped count matches instances with stopped status', () => {
      const count = LIMA_DEMO_DATA.instances.filter(i => i.status === 'stopped').length
      expect(LIMA_DEMO_DATA.stoppedNodes).toBe(count)
    })
  })

  describe('resource totals', () => {
    it('totalCpuCores equals sum of instance cpuCores', () => {
      const sum = LIMA_DEMO_DATA.instances.reduce((a, i) => a + i.cpuCores, 0)
      expect(LIMA_DEMO_DATA.totalCpuCores).toBe(sum)
    })

    it('totalMemoryGB equals sum of instance memoryGB', () => {
      const sum = LIMA_DEMO_DATA.instances.reduce((a, i) => a + i.memoryGB, 0)
      expect(LIMA_DEMO_DATA.totalMemoryGB).toBe(sum)
    })
  })
})
