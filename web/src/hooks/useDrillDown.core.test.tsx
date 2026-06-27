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