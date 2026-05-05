/**
 * Unit tests for the taint-aware GPU filter utilities (#8172).
 *
 * Focuses on the pure filter helpers and the `useGPUTaintFilter` hook —
 * the UI control is exercised indirectly via the GPU Utilization / GPU
 * Inventory card tests.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GPUNode } from '../../../hooks/mcp/types'
import {
  taintKey,
  collectDistinctTaints,
  nodeToleratesAll,
  useGPUTaintFilter,
  EFFECT_NO_SCHEDULE,
  EFFECT_NO_EXECUTE,
} from '../GPUTaintFilter'

const DEDICATED_OFER = { key: 'dedicated', value: 'ofer', effect: EFFECT_NO_SCHEDULE }
const EVICT_BAD = { key: 'bad', value: '', effect: EFFECT_NO_EXECUTE }
const PREFER = { key: 'hint', value: '', effect: 'PreferNoSchedule' }

function node(name: string, gpuCount: number, taints?: GPUNode['taints']): GPUNode {
  return {
    name,
    cluster: 'vllm-gpu-cluster',
    gpuType: 'NVIDIA A100',
    gpuCount,
    gpuAllocated: 0,
    taints,
  }
}

describe('taintKey', () => {
  it('stably keys a (key, value, effect) triple', () => {
    expect(taintKey(DEDICATED_OFER)).toBe('dedicated=ofer:NoSchedule')
  })

  it('handles missing value', () => {
    expect(taintKey({ key: 'k', effect: EFFECT_NO_SCHEDULE })).toBe('k=:NoSchedule')
  })
})

describe('collectDistinctTaints', () => {
  it('returns scheduling-gating taints only, deduplicated', () => {
    const nodes: GPUNode[] = [
      node('a', 8, [DEDICATED_OFER, PREFER]),
      node('b', 8, [DEDICATED_OFER]),
      node('c', 8, [EVICT_BAD]),
      node('d', 8),
    ]
    const taints = collectDistinctTaints(nodes)
    expect(taints).toHaveLength(2)
    expect(taints.map(taintKey).sort()).toEqual([
      'bad=:NoExecute',
      'dedicated=ofer:NoSchedule',
    ])
  })

  it('tolerates null/undefined inputs safely', () => {
    expect(collectDistinctTaints(undefined as unknown as GPUNode[])).toEqual([])
  })
})

describe('nodeToleratesAll', () => {
  it('visible when node has no taints', () => {
    expect(nodeToleratesAll(node('a', 8), new Set())).toBe(true)
  })

  it('hidden when any scheduling-gating taint is untolerated', () => {
    expect(nodeToleratesAll(node('a', 8, [DEDICATED_OFER]), new Set())).toBe(false)
  })

  it('visible when all scheduling-gating taints are tolerated', () => {
    const tolerated = new Set([taintKey(DEDICATED_OFER)])
    expect(nodeToleratesAll(node('a', 8, [DEDICATED_OFER]), tolerated)).toBe(true)
  })

  it('ignores advisory PreferNoSchedule taints', () => {
    expect(nodeToleratesAll(node('a', 8, [PREFER]), new Set())).toBe(true)
  })
})

describe('useGPUTaintFilter', () => {
  const nodes: GPUNode[] = [
    node('untainted', 3),
    node('ofer-reserved', 8, [DEDICATED_OFER]),
  ]

  it('defaults to hiding tainted nodes', () => {
    const { result } = renderHook(() => useGPUTaintFilter(nodes))
    expect(result.current.visibleNodes.map(n => n.name)).toEqual(['untainted'])
    expect(result.current.hiddenGPUCount).toBe(8)
  })

  it('toggle reveals a tainted node once its taint is tolerated', () => {
    const { result } = renderHook(() => useGPUTaintFilter(nodes))
    act(() => {
      result.current.toggle(DEDICATED_OFER)
    })
    expect(result.current.visibleNodes.map(n => n.name).sort()).toEqual([
      'ofer-reserved',
      'untainted',
    ])
    expect(result.current.hiddenGPUCount).toBe(0)
  })

  it('clear reverts to the default "no tolerations" view', () => {
    const { result } = renderHook(() => useGPUTaintFilter(nodes))
    act(() => { result.current.toggle(DEDICATED_OFER) })
    act(() => { result.current.clear() })
    expect(result.current.visibleNodes.map(n => n.name)).toEqual(['untainted'])
  })

  it('prunes stale toleration keys on read when a taint vanishes', () => {
    const initial = [node('a', 8, [DEDICATED_OFER])]
    const { result, rerender } = renderHook(({ data }) => useGPUTaintFilter(data), {
      initialProps: { data: initial },
    })
    act(() => { result.current.toggle(DEDICATED_OFER) })
    expect(result.current.toleratedKeys.size).toBe(1)
    rerender({ data: [node('b', 4)] })
    expect(result.current.toleratedKeys.size).toBe(0)
  })
})
