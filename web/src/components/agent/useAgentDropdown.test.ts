import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAgentDropdown } from './useAgentDropdown'

const GAP = 4

function attachButton(rect: Partial<DOMRect>) {
  const btn = document.createElement('button')
  document.body.appendChild(btn)
  btn.getBoundingClientRect = () => ({
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON() { return {} },
    ...rect,
  } as DOMRect)
  return btn
}

describe('useAgentDropdown', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  describe('initial state', () => {
    it('starts closed with no position and null refs', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      expect(result.current.isOpen).toBe(false)
      expect(result.current.dropdownPos).toBeNull()
      expect(result.current.dropdownRef.current).toBeNull()
      expect(result.current.buttonRef.current).toBeNull()
      expect(result.current.panelRef.current).toBeNull()
    })

    it('exposes stable action callbacks', () => {
      const { result, rerender } = renderHook(() => useAgentDropdown(false))
      const t1 = result.current.toggleDropdown
      const c1 = result.current.closeDropdown
      rerender()
      expect(result.current.toggleDropdown).toBe(t1)
      expect(result.current.closeDropdown).toBe(c1)
    })
  })

  describe('toggle / close', () => {
    it('toggleDropdown flips isOpen', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      act(() => { result.current.toggleDropdown() })
      expect(result.current.isOpen).toBe(true)
      act(() => { result.current.toggleDropdown() })
      expect(result.current.isOpen).toBe(false)
    })

    it('closeDropdown always closes', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      act(() => { result.current.toggleDropdown() })
      act(() => { result.current.closeDropdown() })
      expect(result.current.isOpen).toBe(false)
    })
  })

  describe('demo mode', () => {
    it('demo mode closes an already-open dropdown on mount', () => {
      const { result } = renderHook(({ demo }) => useAgentDropdown(demo), {
        initialProps: { demo: true },
      })
      // dropdown starts closed; demo effect keeps it closed
      expect(result.current.isOpen).toBe(false)
    })

    it('flipping to demo mode closes an open dropdown', () => {
      const { result, rerender } = renderHook(({ demo }) => useAgentDropdown(demo), {
        initialProps: { demo: false },
      })
      act(() => { result.current.toggleDropdown() })
      expect(result.current.isOpen).toBe(true)
      rerender({ demo: true })
      expect(result.current.isOpen).toBe(false)
    })

    it('leaving demo mode does not auto-open', () => {
      const { result, rerender } = renderHook(({ demo }) => useAgentDropdown(demo), {
        initialProps: { demo: true },
      })
      rerender({ demo: false })
      expect(result.current.isOpen).toBe(false)
    })
  })

  describe('click outside', () => {
    it('closes when a mousedown fires outside the dropdown and panel', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      const dd = document.createElement('div')
      document.body.appendChild(dd)
      act(() => {
        // wire the ref (renderHook re-runs on state change so re-check ref inside act)
        ;(result.current.dropdownRef as { current: HTMLElement | null }).current = dd
        result.current.toggleDropdown()
      })
      expect(result.current.isOpen).toBe(true)

      const outside = document.createElement('div')
      document.body.appendChild(outside)
      act(() => {
        outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })
      expect(result.current.isOpen).toBe(false)
    })

    it('does NOT close when mousedown is inside the dropdown', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      const dd = document.createElement('div')
      const inside = document.createElement('span')
      dd.appendChild(inside)
      document.body.appendChild(dd)
      act(() => {
        ;(result.current.dropdownRef as { current: HTMLElement | null }).current = dd
        result.current.toggleDropdown()
      })
      act(() => {
        inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })
      expect(result.current.isOpen).toBe(true)
    })

    it('does NOT close when mousedown is inside the panel (even if outside dropdown)', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      const dd = document.createElement('div')
      const panel = document.createElement('div')
      const inside = document.createElement('span')
      panel.appendChild(inside)
      document.body.appendChild(dd)
      document.body.appendChild(panel)
      act(() => {
        ;(result.current.dropdownRef as { current: HTMLElement | null }).current = dd
        ;(result.current.panelRef as { current: HTMLElement | null }).current = panel
        result.current.toggleDropdown()
      })
      act(() => {
        inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })
      expect(result.current.isOpen).toBe(true)
    })

    it('removes the mousedown listener on unmount', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener')
      const { unmount } = renderHook(() => useAgentDropdown(false))
      unmount()
      expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
    })
  })

  describe('escape key', () => {
    it('closes on Escape while open', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      act(() => { result.current.toggleDropdown() })
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      })
      expect(result.current.isOpen).toBe(false)
    })

    it('ignores other keys', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      act(() => { result.current.toggleDropdown() })
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      })
      expect(result.current.isOpen).toBe(true)
    })

    it('Escape while closed is a no-op (listener not attached)', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      })
      expect(result.current.isOpen).toBe(false)
    })
  })

  describe('dropdownPos', () => {
    it('is set to { top: rect.bottom+GAP, right: innerWidth-rect.right } when opening', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      const btn = attachButton({ bottom: 100, right: 800 })
      act(() => {
        ;(result.current.buttonRef as { current: HTMLElement | null }).current = btn
        result.current.toggleDropdown()
      })
      expect(result.current.dropdownPos).toEqual({ top: 100 + GAP, right: 1200 - 800 })
    })

    it('recomputes on window resize', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      const btn = attachButton({ bottom: 100, right: 800 })
      act(() => {
        ;(result.current.buttonRef as { current: HTMLElement | null }).current = btn
        result.current.toggleDropdown()
      })
      btn.getBoundingClientRect = () => ({
        top: 0, left: 0, right: 900, bottom: 150, width: 900, height: 150, x: 0, y: 0,
        toJSON() { return {} },
      } as DOMRect)
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 })
      act(() => { window.dispatchEvent(new Event('resize')) })
      expect(result.current.dropdownPos).toEqual({ top: 150 + GAP, right: 1400 - 900 })
    })

    it('recomputes on capture-phase scroll', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      const btn = attachButton({ bottom: 100, right: 800 })
      act(() => {
        ;(result.current.buttonRef as { current: HTMLElement | null }).current = btn
        result.current.toggleDropdown()
      })
      btn.getBoundingClientRect = () => ({
        top: 0, left: 0, right: 800, bottom: 80, width: 800, height: 80, x: 0, y: 0,
        toJSON() { return {} },
      } as DOMRect)
      act(() => { window.dispatchEvent(new Event('scroll')) })
      expect(result.current.dropdownPos?.top).toBe(80 + GAP)
    })

    it('is not computed when opening without a buttonRef', () => {
      const { result } = renderHook(() => useAgentDropdown(false))
      act(() => { result.current.toggleDropdown() })
      expect(result.current.dropdownPos).toBeNull()
    })
  })
})
