/**
 * Tests for lib/demo/chaos_mesh.ts
 */
import { describe, it, expect } from 'vitest'
import { CHAOS_MESH_DEMO_DATA } from '../chaos_mesh'

describe('CHAOS_MESH_DEMO_DATA', () => {
  it('exports a defined object', () => {
    expect(CHAOS_MESH_DEMO_DATA).toBeDefined()
  })

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed', 'unknown']).toContain(CHAOS_MESH_DEMO_DATA.health)
  })

  it('has experiments array', () => {
    expect(Array.isArray(CHAOS_MESH_DEMO_DATA.experiments)).toBe(true)
    expect(CHAOS_MESH_DEMO_DATA.experiments.length).toBeGreaterThan(0)
  })

  it('each experiment has required fields', () => {
    for (const exp of CHAOS_MESH_DEMO_DATA.experiments) {
      expect(typeof exp.name).toBe('string')
      expect(typeof exp.namespace).toBe('string')
      expect(typeof exp.kind).toBe('string')
      expect(['Running', 'Finished', 'Failed', 'Paused', 'Unknown']).toContain(exp.phase)
    }
  })

  it('has consistent summary counts', () => {
    const s = CHAOS_MESH_DEMO_DATA.summary
    expect(typeof s.totalExperiments).toBe('number')
    expect(typeof s.running).toBe('number')
    expect(typeof s.finished).toBe('number')
    expect(typeof s.failed).toBe('number')
    expect(s.totalExperiments).toBe(s.running + s.finished + s.failed)
  })
})
