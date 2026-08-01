/**
 * Unit tests for GPUDetailModal.utils pure functions.
 * Covers: GPU_UTIL_HIGH, GPU_UTIL_WARN, extractManufacturer,
 * getUtilizationColor, buildGpuTypeInfo, buildClusterInfo.
 */

import { describe, it, expect } from 'vitest'
import type { GPUNode } from '../../../hooks/mcp/types.gpu'
import {
  GPU_UTIL_HIGH,
  GPU_UTIL_WARN,
  extractManufacturer,
  getUtilizationColor,
  buildGpuTypeInfo,
  buildClusterInfo,
} from './GPUDetailModal.utils'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<GPUNode> & Pick<GPUNode, 'name'>): GPUNode {
  return {
    cluster: 'cluster-a',
    gpuType: 'NVIDIA A100',
    gpuCount: 4,
    gpuAllocated: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// threshold constants
// ---------------------------------------------------------------------------

describe('GPU utilization thresholds', () => {
  it('GPU_UTIL_HIGH is 90', () => {
    expect(GPU_UTIL_HIGH).toBe(90)
  })

  it('GPU_UTIL_WARN is 70', () => {
    expect(GPU_UTIL_WARN).toBe(70)
  })

  it('warn threshold is lower than high threshold', () => {
    expect(GPU_UTIL_WARN).toBeLessThan(GPU_UTIL_HIGH)
  })
})

// ---------------------------------------------------------------------------
// extractManufacturer
// ---------------------------------------------------------------------------

describe('extractManufacturer', () => {
  it('detects NVIDIA', () => {
    expect(extractManufacturer('NVIDIA A100')).toBe('NVIDIA')
  })

  it('detects nvidia case-insensitively', () => {
    expect(extractManufacturer('nvidia h100 80GB')).toBe('NVIDIA')
  })

  it('detects AMD', () => {
    expect(extractManufacturer('AMD MI300X')).toBe('AMD')
  })

  it('detects AMD via "radeon" substring', () => {
    expect(extractManufacturer('Radeon Instinct MI250')).toBe('AMD')
  })

  it('detects Intel', () => {
    expect(extractManufacturer('Intel Gaudi2')).toBe('Intel')
  })

  it('returns Unknown for unrecognized vendor', () => {
    expect(extractManufacturer('IBM AIU')).toBe('Unknown')
  })

  it('returns Unknown for empty string', () => {
    expect(extractManufacturer('')).toBe('Unknown')
  })

  it('is case-insensitive across all vendors', () => {
    expect(extractManufacturer('AMD')).toBe('AMD')
    expect(extractManufacturer('amd')).toBe('AMD')
    expect(extractManufacturer('INTEL')).toBe('Intel')
    expect(extractManufacturer('intel')).toBe('Intel')
  })
})

// ---------------------------------------------------------------------------
// getUtilizationColor
// ---------------------------------------------------------------------------

describe('getUtilizationColor', () => {
  it('returns green below the warn threshold', () => {
    expect(getUtilizationColor(0)).toBe('text-green-400')
    expect(getUtilizationColor(50)).toBe('text-green-400')
    expect(getUtilizationColor(69)).toBe('text-green-400')
  })

  it('returns yellow at the warn threshold (70)', () => {
    expect(getUtilizationColor(70)).toBe('text-yellow-400')
  })

  it('returns yellow between warn and high thresholds', () => {
    expect(getUtilizationColor(80)).toBe('text-yellow-400')
    expect(getUtilizationColor(89)).toBe('text-yellow-400')
  })

  it('returns red at the high threshold (90)', () => {
    expect(getUtilizationColor(90)).toBe('text-red-400')
  })

  it('returns red above the high threshold', () => {
    expect(getUtilizationColor(95)).toBe('text-red-400')
    expect(getUtilizationColor(100)).toBe('text-red-400')
    expect(getUtilizationColor(150)).toBe('text-red-400')
  })
})

// ---------------------------------------------------------------------------
// buildGpuTypeInfo
// ---------------------------------------------------------------------------

describe('buildGpuTypeInfo', () => {
  it('returns empty array for empty input', () => {
    expect(buildGpuTypeInfo([])).toEqual([])
  })

  it('builds a single entry for a single node', () => {
    const result = buildGpuTypeInfo([
      makeNode({ name: 'n1', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 3, cluster: 'c1' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      type: 'NVIDIA A100',
      manufacturer: 'NVIDIA',
      totalGPUs: 8,
      allocatedGPUs: 3,
      availableGPUs: 5,
      nodeCount: 1,
      clusters: ['c1'],
    })
  })

  it('merges nodes with the same gpuType across clusters', () => {
    const result = buildGpuTypeInfo([
      makeNode({ name: 'n1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 1, cluster: 'c1' }),
      makeNode({ name: 'n2', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 5, cluster: 'c2' }),
      makeNode({ name: 'n3', gpuType: 'NVIDIA A100', gpuCount: 2, gpuAllocated: 0, cluster: 'c1' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'NVIDIA A100',
      totalGPUs: 14,
      allocatedGPUs: 6,
      availableGPUs: 8,
      nodeCount: 3,
    })
    // clusters list is de-duplicated
    expect(result[0].clusters).toEqual(['c1', 'c2'])
  })

  it('groups distinct gpuTypes separately', () => {
    const result = buildGpuTypeInfo([
      makeNode({ name: 'n1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 1 }),
      makeNode({ name: 'n2', gpuType: 'AMD MI300X', gpuCount: 2, gpuAllocated: 0 }),
    ])
    expect(result).toHaveLength(2)
    const types = result.map((r) => r.type).sort()
    expect(types).toEqual(['AMD MI300X', 'NVIDIA A100'])
  })

  it('sorts descending by totalGPUs', () => {
    const result = buildGpuTypeInfo([
      makeNode({ name: 'n1', gpuType: 'small', gpuCount: 1, gpuAllocated: 0 }),
      makeNode({ name: 'n2', gpuType: 'large', gpuCount: 16, gpuAllocated: 0 }),
      makeNode({ name: 'n3', gpuType: 'medium', gpuCount: 8, gpuAllocated: 0 }),
    ])
    expect(result.map((r) => r.type)).toEqual(['large', 'medium', 'small'])
  })

  it('derives manufacturer from gpuType for each entry', () => {
    const result = buildGpuTypeInfo([
      makeNode({ name: 'n1', gpuType: 'NVIDIA H100', gpuCount: 1, gpuAllocated: 0 }),
      makeNode({ name: 'n2', gpuType: 'AMD MI300X', gpuCount: 1, gpuAllocated: 0 }),
      makeNode({ name: 'n3', gpuType: 'Some Other Card', gpuCount: 1, gpuAllocated: 0 }),
    ])
    const byType = new Map(result.map((r) => [r.type, r.manufacturer]))
    expect(byType.get('NVIDIA H100')).toBe('NVIDIA')
    expect(byType.get('AMD MI300X')).toBe('AMD')
    expect(byType.get('Some Other Card')).toBe('Unknown')
  })
})

// ---------------------------------------------------------------------------
// buildClusterInfo
// ---------------------------------------------------------------------------

describe('buildClusterInfo', () => {
  it('returns empty array for empty input', () => {
    expect(buildClusterInfo([])).toEqual([])
  })

  it('builds a single entry for a single node', () => {
    const result = buildClusterInfo([
      makeNode({ name: 'n1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, cluster: 'c1' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      cluster: 'c1',
      totalGPUs: 4,
      allocatedGPUs: 2,
      availableGPUs: 2,
      nodeCount: 1,
      gpuTypes: ['NVIDIA A100'],
    })
  })

  it('merges nodes within the same cluster, de-duplicating gpuTypes', () => {
    const result = buildClusterInfo([
      makeNode({ name: 'n1', cluster: 'c1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 1 }),
      makeNode({ name: 'n2', cluster: 'c1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 3 }),
      makeNode({ name: 'n3', cluster: 'c1', gpuType: 'AMD MI300X', gpuCount: 2, gpuAllocated: 0 }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      cluster: 'c1',
      totalGPUs: 10,
      allocatedGPUs: 4,
      availableGPUs: 6,
      nodeCount: 3,
    })
    expect(result[0].gpuTypes).toEqual(['NVIDIA A100', 'AMD MI300X'])
  })

  it('groups distinct clusters separately', () => {
    const result = buildClusterInfo([
      makeNode({ name: 'n1', cluster: 'c1', gpuCount: 4 }),
      makeNode({ name: 'n2', cluster: 'c2', gpuCount: 4 }),
    ])
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.cluster).sort()).toEqual(['c1', 'c2'])
  })

  it('sorts descending by totalGPUs', () => {
    const result = buildClusterInfo([
      makeNode({ name: 'n1', cluster: 'small', gpuCount: 1, gpuAllocated: 0 }),
      makeNode({ name: 'n2', cluster: 'large', gpuCount: 16, gpuAllocated: 0 }),
      makeNode({ name: 'n3', cluster: 'medium', gpuCount: 8, gpuAllocated: 0 }),
    ])
    expect(result.map((r) => r.cluster)).toEqual(['large', 'medium', 'small'])
  })
})
