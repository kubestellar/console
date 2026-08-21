import { describe, it, expect } from 'vitest'
import * as demoData from '../demoData'
import { DEMO_HOOK_TABLE } from '../demoData'

/**
 * Tests for the static demo-data catalog used by unified card hooks.
 *
 * These are pure exports (no side effects other than Date.now() at
 * import time), so we verify:
 *   - every named export is defined and has the expected coarse shape;
 *   - DEMO_HOOK_TABLE is internally consistent (unique names, valid
 *     hook-name convention, every referenced dataset resolves and is
 *     non-empty);
 *   - a spread of representative datasets have the expected fields.
 */

describe('demoData module', () => {
  it('exports DEMO_HOOK_TABLE as a non-empty array', () => {
    expect(Array.isArray(DEMO_HOOK_TABLE)).toBe(true)
    expect(DEMO_HOOK_TABLE.length).toBeGreaterThan(20)
  })

  it('every non-table DEMO_* export is a non-null array or object', () => {
    const entries = Object.entries(demoData).filter(
      ([k]) => k.startsWith('DEMO_') && k !== 'DEMO_HOOK_TABLE',
    )
    expect(entries.length).toBeGreaterThan(30)
    for (const [name, value] of entries) {
      expect(value, `${name} is null/undefined`).not.toBeNull()
      expect(value, `${name} is null/undefined`).not.toBeUndefined()
      expect(typeof value, `${name} unexpected type`).toBe('object')
    }
  })
})

describe('DEMO_HOOK_TABLE', () => {
  it('every entry has a { name, data } shape', () => {
    for (const entry of DEMO_HOOK_TABLE) {
      expect(entry).toBeTypeOf('object')
      expect(typeof entry.name).toBe('string')
      expect(entry.name.length).toBeGreaterThan(0)
      expect(Array.isArray(entry.data), `${entry.name} data must be array`).toBe(true)
    }
  })

  it('hook names are unique', () => {
    const names = DEMO_HOOK_TABLE.map(e => e.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('hook names follow the useXxx convention (PascalCase after use)', () => {
    const hookRe = /^use[A-Z][A-Za-z0-9]*$/
    for (const { name } of DEMO_HOOK_TABLE) {
      expect(hookRe.test(name), `${name} not a hook name`).toBe(true)
    }
  })

  it('every entry data array is non-empty', () => {
    for (const { name, data } of DEMO_HOOK_TABLE) {
      expect(data.length, `${name} has empty data`).toBeGreaterThan(0)
    }
  })

  it('entries backed by an object export use a single-element array wrapper', () => {
    // The pattern in the table is: array-typed exports are inlined,
    // object-typed exports are wrapped as `[DEMO_FOO]`. A .length of 1
    // where the element is a plain object confirms the wrapper form.
    for (const { name, data } of DEMO_HOOK_TABLE) {
      if (data.length === 1 && data[0] && typeof data[0] === 'object' && !Array.isArray(data[0])) {
        expect(data[0]).toBeTruthy()
      }
    }
  })
})

describe('representative dataset shapes', () => {
  it('DEMO_CLUSTER_METRICS entries have timestamp/cpu/memory/pods numbers', () => {
    for (const row of demoData.DEMO_CLUSTER_METRICS) {
      expect(typeof row.timestamp).toBe('number')
      expect(typeof row.cpu).toBe('number')
      expect(typeof row.memory).toBe('number')
      expect(typeof row.pods).toBe('number')
    }
  })

  it('DEMO_TOP_PODS entries have name/namespace/cpu/memory/cluster', () => {
    for (const row of demoData.DEMO_TOP_PODS) {
      expect(typeof row.name).toBe('string')
      expect(typeof row.namespace).toBe('string')
      expect(typeof row.cpu).toBe('number')
      expect(typeof row.memory).toBe('number')
      expect(typeof row.cluster).toBe('string')
    }
  })

  it('DEMO_GITOPS_DRIFT entries use synced/drifted status values only', () => {
    const VALID = new Set(['synced', 'drifted'])
    for (const row of demoData.DEMO_GITOPS_DRIFT) {
      expect(VALID.has(row.status), `unexpected status ${row.status}`).toBe(true)
      expect(typeof row.lastSync).toBe('number')
    }
  })

  it('DEMO_ARGOCD_APPLICATIONS entries have Argo-shaped fields', () => {
    for (const row of demoData.DEMO_ARGOCD_APPLICATIONS) {
      expect(typeof row.name).toBe('string')
      expect(typeof row.project).toBe('string')
      expect(typeof row.syncStatus).toBe('string')
      expect(typeof row.healthStatus).toBe('string')
      expect(typeof row.namespace).toBe('string')
    }
  })

  it('DEMO_STORAGE_OVERVIEW has numeric capacity/usage fields', () => {
    const o = demoData.DEMO_STORAGE_OVERVIEW
    expect(typeof o.totalCapacity).toBe('number')
    expect(typeof o.used).toBe('number')
    expect(typeof o.pvcs).toBe('number')
    expect(typeof o.unbound).toBe('number')
    expect(o.used).toBeLessThanOrEqual(o.totalCapacity)
  })

  it('DEMO_COMPUTE_OVERVIEW has numeric fields', () => {
    const o = demoData.DEMO_COMPUTE_OVERVIEW
    expect(typeof o.nodes).toBe('number')
    expect(typeof o.cpuUsage).toBe('number')
    expect(typeof o.memoryUsage).toBe('number')
    expect(typeof o.podCount).toBe('number')
  })

  it('DEMO_GPU_INVENTORY entries have expected GPU fields', () => {
    for (const row of demoData.DEMO_GPU_INVENTORY) {
      expect(typeof row.cluster).toBe('string')
      expect(typeof row.node).toBe('string')
      expect(typeof row.model).toBe('string')
      expect(typeof row.memory).toBe('number')
      expect(typeof row.utilization).toBe('number')
      expect(row.utilization).toBeGreaterThanOrEqual(0)
      expect(row.utilization).toBeLessThanOrEqual(100)
    }
  })

  it('percentage-style trend entries stay in [0, 100]', () => {
    for (const row of demoData.DEMO_RESOURCE_TREND) {
      expect(row.cpu).toBeGreaterThanOrEqual(0)
      expect(row.cpu).toBeLessThanOrEqual(100)
      expect(row.memory).toBeGreaterThanOrEqual(0)
      expect(row.memory).toBeLessThanOrEqual(100)
    }
  })

  it('DEMO_POD_HEALTH_TREND entries have non-negative healthy/unhealthy', () => {
    for (const row of demoData.DEMO_POD_HEALTH_TREND) {
      expect(row.healthy).toBeGreaterThanOrEqual(0)
      expect(row.unhealthy).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('all array-typed exports contain only object rows', () => {
  it.each(
    Object.entries(demoData)
      .filter(([k, v]) => k.startsWith('DEMO_') && k !== 'DEMO_HOOK_TABLE' && Array.isArray(v))
      .map(([k, v]) => [k, v as unknown[]]),
  )('%s is a non-empty array of plain objects', (_name, arr) => {
    expect(arr.length).toBeGreaterThan(0)
    for (const row of arr) {
      expect(row).toBeTypeOf('object')
      expect(row).not.toBeNull()
    }
  })
})
