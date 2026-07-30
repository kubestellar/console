import { describe, it, expect } from 'vitest'
import {
  extractManufacturer,
  getUtilizationColor,
  computeGpuTypeInfo,
  computeClusterInfo,
  computeGpuTotals,
  computeManufacturerBreakdown,
  computeGpuSpecs,
  GPU_UTIL_HIGH,
  GPU_UTIL_WARN,
} from '../gpuDetailUtils'
import type { GPUNode } from '../../../../hooks/mcp/types.gpu'

function makeNode(overrides: Partial<GPUNode> = {}): GPUNode {
  return {
    name: 'node-1',
    cluster: 'cluster-a',
    gpuType: 'NVIDIA A100',
    gpuCount: 4,
    gpuAllocated: 2,
    ...overrides,
  }
}

describe('extractManufacturer', () => {
  it('detects nvidia', () => {
    expect(extractManufacturer('NVIDIA A100')).toBe('NVIDIA')
  })

  it('detects amd', () => {
    expect(extractManufacturer('AMD MI250')).toBe('AMD')
  })

  it('detects radeon as amd', () => {
    expect(extractManufacturer('Radeon Pro W7900')).toBe('AMD')
  })

  it('detects intel', () => {
    expect(extractManufacturer('Intel Gaudi2')).toBe('Intel')
  })

  it('returns Unknown for unrecognized types', () => {
    expect(extractManufacturer('IBM AIU')).toBe('Unknown')
  })

  it('is case-insensitive', () => {
    expect(extractManufacturer('nvidia a100')).toBe('NVIDIA')
    expect(extractManufacturer('AmD Instinct')).toBe('AMD')
  })
})

describe('getUtilizationColor', () => {
  it('returns green below the warn threshold', () => {
    expect(getUtilizationColor(GPU_UTIL_WARN - 1)).toBe('text-green-400')
  })

  it('returns yellow at the warn threshold', () => {
    expect(getUtilizationColor(GPU_UTIL_WARN)).toBe('text-yellow-400')
  })

  it('returns yellow between warn and high thresholds', () => {
    expect(getUtilizationColor(GPU_UTIL_HIGH - 1)).toBe('text-yellow-400')
  })

  it('returns red at the high threshold', () => {
    expect(getUtilizationColor(GPU_UTIL_HIGH)).toBe('text-red-400')
  })

  it('returns red above the high threshold', () => {
    expect(getUtilizationColor(100)).toBe('text-red-400')
  })
})

describe('computeGpuTypeInfo', () => {
  it('returns an empty array for no nodes', () => {
    expect(computeGpuTypeInfo([])).toEqual([])
  })

  it('aggregates a single type across multiple nodes', () => {
    const nodes = [
      makeNode({ name: 'n1', cluster: 'a', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2 }),
      makeNode({ name: 'n2', cluster: 'a', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4 }),
    ]
    const result = computeGpuTypeInfo(nodes)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'NVIDIA A100',
      manufacturer: 'NVIDIA',
      totalGPUs: 12,
      allocatedGPUs: 6,
      availableGPUs: 6,
      nodeCount: 2,
      clusters: ['a'],
    })
  })

  it('sorts multiple types by totalGPUs descending', () => {
    const nodes = [
      makeNode({ name: 'n1', gpuType: 'AMD MI250', gpuCount: 2, gpuAllocated: 0 }),
      makeNode({ name: 'n2', gpuType: 'NVIDIA A100', gpuCount: 10, gpuAllocated: 5 }),
    ]
    const result = computeGpuTypeInfo(nodes)
    expect(result.map(r => r.type)).toEqual(['NVIDIA A100', 'AMD MI250'])
  })

  it('deduplicates clusters for the same type', () => {
    const nodes = [
      makeNode({ name: 'n1', cluster: 'a', gpuType: 'NVIDIA A100' }),
      makeNode({ name: 'n2', cluster: 'a', gpuType: 'NVIDIA A100' }),
      makeNode({ name: 'n3', cluster: 'b', gpuType: 'NVIDIA A100' }),
    ]
    const result = computeGpuTypeInfo(nodes)
    expect(result[0].clusters).toEqual(['a', 'b'])
  })
})

describe('computeClusterInfo', () => {
  it('returns an empty array for no nodes', () => {
    expect(computeClusterInfo([])).toEqual([])
  })

  it('aggregates per cluster and dedups gpuTypes', () => {
    const nodes = [
      makeNode({ name: 'n1', cluster: 'a', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 1 }),
      makeNode({ name: 'n2', cluster: 'a', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 1 }),
      makeNode({ name: 'n3', cluster: 'b', gpuType: 'AMD MI250', gpuCount: 2, gpuAllocated: 2 }),
    ]
    const result = computeClusterInfo(nodes)
    expect(result).toHaveLength(2)
    const clusterA = result.find(c => c.cluster === 'a')
    expect(clusterA).toMatchObject({ totalGPUs: 8, allocatedGPUs: 2, availableGPUs: 6, nodeCount: 2, gpuTypes: ['NVIDIA A100'] })
  })

  it('sorts clusters by totalGPUs descending', () => {
    const nodes = [
      makeNode({ name: 'n1', cluster: 'small', gpuCount: 1, gpuAllocated: 0 }),
      makeNode({ name: 'n2', cluster: 'big', gpuCount: 20, gpuAllocated: 0 }),
    ]
    const result = computeClusterInfo(nodes)
    expect(result.map(r => r.cluster)).toEqual(['big', 'small'])
  })
})

describe('computeGpuTotals', () => {
  it('returns zeros with no NaN utilization when there are no GPUs', () => {
    expect(computeGpuTotals([])).toEqual({ total: 0, allocated: 0, available: 0, utilizationPercent: 0 })
  })

  it('sums totals and rounds utilization percent', () => {
    const nodes = [
      makeNode({ name: 'n1', gpuCount: 3, gpuAllocated: 1 }),
      makeNode({ name: 'n2', gpuCount: 4, gpuAllocated: 2 }),
    ]
    // total = 7, allocated = 3 -> 42.857...% rounds to 43
    expect(computeGpuTotals(nodes)).toEqual({ total: 7, allocated: 3, available: 4, utilizationPercent: 43 })
  })

  it('reports 100% utilization when fully allocated', () => {
    const nodes = [makeNode({ gpuCount: 8, gpuAllocated: 8 })]
    expect(computeGpuTotals(nodes)).toEqual({ total: 8, allocated: 8, available: 0, utilizationPercent: 100 })
  })
})

describe('computeManufacturerBreakdown', () => {
  it('returns an empty array for no type info', () => {
    expect(computeManufacturerBreakdown([])).toEqual([])
  })

  it('aggregates totalGPUs per manufacturer sorted descending', () => {
    const typeInfo = computeGpuTypeInfo([
      makeNode({ name: 'n1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 0 }),
      makeNode({ name: 'n2', gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 0 }),
      makeNode({ name: 'n3', gpuType: 'AMD MI250', gpuCount: 2, gpuAllocated: 0 }),
    ])
    expect(computeManufacturerBreakdown(typeInfo)).toEqual([
      ['NVIDIA', 12],
      ['AMD', 2],
    ])
  })
})

describe('computeGpuSpecs', () => {
  it('returns empty/zero defaults for no nodes', () => {
    expect(computeGpuSpecs([])).toEqual({
      totalMemoryGB: 0,
      families: [],
      cudaDriverVersions: [],
      cudaRuntimeVersions: [],
      migCapableCount: 0,
    })
  })

  it('sums memory using MB/1024*gpuCount and rounds the total', () => {
    const nodes = [makeNode({ gpuMemoryMB: 40960, gpuCount: 2 })] // 40GB * 2 = 80GB
    expect(computeGpuSpecs(nodes).totalMemoryGB).toBe(80)
  })

  it('dedups families and CUDA versions via a Set', () => {
    const nodes = [
      makeNode({ name: 'n1', gpuFamily: 'Ampere', cudaDriverVersion: '535.1', cudaRuntimeVersion: '12.2' }),
      makeNode({ name: 'n2', gpuFamily: 'Ampere', cudaDriverVersion: '535.1', cudaRuntimeVersion: '12.2' }),
      makeNode({ name: 'n3', gpuFamily: 'Hopper', cudaDriverVersion: '550.0', cudaRuntimeVersion: '12.4' }),
    ]
    const specs = computeGpuSpecs(nodes)
    expect(specs.families).toEqual(['Ampere', 'Hopper'])
    expect(specs.cudaDriverVersions).toEqual(['535.1', '550.0'])
    expect(specs.cudaRuntimeVersions).toEqual(['12.2', '12.4'])
  })

  it('accumulates migCapableCount by gpuCount for MIG-capable nodes only', () => {
    const nodes = [
      makeNode({ name: 'n1', gpuCount: 4, migCapable: true }),
      makeNode({ name: 'n2', gpuCount: 8, migCapable: false }),
    ]
    expect(computeGpuSpecs(nodes).migCapableCount).toBe(4)
  })
})
