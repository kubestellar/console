import { describe, it, expect } from 'vitest'
import {
  FLUID_DEMO_DATA,
  type FluidDatasetStatus,
  type FluidRuntimeStatus,
} from '../fluid_status/demoData'

describe('FLUID_DEMO_DATA', () => {
  it('is defined', () => {
    expect(FLUID_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth = ['healthy', 'degraded', 'not-installed']
    expect(validHealth).toContain(FLUID_DEMO_DATA.health)
  })

  it('has controllerPods with ready/total counts', () => {
    expect(typeof FLUID_DEMO_DATA.controllerPods.ready).toBe('number')
    expect(typeof FLUID_DEMO_DATA.controllerPods.total).toBe('number')
    expect(FLUID_DEMO_DATA.controllerPods.ready).toBeLessThanOrEqual(FLUID_DEMO_DATA.controllerPods.total)
  })

  it('has datasets array with entries', () => {
    expect(Array.isArray(FLUID_DEMO_DATA.datasets)).toBe(true)
    expect(FLUID_DEMO_DATA.datasets.length).toBeGreaterThan(0)
  })

  it('each dataset has required fields', () => {
    const validStatus: FluidDatasetStatus[] = ['bound', 'not-bound', 'unknown']
    for (const ds of FLUID_DEMO_DATA.datasets) {
      expect(typeof ds.name).toBe('string')
      expect(typeof ds.namespace).toBe('string')
      expect(validStatus).toContain(ds.status)
      expect(typeof ds.source).toBe('string')
      expect(typeof ds.cachedPercentage).toBe('number')
      expect(ds.cachedPercentage).toBeGreaterThanOrEqual(0)
      expect(ds.cachedPercentage).toBeLessThanOrEqual(100)
    }
  })

  it('has runtimes array', () => {
    expect(Array.isArray(FLUID_DEMO_DATA.runtimes)).toBe(true)
  })

  it('each runtime has required fields', () => {
    const validRuntimeStatus: FluidRuntimeStatus[] = ['ready', 'not-ready', 'unknown']
    for (const rt of FLUID_DEMO_DATA.runtimes) {
      expect(typeof rt.type).toBe('string')
      expect(validRuntimeStatus).toContain(rt.status)
    }
  })

  it('has dataLoads array', () => {
    expect(Array.isArray(FLUID_DEMO_DATA.dataLoads)).toBe(true)
  })
})
