import { describe, it, expect } from 'vitest'
import type { GPUNode } from '../../../../hooks/mcp/types.gpu'
import {
  extractManufacturer,
  getUtilizationColor,
  buildGpuTypeInfo,
  buildClusterInfo,
  GPU_UTIL_HIGH,
  GPU_UTIL_WARN,
} from '../GPUDetailModal.utils'

function node(overrides: Partial<GPUNode> = {}): GPUNode {
  return {
    name: overrides.name ?? 'node-a',
    cluster: overrides.cluster ?? 'c1',
    gpuType: overrides.gpuType ?? 'NVIDIA A100',
    gpuCount: overrides.gpuCount ?? 4,
    gpuAllocated: overrides.gpuAllocated ?? 2,
    ...overrides,
  } as GPUNode
}

// ─── constants ───────────────────────────────────────────────────────────────

describe('GPUDetailModal.utils constants', () => {
  it('exposes utilization thresholds', () => {
    expect(GPU_UTIL_HIGH).toBe(90)
    expect(GPU_UTIL_WARN).toBe(70)
  })
})

// ─── extractManufacturer ─────────────────────────────────────────────────────

describe('extractManufacturer', () => {
  it.each([
    ['NVIDIA A100', 'NVIDIA'],
    ['nvidia h100', 'NVIDIA'],
    ['AMD MI300', 'AMD'],
    ['AMD Radeon Pro', 'AMD'],
    ['Radeon Instinct', 'AMD'],
    ['Intel Gaudi2', 'Intel'],
    ['intel xpu', 'Intel'],
  ])('detects %s → %s', (input, expected) => {
    expect(extractManufacturer(input)).toBe(expected)
  })

  it('returns Unknown for unrecognized vendors', () => {
    expect(extractManufacturer('IBM AIU')).toBe('Unknown')
    expect(extractManufacturer('Google TPU v5')).toBe('Unknown')
    expect(extractManufacturer('')).toBe('Unknown')
  })
})

// ─── getUtilizationColor ─────────────────────────────────────────────────────

describe('getUtilizationColor', () => {
  it('returns red at or above GPU_UTIL_HIGH', () => {
    expect(getUtilizationColor(90)).toBe('text-red-400')
    expect(getUtilizationColor(100)).toBe('text-red-400')
    expect(getUtilizationColor(150)).toBe('text-red-400')
  })

  it('returns yellow at or above GPU_UTIL_WARN but below GPU_UTIL_HIGH', () => {
    expect(getUtilizationColor(70)).toBe('text-yellow-400')
    expect(getUtilizationColor(89)).toBe('text-yellow-400')
    expect(getUtilizationColor(89.999)).toBe('text-yellow-400')
  })

  it('returns green below GPU_UTIL_WARN', () => {
    expect(getUtilizationColor(0)).toBe('text-green-400')
    expect(getUtilizationColor(69)).toBe('text-green-400')
    expect(getUtilizationColor(-5)).toBe('text-green-400')
  })
})

// ─── buildGpuTypeInfo ────────────────────────────────────────────────────────

describe('buildGpuTypeInfo', () => {
  it('returns empty for empty input', () => {
    expect(buildGpuTypeInfo([])).toEqual([])
  })

  it('aggregates counts, allocation, availability, and node count per gpuType', () => {
    const result = buildGpuTypeInfo([
      node({ name: 'a', cluster: 'c1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2 }),
      node({ name: 'b', cluster: 'c1', gpuType: 'NVIDIA A100', gpuCount: 2, gpuAllocated: 2 }),
      node({ name: 'c', cluster: 'c2', gpuType: 'AMD MI300', gpuCount: 8, gpuAllocated: 1 }),
    ])
    const a100 = result.find((r) => r.type === 'NVIDIA A100')!
    const amd = result.find((r) => r.type === 'AMD MI300')!
    expect(a100).toMatchObject({
      type: 'NVIDIA A100',
      manufacturer: 'NVIDIA',
      totalGPUs: 6,
      allocatedGPUs: 4,
      availableGPUs: 2,
      nodeCount: 2,
    })
    expect(amd).toMatchObject({
      type: 'AMD MI300',
      manufacturer: 'AMD',
      totalGPUs: 8,
      allocatedGPUs: 1,
      availableGPUs: 7,
      nodeCount: 1,
    })
  })

  it('deduplicates cluster names in the clusters array', () => {
    const result = buildGpuTypeInfo([
      node({ name: 'a', cluster: 'prod', gpuType: 'NVIDIA A100' }),
      node({ name: 'b', cluster: 'prod', gpuType: 'NVIDIA A100' }),
      node({ name: 'c', cluster: 'staging', gpuType: 'NVIDIA A100' }),
    ])
    expect(result[0].clusters).toEqual(['prod', 'staging'])
  })

  it('sorts results by descending totalGPUs', () => {
    const result = buildGpuTypeInfo([
      node({ name: 'a', gpuType: 'Small', gpuCount: 1 }),
      node({ name: 'b', gpuType: 'Big', gpuCount: 10 }),
      node({ name: 'c', gpuType: 'Medium', gpuCount: 5 }),
    ])
    expect(result.map((r) => r.type)).toEqual(['Big', 'Medium', 'Small'])
  })
})

// ─── buildClusterInfo ────────────────────────────────────────────────────────

describe('buildClusterInfo', () => {
  it('returns empty for empty input', () => {
    expect(buildClusterInfo([])).toEqual([])
  })

  it('aggregates counts per cluster and lists unique GPU types', () => {
    const result = buildClusterInfo([
      node({ name: 'a', cluster: 'prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 3 }),
      node({ name: 'b', cluster: 'prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 1 }),
      node({ name: 'c', cluster: 'prod', gpuType: 'AMD MI300', gpuCount: 2, gpuAllocated: 0 }),
      node({ name: 'd', cluster: 'staging', gpuType: 'Intel Gaudi2', gpuCount: 1, gpuAllocated: 1 }),
    ])
    const prod = result.find((r) => r.cluster === 'prod')!
    const staging = result.find((r) => r.cluster === 'staging')!
    expect(prod).toMatchObject({
      cluster: 'prod',
      totalGPUs: 10,
      allocatedGPUs: 4,
      availableGPUs: 6,
      nodeCount: 3,
    })
    expect(new Set(prod.gpuTypes)).toEqual(new Set(['NVIDIA A100', 'AMD MI300']))
    expect(staging).toMatchObject({
      cluster: 'staging',
      totalGPUs: 1,
      allocatedGPUs: 1,
      availableGPUs: 0,
      nodeCount: 1,
      gpuTypes: ['Intel Gaudi2'],
    })
  })

  it('sorts clusters by descending totalGPUs', () => {
    const result = buildClusterInfo([
      node({ cluster: 'small', gpuCount: 1 }),
      node({ cluster: 'huge', gpuCount: 20 }),
      node({ cluster: 'mid', gpuCount: 5 }),
    ])
    expect(result.map((r) => r.cluster)).toEqual(['huge', 'mid', 'small'])
  })
})
