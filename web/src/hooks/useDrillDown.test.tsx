import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { DrillDownProvider, useDrillDown, useDrillDownActions } from './useDrillDown'
import type { DrillDownView } from './useDrillDown'
import { emitDrillDownOpened, emitDrillDownClosed } from '../lib/analytics'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('../lib/analytics', () => ({
  emitDrillDownOpened: vi.fn(),
  emitDrillDownClosed: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DrillDownProvider>{children}</DrillDownProvider>
)

/** Factory for creating a DrillDownView with sensible defaults. */
function makeView(overrides: Partial<DrillDownView> = {}): DrillDownView {
  return {
    type: overrides.type ?? 'cluster',
    title: overrides.title ?? 'test-cluster',
    subtitle: overrides.subtitle,
    data: overrides.data ?? { cluster: 'ctx/test-cluster' },
    customComponent: overrides.customComponent,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
  window.history.replaceState(null, '', window.location.pathname)
})

// ── Provider setup ────────────────────────────────────────────────────────────

describe('DrillDownProvider', () => {
  it('useDrillDown throws when used outside DrillDownProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useDrillDown())).toThrow(
      'useDrillDown must be used within a DrillDownProvider',
    )
    consoleSpy.mockRestore()
  })

  it('exposes the expected context shape', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    expect(result.current.state).toBeDefined()
    expect(typeof result.current.open).toBe('function')
    expect(typeof result.current.push).toBe('function')
    expect(typeof result.current.pop).toBe('function')
    expect(typeof result.current.goTo).toBe('function')
    expect(typeof result.current.close).toBe('function')
    expect(typeof result.current.replace).toBe('function')
  })
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with isOpen false', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    expect(result.current.state.isOpen).toBe(false)
  })

  it('starts with an empty stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    expect(result.current.state.stack).toEqual([])
  })

  it('starts with currentView null', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    expect(result.current.state.currentView).toBeNull()
  })
})

// ── open ──────────────────────────────────────────────────────────────────────

describe('open', () => {
  it('sets isOpen to true', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView()

    act(() => { result.current.open(view) })

    expect(result.current.state.isOpen).toBe(true)
  })

  it('sets currentView to the opened view', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView({ title: 'my-cluster' })

    act(() => { result.current.open(view) })

    expect(result.current.state.currentView).toEqual(view)
  })

  it('creates a stack with exactly one entry', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView()

    act(() => { result.current.open(view) })

    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.stack[0]).toEqual(view)
  })

  it('resets the stack when called while already open', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ title: 'cluster-1' })
    const view2 = makeView({ title: 'cluster-2' })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })) })
    // Now open a fresh view — should reset the stack
    act(() => { result.current.open(view2) })

    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView).toEqual(view2)
  })

  it('calls emitDrillDownOpened analytics event', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView({ type: 'deployment' })

    act(() => { result.current.open(view) })

    expect(emitDrillDownOpened).toHaveBeenCalledWith('deployment')
    expect(emitDrillDownOpened).toHaveBeenCalledTimes(1)
  })
})

// ── push ──────────────────────────────────────────────────────────────────────

describe('push', () => {
  it('adds a view to the top of the stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ type: 'cluster', title: 'cluster-1' })
    const view2 = makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })

    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.stack[0]).toEqual(view1)
    expect(result.current.state.stack[1]).toEqual(view2)
  })

  it('updates currentView to the newly pushed view', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView()
    const view2 = makeView({ type: 'pod', title: 'my-pod', data: { cluster: 'a', namespace: 'ns', pod: 'my-pod' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })

    expect(result.current.state.currentView).toEqual(view2)
  })

  it('supports multiple sequential pushes (deep drill-down)', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const DEPTH = 5
    const views = Array.from({ length: DEPTH }, (_, i) =>
      makeView({ type: 'namespace', title: `ns-${i}`, data: { cluster: 'a', namespace: `ns-${i}` } }),
    )

    act(() => { result.current.open(views[0]) })
    for (let i = 1; i < DEPTH; i++) {
      act(() => { result.current.push(views[i]) })
    }

    expect(result.current.state.stack).toHaveLength(DEPTH)
    expect(result.current.state.currentView).toEqual(views[DEPTH - 1])
  })
})

// ── pop ───────────────────────────────────────────────────────────────────────

describe('pop', () => {
  it('removes the top view from the stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ title: 'cluster-1' })
    const view2 = makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })
    act(() => { result.current.pop() })

    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView).toEqual(view1)
  })

  it('closes the drill-down when popping the last item', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView()

    act(() => { result.current.open(view) })
    act(() => { result.current.pop() })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toEqual([])
    expect(result.current.state.currentView).toBeNull()
  })

  it('is a no-op when stack is already empty', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    // Pop on an empty state should not throw and state should stay the same
    act(() => { result.current.pop() })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toEqual([])
    expect(result.current.state.currentView).toBeNull()
  })

  it('pops back through multiple levels correctly', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ title: 'cluster-1' })
    const view2 = makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })
    const view3 = makeView({ type: 'pod', title: 'pod-1', data: { cluster: 'a', namespace: 'ns-1', pod: 'pod-1' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })
    act(() => { result.current.push(view3) })

    // Pop back to view2
    act(() => { result.current.pop() })
    expect(result.current.state.currentView).toEqual(view2)
    expect(result.current.state.stack).toHaveLength(2)

    // Pop back to view1
    act(() => { result.current.pop() })
    expect(result.current.state.currentView).toEqual(view1)
    expect(result.current.state.stack).toHaveLength(1)

    // Pop to close
    act(() => { result.current.pop() })
    expect(result.current.state.isOpen).toBe(false)
  })
})

// ── goTo ──────────────────────────────────────────────────────────────────────

describe('goTo', () => {
  it('navigates to a specific index in the stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ title: 'cluster-1' })
    const view2 = makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })
    const view3 = makeView({ type: 'pod', title: 'pod-1', data: { cluster: 'a', namespace: 'ns-1', pod: 'pod-1' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })
    act(() => { result.current.push(view3) })

    // Jump back to the root (index 0)
    act(() => { result.current.goTo(0) })

    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView).toEqual(view1)
  })

  it('navigates to a middle index, truncating views above it', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ title: 'cluster-1' })
    const view2 = makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })
    const view3 = makeView({ type: 'deployment', title: 'dep-1', data: { cluster: 'a', namespace: 'ns-1', deployment: 'dep-1' } })
    const view4 = makeView({ type: 'pod', title: 'pod-1', data: { cluster: 'a', namespace: 'ns-1', pod: 'pod-1' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })
    act(() => { result.current.push(view3) })
    act(() => { result.current.push(view4) })

    // Jump to index 1 (view2)
    act(() => { result.current.goTo(1) })

    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.currentView).toEqual(view2)
  })

  it('is a no-op for negative indices', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView()

    act(() => { result.current.open(view) })
    act(() => { result.current.goTo(-1) })

    // State should not change
    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView).toEqual(view)
  })

  it('is a no-op for indices beyond the stack length', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView()

    act(() => { result.current.open(view) })
    act(() => { result.current.goTo(5) })

    // State should not change
    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView).toEqual(view)
  })

  it('going to the current index is a no-op (does not change state)', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ title: 'cluster-1' })
    const view2 = makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })

    // goTo the last index (current position)
    act(() => { result.current.goTo(1) })

    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.currentView).toEqual(view2)
  })
})

// ── close ─────────────────────────────────────────────────────────────────────

describe('close', () => {
  it('sets isOpen to false and clears the stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView()

    act(() => { result.current.open(view) })
    act(() => { result.current.close() })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toEqual([])
    expect(result.current.state.currentView).toBeNull()
  })

  it('calls emitDrillDownClosed with the current view type and depth', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ type: 'cluster' })
    const view2 = makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })
    const view3 = makeView({ type: 'pod', title: 'pod-1', data: { cluster: 'a', namespace: 'ns-1', pod: 'pod-1' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })
    act(() => { result.current.push(view3) })
    act(() => { result.current.close() })

    const EXPECTED_DEPTH = 3
    expect(emitDrillDownClosed).toHaveBeenCalledWith('pod', EXPECTED_DEPTH)
    expect(emitDrillDownClosed).toHaveBeenCalledTimes(1)
  })

  it('does not call emitDrillDownClosed when already closed (no current view)', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => { result.current.close() })

    expect(emitDrillDownClosed).not.toHaveBeenCalled()
  })

  it('can be reopened after being closed', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ title: 'first' })
    const view2 = makeView({ title: 'second' })

    act(() => { result.current.open(view1) })
    act(() => { result.current.close() })
    act(() => { result.current.open(view2) })

    expect(result.current.state.isOpen).toBe(true)
    expect(result.current.state.currentView).toEqual(view2)
    expect(result.current.state.stack).toHaveLength(1)
  })
})

// ── replace ───────────────────────────────────────────────────────────────────

describe('replace', () => {
  it('replaces the current (top) view without changing stack depth', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ title: 'cluster-1' })
    const view2 = makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })
    const replacement = makeView({ type: 'namespace', title: 'ns-replaced', data: { cluster: 'a', namespace: 'ns-replaced' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })
    act(() => { result.current.replace(replacement) })

    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.currentView).toEqual(replacement)
    // The first view should be unchanged
    expect(result.current.state.stack[0]).toEqual(view1)
    expect(result.current.state.stack[1]).toEqual(replacement)
  })

  it('replaces the only view when stack has one entry', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view = makeView({ title: 'original' })
    const replacement = makeView({ title: 'replacement' })

    act(() => { result.current.open(view) })
    act(() => { result.current.replace(replacement) })

    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView).toEqual(replacement)
  })
})

// ── Combined workflows ────────────────────────────────────────────────────────

describe('combined workflows', () => {
  it('open -> push -> push -> goTo(0) -> push creates correct state', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const cluster = makeView({ type: 'cluster', title: 'cluster-1' })
    const ns = makeView({ type: 'namespace', title: 'ns-1', data: { cluster: 'a', namespace: 'ns-1' } })
    const pod = makeView({ type: 'pod', title: 'pod-1', data: { cluster: 'a', namespace: 'ns-1', pod: 'pod-1' } })
    const ns2 = makeView({ type: 'namespace', title: 'ns-2', data: { cluster: 'a', namespace: 'ns-2' } })

    act(() => { result.current.open(cluster) })
    act(() => { result.current.push(ns) })
    act(() => { result.current.push(pod) })
    // Go back to root
    act(() => { result.current.goTo(0) })
    // Push a different namespace
    act(() => { result.current.push(ns2) })

    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.stack[0]).toEqual(cluster)
    expect(result.current.state.stack[1]).toEqual(ns2)
    expect(result.current.state.currentView).toEqual(ns2)
  })

  it('preserves isOpen through push and pop as long as stack is non-empty', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const view1 = makeView({ title: 'v1' })
    const view2 = makeView({ type: 'namespace', title: 'v2', data: { cluster: 'a', namespace: 'v2' } })
    const view3 = makeView({ type: 'pod', title: 'v3', data: { cluster: 'a', namespace: 'v2', pod: 'v3' } })

    act(() => { result.current.open(view1) })
    act(() => { result.current.push(view2) })
    act(() => { result.current.push(view3) })
    expect(result.current.state.isOpen).toBe(true)

    act(() => { result.current.pop() })
    expect(result.current.state.isOpen).toBe(true)

    act(() => { result.current.pop() })
    expect(result.current.state.isOpen).toBe(true) // still one item left

    act(() => { result.current.pop() })
    expect(result.current.state.isOpen).toBe(false) // now closed
  })
})

// ── useDrillDownActions ───────────────────────────────────────────────────────

describe('useDrillDownActions', () => {
  const actionsWrapper = ({ children }: { children: React.ReactNode }) => (
    <DrillDownProvider>{children}</DrillDownProvider>
  )

  /** Render both useDrillDown and useDrillDownActions in the same provider. */
  function renderBothHooks() {
    const { result } = renderHook(
      () => ({
        drillDown: useDrillDown(),
        actions: useDrillDownActions(),
      }),
      { wrapper: actionsWrapper },
    )
    return result
  }

  describe('drillToCluster', () => {
    it('opens a cluster drill-down view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToCluster('ctx/prod-cluster') })

      expect(result.current.drillDown.state.isOpen).toBe(true)
      expect(result.current.drillDown.state.currentView?.type).toBe('cluster')
      expect(result.current.drillDown.state.currentView?.title).toBe('prod-cluster')
      expect(result.current.drillDown.state.currentView?.data.cluster).toBe('ctx/prod-cluster')
    })

    it('passes extra clusterData into the view data', () => {
      const result = renderBothHooks()
      const extraData = { version: 'v1.28', provider: 'eks' }

      act(() => { result.current.actions.drillToCluster('ctx/prod', extraData) })

      expect(result.current.drillDown.state.currentView?.data.version).toBe('v1.28')
      expect(result.current.drillDown.state.currentView?.data.provider).toBe('eks')
    })
  })

  describe('drillToNamespace', () => {
    it('opens a namespace drill-down view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToNamespace('ctx/prod', 'kube-system') })

      expect(result.current.drillDown.state.currentView?.type).toBe('namespace')
      expect(result.current.drillDown.state.currentView?.title).toBe('kube-system')
      expect(result.current.drillDown.state.currentView?.data.namespace).toBe('kube-system')
    })
  })

  describe('drillToDeployment', () => {
    it('opens a deployment drill-down view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToDeployment('ctx/prod', 'default', 'nginx') })

      expect(result.current.drillDown.state.currentView?.type).toBe('deployment')
      expect(result.current.drillDown.state.currentView?.title).toBe('nginx')
      expect(result.current.drillDown.state.currentView?.data.deployment).toBe('nginx')
    })
  })

  describe('drillToPod', () => {
    it('opens a pod drill-down view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToPod('ctx/prod', 'default', 'nginx-abc123') })

      expect(result.current.drillDown.state.currentView?.type).toBe('pod')
      expect(result.current.drillDown.state.currentView?.title).toBe('nginx-abc123')
    })
  })

  describe('drillToLogs', () => {
    it('opens a logs view with container info', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToLogs('ctx/prod', 'default', 'nginx-abc123', 'nginx') })

      expect(result.current.drillDown.state.currentView?.type).toBe('logs')
      expect(result.current.drillDown.state.currentView?.subtitle).toBe('Container: nginx')
      expect(result.current.drillDown.state.currentView?.data.container).toBe('nginx')
    })

    it('opens a logs view without container (all containers)', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToLogs('ctx/prod', 'default', 'nginx-abc123') })

      expect(result.current.drillDown.state.currentView?.subtitle).toBe('All containers')
    })
  })

  describe('drillToEvents', () => {
    it('opens an events view for a specific object', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToEvents('ctx/prod', 'default', 'nginx-deploy') })

      expect(result.current.drillDown.state.currentView?.type).toBe('events')
      expect(result.current.drillDown.state.currentView?.title).toBe('Events: nginx-deploy')
    })

    it('opens an events view without an object name', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToEvents('ctx/prod', 'default') })

      expect(result.current.drillDown.state.currentView?.title).toBe('Events')
    })
  })

  describe('drillToNode', () => {
    it('opens a node drill-down view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToNode('ctx/prod', 'worker-1') })

      expect(result.current.drillDown.state.currentView?.type).toBe('node')
      expect(result.current.drillDown.state.currentView?.title).toBe('worker-1')
    })
  })

  describe('drillToGPUNode', () => {
    it('opens a GPU node drill-down view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToGPUNode('ctx/prod', 'gpu-worker-1', { gpuType: 'A100' }) })

      expect(result.current.drillDown.state.currentView?.type).toBe('gpu-node')
      expect(result.current.drillDown.state.currentView?.data.gpuType).toBe('A100')
    })
  })

  describe('drillToGPUNamespace', () => {
    it('opens a GPU namespace drill-down view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToGPUNamespace('ml-training', { gpuCount: 4 }) })

      expect(result.current.drillDown.state.currentView?.type).toBe('gpu-namespace')
      expect(result.current.drillDown.state.currentView?.subtitle).toBe('GPU Namespace Allocations')
    })
  })

  describe('drillToYAML', () => {
    it('opens a YAML view with resource info', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToYAML('ctx/prod', 'default', 'Deployment', 'nginx') })

      expect(result.current.drillDown.state.currentView?.type).toBe('yaml')
      expect(result.current.drillDown.state.currentView?.title).toBe('Deployment: nginx')
    })
  })

  describe('drillToResources', () => {
    it('opens a resources drill-down view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToResources() })

      expect(result.current.drillDown.state.currentView?.type).toBe('resources')
      expect(result.current.drillDown.state.currentView?.title).toBe('Resource Usage')
    })
  })

  describe('openOrPush deduplication', () => {
    it('pushes a new view when drill-down is already open', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToCluster('ctx/prod') })
      act(() => { result.current.actions.drillToNamespace('ctx/prod', 'default') })

      expect(result.current.drillDown.state.stack).toHaveLength(2)
      expect(result.current.drillDown.state.currentView?.type).toBe('namespace')
    })

    it('navigates to an existing view instead of pushing a duplicate', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToCluster('ctx/prod') })
      act(() => { result.current.actions.drillToNamespace('ctx/prod', 'default') })
      act(() => { result.current.actions.drillToPod('ctx/prod', 'default', 'pod-1') })

      // Now drill to the same cluster again — should navigate back, not push duplicate
      act(() => { result.current.actions.drillToCluster('ctx/prod') })

      expect(result.current.drillDown.state.stack).toHaveLength(1)
      expect(result.current.drillDown.state.currentView?.type).toBe('cluster')
    })

    it('pushes a genuinely different view of the same type', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToCluster('ctx/prod') })
      act(() => { result.current.actions.drillToCluster('ctx/staging') })

      // Different cluster, so it should push (not navigate)
      expect(result.current.drillDown.state.stack).toHaveLength(2)
      expect(result.current.drillDown.state.currentView?.data.cluster).toBe('ctx/staging')
    })
  })

  // Phase 2 action helpers
  describe('Phase 2 drill actions', () => {
    it('drillToHelm opens a helm view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToHelm('ctx/prod', 'default', 'my-release') })

      expect(result.current.drillDown.state.currentView?.type).toBe('helm')
      expect(result.current.drillDown.state.currentView?.data.release).toBe('my-release')
    })

    it('drillToArgoApp opens an argoapp view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToArgoApp('ctx/prod', 'argocd', 'my-app') })

      expect(result.current.drillDown.state.currentView?.type).toBe('argoapp')
      expect(result.current.drillDown.state.currentView?.data.app).toBe('my-app')
    })

    it('drillToPolicy opens a policy view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToPolicy('ctx/prod', 'default', 'restrict-privileged') })

      expect(result.current.drillDown.state.currentView?.type).toBe('policy')
      expect(result.current.drillDown.state.currentView?.data.policy).toBe('restrict-privileged')
    })

    it('drillToCRD opens a CRD view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToCRD('ctx/prod', 'certificates.cert-manager.io') })

      expect(result.current.drillDown.state.currentView?.type).toBe('crd')
      expect(result.current.drillDown.state.currentView?.data.crd).toBe('certificates.cert-manager.io')
    })

    it('drillToOperator opens an operator view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToOperator('ctx/prod', 'operators', 'cert-manager') })

      expect(result.current.drillDown.state.currentView?.type).toBe('operator')
      expect(result.current.drillDown.state.currentView?.data.operator).toBe('cert-manager')
    })
  })

  // Multi-cluster summary actions
  describe('multi-cluster summary actions', () => {
    it('drillToAllClusters without filter uses default title', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToAllClusters() })

      expect(result.current.drillDown.state.currentView?.type).toBe('all-clusters')
      expect(result.current.drillDown.state.currentView?.title).toBe('All Clusters')
    })

    it('drillToAllClusters with filter capitalizes it in the title', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToAllClusters('healthy') })

      expect(result.current.drillDown.state.currentView?.title).toBe('Healthy Clusters')
      expect(result.current.drillDown.state.currentView?.data.filter).toBe('healthy')
    })

    it('drillToAllPods opens a multi-cluster pods view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToAllPods('failing') })

      expect(result.current.drillDown.state.currentView?.type).toBe('all-pods')
      expect(result.current.drillDown.state.currentView?.title).toBe('Failing Pods')
    })

    it('drillToAllDeployments opens a multi-cluster deployments view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToAllDeployments() })

      expect(result.current.drillDown.state.currentView?.type).toBe('all-deployments')
      expect(result.current.drillDown.state.currentView?.title).toBe('All Deployments')
    })

    it('drillToAllNodes opens a multi-cluster nodes view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToAllNodes() })

      expect(result.current.drillDown.state.currentView?.type).toBe('all-nodes')
    })

    it('drillToAllEvents opens a multi-cluster events view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToAllEvents('warning') })

      expect(result.current.drillDown.state.currentView?.type).toBe('all-events')
      expect(result.current.drillDown.state.currentView?.title).toBe('Warning Events')
    })
  })

  // Additional resource type actions
  describe('additional resource type actions', () => {
    it('drillToReplicaSet opens a replicaset view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToReplicaSet('ctx/prod', 'default', 'nginx-rs-abc') })

      expect(result.current.drillDown.state.currentView?.type).toBe('replicaset')
      expect(result.current.drillDown.state.currentView?.data.replicaset).toBe('nginx-rs-abc')
    })

    it('drillToConfigMap opens a configmap view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToConfigMap('ctx/prod', 'default', 'app-config') })

      expect(result.current.drillDown.state.currentView?.type).toBe('configmap')
      expect(result.current.drillDown.state.currentView?.data.configmap).toBe('app-config')
    })

    it('drillToSecret opens a secret view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToSecret('ctx/prod', 'default', 'db-password') })

      expect(result.current.drillDown.state.currentView?.type).toBe('secret')
    })

    it('drillToServiceAccount opens a serviceaccount view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToServiceAccount('ctx/prod', 'default', 'my-sa') })

      expect(result.current.drillDown.state.currentView?.type).toBe('serviceaccount')
    })

    it('drillToPVC opens a PVC view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToPVC('ctx/prod', 'default', 'data-volume') })

      expect(result.current.drillDown.state.currentView?.type).toBe('pvc')
      expect(result.current.drillDown.state.currentView?.subtitle).toBe('PVC in default')
    })

    it('drillToJob opens a job view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToJob('ctx/prod', 'batch', 'data-import') })

      expect(result.current.drillDown.state.currentView?.type).toBe('job')
      expect(result.current.drillDown.state.currentView?.subtitle).toBe('Job in batch')
    })

    it('drillToHPA opens an HPA view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToHPA('ctx/prod', 'default', 'nginx-hpa') })

      expect(result.current.drillDown.state.currentView?.type).toBe('hpa')
    })

    it('drillToService opens a service view', () => {
      const result = renderBothHooks()

      act(() => { result.current.actions.drillToService('ctx/prod', 'default', 'nginx-svc') })

      expect(result.current.drillDown.state.currentView?.type).toBe('service')
      expect(result.current.drillDown.state.currentView?.subtitle).toBe('Service in default')
    })
  })
})

// ── useDrillDownActions without provider ──────────────────────────────────────

describe('useDrillDownActions without DrillDownProvider', () => {
  it('does not throw when used outside DrillDownProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useDrillDownActions())).not.toThrow()
    consoleSpy.mockRestore()
  })

  it('returns callable drillTo* no-op functions when provider is absent', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useDrillDownActions())
    // Calling any drillTo* should not throw
    expect(() => {
      act(() => { result.current.drillToCluster('ctx/prod') })
      act(() => { result.current.drillToPod('ctx/prod', 'default', 'my-pod') })
      act(() => { result.current.drillToAllClusters() })
    }).not.toThrow()
    consoleSpy.mockRestore()
  })
})

// ── Regression-preventing deep tests ─────────────────────────────────────────

describe('replace edge cases', () => {
  it('replace on a single-item stack produces a stack with only the replacement', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const original = makeView({ type: 'cluster', title: 'original' })
    const replacement = makeView({ type: 'namespace', title: 'replaced', data: { cluster: 'a', namespace: 'replaced' } })

    act(() => { result.current.open(original) })
    act(() => { result.current.replace(replacement) })

    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.stack[0]).toEqual(replacement)
    expect(result.current.state.currentView).toEqual(replacement)
    expect(result.current.state.isOpen).toBe(true)
  })

  it('replace preserves all views below the top of the stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const STACK_DEPTH = 4
    const views = Array.from({ length: STACK_DEPTH }, (_, i) =>
      makeView({ type: 'namespace', title: `ns-${i}`, data: { cluster: 'a', namespace: `ns-${i}` } }),
    )
    const replacement = makeView({ type: 'pod', title: 'pod-replaced', data: { cluster: 'a', namespace: 'ns-3', pod: 'pod-replaced' } })

    act(() => { result.current.open(views[0]) })
    for (let i = 1; i < STACK_DEPTH; i++) {
      act(() => { result.current.push(views[i]) })
    }
    act(() => { result.current.replace(replacement) })

    expect(result.current.state.stack).toHaveLength(STACK_DEPTH)
    // All views below the top should be untouched
    for (let i = 0; i < STACK_DEPTH - 1; i++) {
      expect(result.current.state.stack[i]).toEqual(views[i])
    }
    expect(result.current.state.stack[STACK_DEPTH - 1]).toEqual(replacement)
  })
})

describe('analytics tracking across complex flows', () => {
  it('emitDrillDownOpened is called each time open is invoked', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => { result.current.open(makeView({ type: 'cluster' })) })
    act(() => { result.current.open(makeView({ type: 'namespace', data: { cluster: 'a', namespace: 'ns' } })) })
    act(() => { result.current.open(makeView({ type: 'pod', data: { cluster: 'a', namespace: 'ns', pod: 'p' } })) })

    const EXPECTED_CALLS = 3
    expect(emitDrillDownOpened).toHaveBeenCalledTimes(EXPECTED_CALLS)
    expect(emitDrillDownOpened).toHaveBeenNthCalledWith(1, 'cluster')
    expect(emitDrillDownOpened).toHaveBeenNthCalledWith(2, 'namespace')
    expect(emitDrillDownOpened).toHaveBeenNthCalledWith(EXPECTED_CALLS, 'pod')
  })

  it('close after replace emits the replaced view type, not the original', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const original = makeView({ type: 'cluster', title: 'c1' })
    const replacement = makeView({ type: 'deployment', title: 'dep', data: { cluster: 'a', namespace: 'ns', deployment: 'dep' } })

    act(() => { result.current.open(original) })
    act(() => { result.current.replace(replacement) })
    act(() => { result.current.close() })

    expect(emitDrillDownClosed).toHaveBeenCalledWith('deployment', 1)
  })

  it('close after deep navigation records the correct final depth', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const DEPTH = 6

    act(() => { result.current.open(makeView({ type: 'cluster', title: 'c1' })) })
    for (let i = 1; i < DEPTH; i++) {
      act(() => {
        result.current.push(
          makeView({ type: 'namespace', title: `ns-${i}`, data: { cluster: 'a', namespace: `ns-${i}` } }),
        )
      })
    }
    act(() => { result.current.close() })

    expect(emitDrillDownClosed).toHaveBeenCalledWith('namespace', DEPTH)
  })

  it('close is idempotent - second close does not emit analytics again', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => { result.current.open(makeView({ type: 'cluster' })) })
    act(() => { result.current.close() })
    act(() => { result.current.close() })

    expect(emitDrillDownClosed).toHaveBeenCalledTimes(1)
  })
})

describe('breadcrumb navigation (goTo)', () => {
  it('goTo on empty stack is a no-op', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => { result.current.goTo(0) })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toEqual([])
    expect(result.current.state.currentView).toBeNull()
  })

  it('simulates breadcrumb clicks: forward then back to each level', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const cluster = makeView({ type: 'cluster', title: 'cluster-1' })
    const ns = makeView({ type: 'namespace', title: 'ns', data: { cluster: 'a', namespace: 'ns' } })
    const dep = makeView({ type: 'deployment', title: 'dep', data: { cluster: 'a', namespace: 'ns', deployment: 'dep' } })
    const pod = makeView({ type: 'pod', title: 'pod', data: { cluster: 'a', namespace: 'ns', pod: 'pod' } })

    act(() => { result.current.open(cluster) })
    act(() => { result.current.push(ns) })
    act(() => { result.current.push(dep) })
    act(() => { result.current.push(pod) })

    // Click breadcrumb for namespace (index 1)
    act(() => { result.current.goTo(1) })
    expect(result.current.state.currentView).toEqual(ns)
    expect(result.current.state.stack).toHaveLength(2)

    // Push new deployment from namespace level
    const dep2 = makeView({ type: 'deployment', title: 'dep2', data: { cluster: 'a', namespace: 'ns', deployment: 'dep2' } })
    act(() => { result.current.push(dep2) })
    expect(result.current.state.stack).toHaveLength(3)
    expect(result.current.state.currentView).toEqual(dep2)

    // Click breadcrumb for cluster (index 0)
    act(() => { result.current.goTo(0) })
    expect(result.current.state.currentView).toEqual(cluster)
    expect(result.current.state.stack).toHaveLength(1)
  })

  it('pop after goTo(0) closes the drill-down', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const v1 = makeView({ type: 'cluster', title: 'c1' })
    const v2 = makeView({ type: 'namespace', title: 'ns1', data: { cluster: 'a', namespace: 'ns1' } })

    act(() => { result.current.open(v1) })
    act(() => { result.current.push(v2) })
    act(() => { result.current.goTo(0) })
    act(() => { result.current.pop() })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toEqual([])
    expect(result.current.state.currentView).toBeNull()
  })
})

describe('state cleanup on close', () => {
  it('completely resets state even after deeply nested navigation', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const DEPTH = 10

    act(() => { result.current.open(makeView({ type: 'cluster', title: 'root' })) })
    for (let i = 1; i < DEPTH; i++) {
      act(() => {
        result.current.push(
          makeView({ type: 'namespace', title: `ns-${i}`, data: { cluster: 'a', namespace: `ns-${i}` } }),
        )
      })
    }

    act(() => { result.current.close() })

    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toHaveLength(0)
    expect(result.current.state.currentView).toBeNull()
  })

  it('state is clean for re-use after close — no leftover views', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const v1 = makeView({ type: 'cluster', title: 'c1' })
    const v2 = makeView({ type: 'namespace', title: 'ns1', data: { cluster: 'a', namespace: 'ns1' } })

    // First session
    act(() => { result.current.open(v1) })
    act(() => { result.current.push(v2) })
    act(() => { result.current.close() })

    // Second session with a different view
    const v3 = makeView({ type: 'pod', title: 'pod-1', data: { cluster: 'b', namespace: 'ns2', pod: 'pod-1' } })
    act(() => { result.current.open(v3) })

    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.stack[0]).toEqual(v3)
    expect(result.current.state.currentView).toEqual(v3)
    // No trace of previous session
    expect(result.current.state.stack).not.toContainEqual(v1)
    expect(result.current.state.stack).not.toContainEqual(v2)
  })
})

describe('customComponent propagation', () => {
  it('customComponent is preserved through open', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const customEl = React.createElement('div', null, 'custom')
    const view = makeView({ type: 'custom', title: 'Custom View', customComponent: customEl })

    act(() => { result.current.open(view) })

    expect(result.current.state.currentView?.customComponent).toBe(customEl)
  })

  it('customComponent is preserved through push', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const customEl = React.createElement('span', null, 'pushed-custom')
    const base = makeView({ type: 'cluster', title: 'c1' })
    const customView = makeView({ type: 'custom', title: 'Custom', customComponent: customEl })

    act(() => { result.current.open(base) })
    act(() => { result.current.push(customView) })

    expect(result.current.state.currentView?.customComponent).toBe(customEl)
    expect(result.current.state.stack[1].customComponent).toBe(customEl)
  })
})

describe('push then replace then pop interplay', () => {
  it('maintains correct state through push -> replace -> pop sequence', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })
    const cluster = makeView({ type: 'cluster', title: 'c1' })
    const ns = makeView({ type: 'namespace', title: 'ns1', data: { cluster: 'a', namespace: 'ns1' } })
    const nsReplaced = makeView({ type: 'namespace', title: 'ns-replaced', data: { cluster: 'a', namespace: 'ns-replaced' } })

    act(() => { result.current.open(cluster) })
    act(() => { result.current.push(ns) })
    act(() => { result.current.replace(nsReplaced) })

    // After replace, stack should be [cluster, nsReplaced]
    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.currentView).toEqual(nsReplaced)

    // Pop should go back to cluster
    act(() => { result.current.pop() })
    expect(result.current.state.currentView).toEqual(cluster)
    expect(result.current.state.stack).toHaveLength(1)
  })
})

describe('openOrPush deduplication for non-cluster types', () => {
  const actionsWrapper = ({ children }: { children: React.ReactNode }) => (
    <DrillDownProvider>{children}</DrillDownProvider>
  )
  function renderBothHooks() {
    const { result } = renderHook(
      () => ({
        drillDown: useDrillDown(),
        actions: useDrillDownActions(),
      }),
      { wrapper: actionsWrapper },
    )
    return result
  }

  it('navigates to existing namespace instead of pushing duplicate', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCluster('ctx/prod') })
    act(() => { result.current.actions.drillToNamespace('ctx/prod', 'default') })
    act(() => { result.current.actions.drillToPod('ctx/prod', 'default', 'pod-1') })
    // Drill to same namespace again — should navigate back
    act(() => { result.current.actions.drillToNamespace('ctx/prod', 'default') })

    expect(result.current.drillDown.state.stack).toHaveLength(2)
    expect(result.current.drillDown.state.currentView?.type).toBe('namespace')
    expect(result.current.drillDown.state.currentView?.data.namespace).toBe('default')
  })

  it('navigates to existing pod instead of pushing duplicate', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCluster('ctx/prod') })
    act(() => { result.current.actions.drillToPod('ctx/prod', 'ns', 'pod-1') })
    act(() => { result.current.actions.drillToLogs('ctx/prod', 'ns', 'pod-1', 'nginx') })
    // Drill back to same pod — should navigate, not push
    act(() => { result.current.actions.drillToPod('ctx/prod', 'ns', 'pod-1') })

    expect(result.current.drillDown.state.stack).toHaveLength(2)
    expect(result.current.drillDown.state.currentView?.type).toBe('pod')
  })

  it('pushes a different pod of the same type (no false dedup)', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCluster('ctx/prod') })
    act(() => { result.current.actions.drillToPod('ctx/prod', 'ns', 'pod-1') })
    // Different pod — should push, not navigate
    act(() => { result.current.actions.drillToPod('ctx/prod', 'ns', 'pod-2') })

    const EXPECTED_STACK_SIZE = 3
    expect(result.current.drillDown.state.stack).toHaveLength(EXPECTED_STACK_SIZE)
    expect(result.current.drillDown.state.currentView?.data.pod).toBe('pod-2')
  })
})

describe('cluster title extraction from context path', () => {
  const actionsWrapper = ({ children }: { children: React.ReactNode }) => (
    <DrillDownProvider>{children}</DrillDownProvider>
  )
  function renderBothHooks() {
    const { result } = renderHook(
      () => ({
        drillDown: useDrillDown(),
        actions: useDrillDownActions(),
      }),
      { wrapper: actionsWrapper },
    )
    return result
  }

  it('extracts cluster name after last slash for title', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCluster('some/deep/path/my-cluster') })

    expect(result.current.drillDown.state.currentView?.title).toBe('my-cluster')
  })

  it('uses full string when no slash is present', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCluster('standalone-cluster') })

    expect(result.current.drillDown.state.currentView?.title).toBe('standalone-cluster')
  })

  it('node subtitle extracts cluster name after slash', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToNode('ctx/prod-cluster', 'worker-1') })

    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Node in prod-cluster')
  })
})

describe('untested Phase 2 actions', () => {
  const actionsWrapper = ({ children }: { children: React.ReactNode }) => (
    <DrillDownProvider>{children}</DrillDownProvider>
  )
  function renderBothHooks() {
    const { result } = renderHook(
      () => ({
        drillDown: useDrillDown(),
        actions: useDrillDownActions(),
      }),
      { wrapper: actionsWrapper },
    )
    return result
  }

  it('drillToKustomization opens a kustomization view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToKustomization('ctx/prod', 'flux-system', 'my-kustomization') })

    expect(result.current.drillDown.state.currentView?.type).toBe('kustomization')
    expect(result.current.drillDown.state.currentView?.data.name).toBe('my-kustomization')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Kustomization in flux-system')
  })

  it('drillToBuildpack opens a buildpack view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToBuildpack('ctx/prod', 'default', 'my-buildpack') })

    expect(result.current.drillDown.state.currentView?.type).toBe('buildpack')
    expect(result.current.drillDown.state.currentView?.data.name).toBe('my-buildpack')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Buildpack in default')
  })

  it('drillToDrift opens a drift view with cluster name in subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToDrift('ctx/prod-cluster', { driftCount: 5 }) })

    expect(result.current.drillDown.state.currentView?.type).toBe('drift')
    expect(result.current.drillDown.state.currentView?.title).toBe('Configuration Drift')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('prod-cluster')
    expect(result.current.drillDown.state.currentView?.data.driftCount).toBe(5)
  })

  it('drillToCompliance without filter uses default title', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCompliance() })

    expect(result.current.drillDown.state.currentView?.type).toBe('compliance')
    expect(result.current.drillDown.state.currentView?.title).toBe('OSCAL Compliance Controls')
  })

  it('drillToCompliance normalizes dashboard status aliases', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCompliance('failing', { category: 'access' }) })

    expect(result.current.drillDown.state.currentView?.title).toBe('Failing Controls')
    expect(result.current.drillDown.state.currentView?.data.filterStatus).toBe('fail')
    expect(result.current.drillDown.state.currentView?.data.category).toBe('access')
  })

  it('drillToAlert with namespace includes it in subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAlert('ctx/prod', 'monitoring', 'HighCPU') })

    expect(result.current.drillDown.state.currentView?.type).toBe('alert')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Alert in monitoring')
  })

  it('drillToAlert without namespace uses "Cluster Alert" subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAlert('ctx/prod', undefined, 'NodeDown') })

    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Cluster Alert')
  })

  it('drillToAlertRule opens an alertrule view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAlertRule('ctx/prod', 'monitoring', 'CPUThrottle') })

    expect(result.current.drillDown.state.currentView?.type).toBe('alertrule')
    expect(result.current.drillDown.state.currentView?.data.ruleName).toBe('CPUThrottle')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Alert Rule in monitoring')
  })

  it('drillToCost opens a cost view with cluster name in subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCost('ctx/prod-cluster') })

    expect(result.current.drillDown.state.currentView?.type).toBe('cost')
    expect(result.current.drillDown.state.currentView?.title).toBe('Cost Analysis')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('prod-cluster')
  })

  it('drillToRBAC with namespace includes it in subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToRBAC('ctx/prod', 'default', 'admin-user') })

    expect(result.current.drillDown.state.currentView?.type).toBe('rbac')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('RBAC in default')
    expect(result.current.drillDown.state.currentView?.data.subject).toBe('admin-user')
  })

  it('drillToRBAC without namespace uses "Cluster RBAC" subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToRBAC('ctx/prod', undefined, 'system:admin') })

    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Cluster RBAC')
  })

  it('drillToPolicy without namespace uses "Cluster Policy" subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToPolicy('ctx/prod', undefined, 'restrict-root') })

    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Cluster Policy')
  })
})

describe('untested multi-cluster summary actions', () => {
  const actionsWrapper = ({ children }: { children: React.ReactNode }) => (
    <DrillDownProvider>{children}</DrillDownProvider>
  )
  function renderBothHooks() {
    const { result } = renderHook(
      () => ({
        drillDown: useDrillDown(),
        actions: useDrillDownActions(),
      }),
      { wrapper: actionsWrapper },
    )
    return result
  }

  it('drillToAllServices opens multi-cluster services view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllServices('loadbalancer') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-services')
    expect(result.current.drillDown.state.currentView?.title).toBe('Loadbalancer Services')
  })

  it('drillToAllNamespaces with no filter uses default title', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllNamespaces() })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-namespaces')
    expect(result.current.drillDown.state.currentView?.title).toBe('All Namespaces')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Across all clusters')
  })

  it('drillToAllAlerts passes filterData through to view data', () => {
    const result = renderBothHooks()
    const filterData = { severity: 'critical', source: 'prometheus' }

    act(() => { result.current.actions.drillToAllAlerts('critical', filterData) })

    expect(result.current.drillDown.state.currentView?.title).toBe('Critical Alerts')
    expect(result.current.drillDown.state.currentView?.data.severity).toBe('critical')
    expect(result.current.drillDown.state.currentView?.data.source).toBe('prometheus')
  })

  it('drillToAllHelm opens multi-cluster helm view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllHelm('outdated') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-helm')
    expect(result.current.drillDown.state.currentView?.title).toBe('Outdated Helm Releases')
  })

  it('drillToAllOperators opens multi-cluster operators view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllOperators() })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-operators')
    expect(result.current.drillDown.state.currentView?.title).toBe('All Operators')
  })

  it('drillToAllSecurity opens multi-cluster security view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllSecurity('high') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-security')
    expect(result.current.drillDown.state.currentView?.title).toBe('High Security Issues')
  })

  it('drillToAllGPU opens multi-cluster GPU view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllGPU() })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-gpu')
    expect(result.current.drillDown.state.currentView?.title).toBe('All GPUs')
  })

  it('drillToAllStorage opens multi-cluster storage view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllStorage('warning') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-storage')
    expect(result.current.drillDown.state.currentView?.title).toBe('Warning Storage')
  })

  it('drillToAllJobs opens multi-cluster jobs view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllJobs('failed') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-jobs')
    expect(result.current.drillDown.state.currentView?.title).toBe('Failed Jobs')
  })
})
