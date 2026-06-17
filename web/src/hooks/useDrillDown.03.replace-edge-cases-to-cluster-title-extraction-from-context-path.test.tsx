/* eslint-disable @typescript-eslint/no-unused-vars */
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

