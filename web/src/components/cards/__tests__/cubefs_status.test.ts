import { describe, it, expect } from 'vitest'
import {
  CUBEFS_DEMO_DATA,
  type CubefsVolumeStatus,
  type CubefsNodeStatus,
} from '../cubefs_status/demoData'

describe('CUBEFS_DEMO_DATA', () => {
  it('is defined', () => {
    expect(CUBEFS_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth = ['healthy', 'degraded', 'not-installed']
    expect(validHealth).toContain(CUBEFS_DEMO_DATA.health)
  })

  it('has clusterName string', () => {
    expect(typeof CUBEFS_DEMO_DATA.clusterName).toBe('string')
    expect(CUBEFS_DEMO_DATA.clusterName.length).toBeGreaterThan(0)
  })

  it('has masterLeader string', () => {
    expect(typeof CUBEFS_DEMO_DATA.masterLeader).toBe('string')
  })

  it('has volumes array with entries', () => {
    expect(Array.isArray(CUBEFS_DEMO_DATA.volumes)).toBe(true)
    expect(CUBEFS_DEMO_DATA.volumes.length).toBeGreaterThan(0)
  })

  it('each volume has required fields', () => {
    const validStatus: CubefsVolumeStatus[] = ['active', 'inactive', 'read-only', 'unknown']
    for (const vol of CUBEFS_DEMO_DATA.volumes) {
      expect(typeof vol.name).toBe('string')
      expect(typeof vol.owner).toBe('string')
      expect(validStatus).toContain(vol.status)
      expect(typeof vol.capacity).toBe('string')
      expect(typeof vol.usedSize).toBe('string')
      expect(typeof vol.usagePercent).toBe('number')
      expect(vol.usagePercent).toBeGreaterThanOrEqual(0)
      expect(vol.usagePercent).toBeLessThanOrEqual(100)
    }
  })

  it('has nodes array with entries', () => {
    expect(Array.isArray(CUBEFS_DEMO_DATA.nodes)).toBe(true)
    expect(CUBEFS_DEMO_DATA.nodes.length).toBeGreaterThan(0)
  })

  it('each node has required fields', () => {
    const validStatus: CubefsNodeStatus[] = ['active', 'inactive', 'unknown']
    const validRoles = ['master', 'meta', 'data'] as const
    for (const node of CUBEFS_DEMO_DATA.nodes) {
      expect(typeof node.address).toBe('string')
      expect(validRoles).toContain(node.role)
      expect(validStatus).toContain(node.status)
      expect(typeof node.totalDisk).toBe('string')
      expect(typeof node.usedDisk).toBe('string')
      expect(typeof node.diskUsagePercent).toBe('number')
    }
  })

  it('disk usage percent is between 0 and 100', () => {
    for (const node of CUBEFS_DEMO_DATA.nodes) {
      expect(node.diskUsagePercent).toBeGreaterThanOrEqual(0)
      expect(node.diskUsagePercent).toBeLessThanOrEqual(100)
    }
  })
})
