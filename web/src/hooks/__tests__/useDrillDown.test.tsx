/**
 * Tests for useDrillDown hook and DrillDownProvider context.
 *
 * Covers:
 * - Context availability (throws outside provider)
 * - open/close lifecycle
 * - push/pop navigation stack
 * - goTo specific index
 * - replace current view
 * - useDrillDownActions helper methods
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('../../lib/analytics', () => ({
  emitDrillDownOpened: vi.fn(),
  emitDrillDownClosed: vi.fn(),
}))

import { DrillDownProvider, useDrillDown, useDrillDownActions } from '../useDrillDown'
import type { DrillDownView } from '../useDrillDown'

function wrapper({ children }: { children: ReactNode }) {
  return <DrillDownProvider>{children}</DrillDownProvider>
}

function makeView(type: string, title: string, data: Record<string, unknown> = {}): DrillDownView {
  return { type: type as DrillDownView['type'], title, data }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDrillDown', () => {
  it('throws when used outside DrillDownProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useDrillDown())).toThrow(
      'useDrillDown must be used within a DrillDownProvider'
    )
    spy.mockRestore()
  })

  it('returns expected state shape', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    expect(result.current.state).toHaveProperty('isOpen')
    expect(result.current.state).toHaveProperty('stack')
    expect(result.current.state).toHaveProperty('currentView')
    expect(typeof result.current.open).toBe('function')
    expect(typeof result.current.push).toBe('function')
    expect(typeof result.current.pop).toBe('function')
    expect(typeof result.current.goTo).toBe('function')
    expect(typeof result.current.close).toBe('function')
    expect(typeof result.current.replace).toBe('function')
  })

  it('starts closed with empty stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toEqual([])
    expect(result.current.state.currentView).toBeNull()
  })

  it('opens with a view', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView('cluster', 'test-cluster', { cluster: 'cluster-1' })

    act(() => {
      result.current.open(view)
    })

    expect(result.current.state.isOpen).toBe(true)
    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView?.title).toBe('test-cluster')
  })

  it('closes and clears stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => {
      result.current.open(makeView('cluster', 'test-cluster'))
    })

    act(() => {
      result.current.close()
    })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toEqual([])
    expect(result.current.state.currentView).toBeNull()
  })

  it('pushes views onto the stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => {
      result.current.open(makeView('cluster', 'Cluster A'))
    })

    act(() => {
      result.current.push(makeView('namespace', 'default'))
    })

    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.currentView?.title).toBe('default')
  })

  it('pops the current view', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => {
      result.current.open(makeView('cluster', 'Cluster A'))
      result.current.push(makeView('namespace', 'default'))
      result.current.push(makeView('pod', 'pod-1'))
    })

    expect(result.current.state.stack).toHaveLength(3)

    act(() => {
      result.current.pop()
    })

    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.currentView?.title).toBe('default')
  })

  it('closes when popping the last view', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => {
      result.current.open(makeView('cluster', 'Cluster A'))
    })

    act(() => {
      result.current.pop()
    })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toEqual([])
  })

  it('goTo navigates to a specific index', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => {
      result.current.open(makeView('cluster', 'Cluster A'))
      result.current.push(makeView('namespace', 'default'))
      result.current.push(makeView('pod', 'pod-1'))
    })

    act(() => {
      result.current.goTo(0)
    })

    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView?.title).toBe('Cluster A')
  })

  it('goTo ignores out-of-range index', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => {
      result.current.open(makeView('cluster', 'Cluster A'))
    })

    act(() => {
      result.current.goTo(5)
    })

    // Should not change
    expect(result.current.state.stack).toHaveLength(1)

    act(() => {
      result.current.goTo(-1)
    })

    // Should not change
    expect(result.current.state.stack).toHaveLength(1)
  })

  it('replace updates the current view in-place', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => {
      result.current.open(makeView('cluster', 'Cluster A'))
      result.current.push(makeView('namespace', 'default'))
    })

    act(() => {
      result.current.replace(makeView('namespace', 'kube-system'))
    })

    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.currentView?.title).toBe('kube-system')
    expect(result.current.state.stack[0].title).toBe('Cluster A')
  })
})

describe('useDrillDownActions', () => {
  it('returns drill action methods', () => {
    const { result } = renderHook(() => useDrillDownActions(), { wrapper })

    expect(typeof result.current.drillToCluster).toBe('function')
    expect(typeof result.current.drillToNamespace).toBe('function')
    expect(typeof result.current.drillToDeployment).toBe('function')
    expect(typeof result.current.drillToPod).toBe('function')
    expect(typeof result.current.drillToLogs).toBe('function')
    expect(typeof result.current.drillToEvents).toBe('function')
    expect(typeof result.current.drillToNode).toBe('function')
    expect(typeof result.current.drillToGPUNode).toBe('function')
    expect(typeof result.current.drillToGPUNamespace).toBe('function')
    expect(typeof result.current.drillToYAML).toBe('function')
    expect(typeof result.current.drillToResources).toBe('function')
    expect(typeof result.current.drillToHelm).toBe('function')
    expect(typeof result.current.drillToArgoApp).toBe('function')
    expect(typeof result.current.drillToPolicy).toBe('function')
    expect(typeof result.current.drillToAlert).toBe('function')
    expect(typeof result.current.drillToCost).toBe('function')
    expect(typeof result.current.drillToRBAC).toBe('function')
    expect(typeof result.current.drillToOperator).toBe('function')
    expect(typeof result.current.drillToAllClusters).toBe('function')
    expect(typeof result.current.drillToAllPods).toBe('function')
    expect(typeof result.current.drillToAllGPU).toBe('function')
  })

  it('does not throw when used outside provider', () => {
    // useDrillDownActions gracefully handles missing context
    const { result } = renderHook(() => useDrillDownActions())

    // Should not throw
    expect(() => result.current.drillToCluster('test-cluster')).not.toThrow()
  })

  it('drillToCluster opens a cluster view', () => {
    const { result } = renderHook(
      () => ({ actions: useDrillDownActions(), drill: useDrillDown() }),
      { wrapper }
    )

    act(() => {
      result.current.actions.drillToCluster('my-cluster')
    })

    expect(result.current.drill.state.isOpen).toBe(true)
    expect(result.current.drill.state.currentView?.type).toBe('cluster')
    expect(result.current.drill.state.currentView?.data.cluster).toBe('my-cluster')
  })

  it('drillToNamespace opens a namespace view', () => {
    const { result } = renderHook(
      () => ({ actions: useDrillDownActions(), drill: useDrillDown() }),
      { wrapper }
    )

    act(() => {
      result.current.actions.drillToNamespace('cluster-1', 'kube-system')
    })

    expect(result.current.drill.state.currentView?.type).toBe('namespace')
    expect(result.current.drill.state.currentView?.data.namespace).toBe('kube-system')
  })

  it('drillToPod pushes onto existing stack', () => {
    const { result } = renderHook(
      () => ({ actions: useDrillDownActions(), drill: useDrillDown() }),
      { wrapper }
    )

    act(() => {
      result.current.actions.drillToCluster('cluster-1')
    })

    act(() => {
      result.current.actions.drillToPod('cluster-1', 'default', 'my-pod-xyz')
    })

    expect(result.current.drill.state.stack).toHaveLength(2)
    expect(result.current.drill.state.currentView?.type).toBe('pod')
  })

  it('drillToAllClusters opens a multi-cluster summary view', () => {
    const { result } = renderHook(
      () => ({ actions: useDrillDownActions(), drill: useDrillDown() }),
      { wrapper }
    )

    act(() => {
      result.current.actions.drillToAllClusters('unhealthy')
    })

    expect(result.current.drill.state.currentView?.type).toBe('all-clusters')
    expect(result.current.drill.state.currentView?.title).toContain('Unhealthy')
  })

  it('drillToAllClusters without filter uses "All Clusters" title', () => {
    const { result } = renderHook(
      () => ({ actions: useDrillDownActions(), drill: useDrillDown() }),
      { wrapper }
    )

    act(() => {
      result.current.actions.drillToAllClusters()
    })

    expect(result.current.drill.state.currentView?.title).toBe('All Clusters')
  })

  it('navigates to existing view instead of duplicating', () => {
    const { result } = renderHook(
      () => ({ actions: useDrillDownActions(), drill: useDrillDown() }),
      { wrapper }
    )

    act(() => {
      result.current.actions.drillToCluster('cluster-1')
    })

    act(() => {
      result.current.actions.drillToNamespace('cluster-1', 'default')
    })

    act(() => {
      result.current.actions.drillToPod('cluster-1', 'default', 'pod-1')
    })

    expect(result.current.drill.state.stack).toHaveLength(3)

    // Navigate back to cluster-1 (should reuse, not push duplicate)
    act(() => {
      result.current.actions.drillToCluster('cluster-1')
    })

    // Should go back to index 0 instead of pushing
    expect(result.current.drill.state.stack).toHaveLength(1)
    expect(result.current.drill.state.currentView?.type).toBe('cluster')
  })
})
