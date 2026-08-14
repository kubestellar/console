import React from 'react'
/**
 * Unit tests for useResizeHandle (addresses #22484 — card coverage gap).
 *
 * useResizeHandle is the shared hook used by expanded cards to track their
 * container size via ResizeObserver. It:
 *   - resets containerSize to {0,0} when not expanded
 *   - observes the ref target while expanded
 *   - rounds the observed dimensions (Math.round)
 *   - preserves referential identity when width/height haven't changed
 *   - disconnects the observer on cleanup (unmount or isExpanded flip)
 *
 * The global ResizeObserver stub in src/test/setup.ts is inert (no way to
 * fire a callback), so this test file installs its own controllable stub
 * that captures the callback + observe/disconnect calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, renderHook, act } from '@testing-library/react'
import { useResizeHandle } from '../ResizeHandle'

// A controllable ResizeObserver stub. Each `new ResizeObserver(cb)` gets
// tracked so tests can (a) fire entries into the captured callback and
// (b) assert observe/disconnect were called.
interface FakeObserver {
  callback: ResizeObserverCallback
  observe: ReturnType<typeof vi.fn>
  unobserve: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  observedTargets: Element[]
}

let observers: FakeObserver[] = []
const originalRO = globalThis.ResizeObserver

beforeEach(() => {
  observers = []
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    class MockRO {
      private _fake: FakeObserver
      constructor(cb: ResizeObserverCallback) {
        const observedTargets: Element[] = []
        const observe = vi.fn((el: Element) => { observedTargets.push(el) })
        const unobserve = vi.fn()
        const disconnect = vi.fn()
        this._fake = { callback: cb, observe, unobserve, disconnect, observedTargets }
        observers.push(this._fake)
      }
      observe(el: Element) { this._fake.observe(el) }
      unobserve(el: Element) { this._fake.unobserve(el) }
      disconnect() { this._fake.disconnect() }
    } as unknown as typeof ResizeObserver
})

afterEach(() => {
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    originalRO
})

function makeEntry(width: number, height: number): ResizeObserverEntry {
  return {
    contentRect: { width, height } as DOMRectReadOnly,
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
    target: document.createElement('div'),
  } as unknown as ResizeObserverEntry
}

/**
 * Helper that renders a real <div> component with the hook's ref attached
 * via JSX so React populates ref.current BEFORE the hook's useEffect runs.
 * Returns a rerender/unmount facade plus a getter for the current hook
 * state, matching the useResizeHandle contract.
 */
function renderResizeHandleAttached(initialExpanded: boolean) {
  let latest: ReturnType<typeof useResizeHandle> | null = null
  function Probe({ expanded }: { expanded: boolean }) {
    const h = useResizeHandle(expanded)
    latest = h
    return <div ref={h.expandedContentRef} data-testid="probe-target" />
  }
  const view = render(<Probe expanded={initialExpanded} />)
  const el = view.getByTestId('probe-target') as HTMLDivElement
  return {
    hook: {
      get result() { return { current: latest as NonNullable<typeof latest> } },
      rerender: ({ expanded }: { expanded: boolean }) =>
        view.rerender(<Probe expanded={expanded} />),
      unmount: () => view.unmount(),
    },
    el,
  }
}

describe('useResizeHandle', () => {
  it('starts with containerSize {0,0} regardless of isExpanded', () => {
    const { result } = renderHook(({ e }: { e: boolean }) => useResizeHandle(e), {
      initialProps: { e: false },
    })
    expect(result.current.containerSize).toEqual({ width: 0, height: 0 })
    expect(result.current.expandedContentRef.current).toBeNull()
  })

  it('does not create a ResizeObserver while collapsed', () => {
    renderHook(({ e }: { e: boolean }) => useResizeHandle(e), {
      initialProps: { e: false },
    })
    expect(observers.length).toBe(0)
  })

  it('does not create a ResizeObserver when expanded but the ref is null', () => {
    // No wrapper attaches to ref → hook's `if (!el) return` should fire.
    renderHook(({ e }: { e: boolean }) => useResizeHandle(e), {
      initialProps: { e: true },
    })
    expect(observers.length).toBe(0)
  })

  it('creates + observes when isExpanded flips true with a ref target', () => {
    const { hook, el } = renderResizeHandleAttached(false)
    expect(observers.length).toBe(0)
    hook.rerender({ expanded: true })
    expect(observers.length).toBe(1)
    expect(observers[0].observedTargets).toEqual([el])
    expect(observers[0].observe).toHaveBeenCalledTimes(1)
  })

  it('rounds observed dimensions with Math.round', () => {
    const { hook } = renderResizeHandleAttached(true)
    expect(observers.length).toBe(1)
    act(() => {
      observers[0].callback([makeEntry(101.4, 200.6)], observers[0] as unknown as ResizeObserver)
    })
    expect(hook.result.current.containerSize).toEqual({ width: 101, height: 201 })
  })

  it('preserves referential identity when width+height are unchanged', () => {
    const { hook } = renderResizeHandleAttached(true)
    act(() => {
      observers[0].callback([makeEntry(120, 80)], observers[0] as unknown as ResizeObserver)
    })
    const first = hook.result.current.containerSize
    expect(first).toEqual({ width: 120, height: 80 })
    act(() => {
      // Same rounded dimensions → setter should short-circuit.
      observers[0].callback([makeEntry(120.2, 80.4)], observers[0] as unknown as ResizeObserver)
    })
    expect(hook.result.current.containerSize).toBe(first)
  })

  it('updates when either width or height changes', () => {
    const { hook } = renderResizeHandleAttached(true)
    act(() => {
      observers[0].callback([makeEntry(120, 80)], observers[0] as unknown as ResizeObserver)
    })
    const first = hook.result.current.containerSize
    act(() => {
      observers[0].callback([makeEntry(120, 81)], observers[0] as unknown as ResizeObserver)
    })
    expect(hook.result.current.containerSize).not.toBe(first)
    expect(hook.result.current.containerSize).toEqual({ width: 120, height: 81 })
  })

  it('disconnects and resets containerSize when isExpanded flips back to false', () => {
    const { hook } = renderResizeHandleAttached(true)
    act(() => {
      observers[0].callback([makeEntry(200, 150)], observers[0] as unknown as ResizeObserver)
    })
    expect(hook.result.current.containerSize).toEqual({ width: 200, height: 150 })

    hook.rerender({ expanded: false })
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    expect(hook.result.current.containerSize).toEqual({ width: 0, height: 0 })
  })

  it('disconnects the observer on unmount', () => {
    const { hook } = renderResizeHandleAttached(true)
    expect(observers.length).toBe(1)
    hook.unmount()
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('applies the last entry when the callback receives a batch', () => {
    // Real ResizeObserver batches entries; the hook loops through all of them.
    // The last entry wins because it overwrites containerSize.
    const { hook } = renderResizeHandleAttached(true)
    act(() => {
      observers[0].callback(
        [makeEntry(10, 10), makeEntry(20, 20), makeEntry(30, 30)],
        observers[0] as unknown as ResizeObserver,
      )
    })
    expect(hook.result.current.containerSize).toEqual({ width: 30, height: 30 })
  })
})

describe('useResizeHandle integrated with a real DOM component', () => {
  it('exposes a ref that can be attached to a <div> via JSX', () => {
    function Probe() {
      const { expandedContentRef, containerSize } = useResizeHandle(true)
      return (
        <div
          ref={expandedContentRef}
          data-testid="target"
          data-size={`${containerSize.width}x${containerSize.height}`}
        />
      )
    }
    const { getByTestId } = render(<Probe />)
    const el = getByTestId('target')
    expect(el.getAttribute('data-size')).toBe('0x0')
    // The hook should have observed the mounted element.
    expect(observers.length).toBe(1)
    expect(observers[0].observedTargets[0]).toBe(el)
  })
})
