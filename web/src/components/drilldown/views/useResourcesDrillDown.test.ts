import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useResourcesDrillDown } from './useResourcesDrillDown'
import type { ClusterInfo } from '../../../hooks/useMCP'

const c = (name: string, aliases?: string[]): ClusterInfo =>
  ({ name, aliases } as unknown as ClusterInfo)

describe('useResourcesDrillDown', () => {
  it('returns empty clusters and empty nameMap when input is undefined', () => {
    const { result } = renderHook(() => useResourcesDrillDown(undefined))
    expect(result.current.clusters).toEqual([])
    expect(result.current.clusterNameMap).toEqual({})
    expect(result.current.sensors.length).toBeGreaterThan(0)
    expect(typeof result.current.handleDragEnd).toBe('function')
  })

  it('sorts clusters alphabetically by name when no custom order is set', () => {
    const clusters = [c('zeta'), c('alpha'), c('mu')]
    const { result } = renderHook(() =>
      useResourcesDrillDown(clusters),
    )
    expect(result.current.clusters.map((x) => x.name)).toEqual([
      'alpha',
      'mu',
      'zeta',
    ])
  })

  it('builds clusterNameMap covering both names and aliases', () => {
    const clusters = [
      c('alpha', ['a1', 'a2']),
      c('beta'),
    ]
    const { result } = renderHook(() =>
      useResourcesDrillDown(clusters),
    )
    expect(result.current.clusterNameMap).toEqual({
      alpha: 'alpha',
      a1: 'alpha',
      a2: 'alpha',
      beta: 'beta',
    })
  })

  it('handleDragEnd is a no-op when there is no drop target', () => {
    const clusters = [c('a'), c('b'), c('c')]
    const { result } = renderHook(() =>
      useResourcesDrillDown(clusters),
    )
    const before = result.current.clusters.map((x) => x.name)
    act(() => {
      // @ts-expect-error - minimal DragEndEvent stub
      result.current.handleDragEnd({ active: { id: 'a' }, over: null })
    })
    expect(result.current.clusters.map((x) => x.name)).toEqual(before)
  })

  it('handleDragEnd is a no-op when active and over ids are equal', () => {
    const clusters = [c('a'), c('b'), c('c')]
    const { result } = renderHook(() =>
      useResourcesDrillDown(clusters),
    )
    const before = result.current.clusters.map((x) => x.name)
    act(() => {
      // @ts-expect-error - minimal DragEndEvent stub
      result.current.handleDragEnd({ active: { id: 'b' }, over: { id: 'b' } })
    })
    expect(result.current.clusters.map((x) => x.name)).toEqual(before)
  })

  it('handleDragEnd reorders clusters and subsequent renders honour the new order', () => {
    const clusters = [c('a'), c('b'), c('c')]
    const { result } = renderHook(() =>
      useResourcesDrillDown(clusters),
    )
    expect(result.current.clusters.map((x) => x.name)).toEqual(['a', 'b', 'c'])
    act(() => {
      // @ts-expect-error - minimal DragEndEvent stub
      result.current.handleDragEnd({ active: { id: 'a' }, over: { id: 'c' } })
    })
    expect(result.current.clusters.map((x) => x.name)).toEqual(['b', 'c', 'a'])
  })

  it('places clusters not in the saved order after ordered ones, sorted alphabetically', () => {
    const clusters = [c('a'), c('b'), c('c')]
    const { result, rerender } = renderHook(
      ({ list }: { list: ClusterInfo[] }) => useResourcesDrillDown(list),
      { initialProps: { list: clusters } },
    )
    act(() => {
      // @ts-expect-error - minimal DragEndEvent stub
      result.current.handleDragEnd({ active: { id: 'c' }, over: { id: 'a' } })
    })
    expect(result.current.clusters.map((x) => x.name)).toEqual(['c', 'a', 'b'])

    rerender({ list: [c('a'), c('b'), c('c'), c('z'), c('m')] })
    expect(result.current.clusters.map((x) => x.name)).toEqual([
      'c',
      'a',
      'b',
      'm',
      'z',
    ])
  })
})
