/**
 * Tests for useDropdownKeyNav hook.
 *
 * Validates keyboard navigation behaviour: ArrowDown/ArrowUp move focus
 * through focusable items, Escape fires the onClose callback, and
 * unrecognised keys are ignored.
 *
 * Run: npx vitest run src/hooks/__tests__/useDropdownKeyNav.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDropdownKeyNav } from '../useDropdownKeyNav'

// ── Constants ─────────────────────────────────────────────────────────────────

const THREE_ITEMS = 3
const TWO_ITEMS = 2

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal React.KeyboardEvent stand-in — matches the pattern in useCardGridNavigation.test.ts */
function fakeKeyEvent(key: string, currentTarget: HTMLElement, preventDefault = vi.fn()) {
  return {
    key,
    currentTarget,
    preventDefault,
  } as unknown as React.KeyboardEvent<HTMLElement>
}

/**
 * Create a dropdown container with `count` <button> items appended to
 * document.body so JSDOM's focus tracking works correctly.
 */
function createDropdown(count: number) {
  const container = document.createElement('div')
  const items: HTMLButtonElement[] = []
  for (let i = 0; i < count; i++) {
    const btn = document.createElement('button')
    btn.textContent = `Item ${i}`
    container.appendChild(btn)
    items.push(btn)
  }
  document.body.appendChild(container)
  return { container, items }
}

afterEach(() => {
  document.body.innerHTML = ''
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDropdownKeyNav', () => {
  it('returns a function', () => {
    const { result } = renderHook(() => useDropdownKeyNav())
    expect(typeof result.current).toBe('function')
  })

  // ── ArrowDown ──────────────────────────────────────────────────────────────

  describe('ArrowDown', () => {
    it('moves focus to the next item', () => {
      const { container, items } = createDropdown(THREE_ITEMS)
      items[0].focus()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('ArrowDown', container))

      expect(document.activeElement).toBe(items[1])
    })

    it('stays on the last item when already at the end', () => {
      const { container, items } = createDropdown(THREE_ITEMS)
      items[THREE_ITEMS - 1].focus()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('ArrowDown', container))

      expect(document.activeElement).toBe(items[THREE_ITEMS - 1])
    })

    it('calls preventDefault', () => {
      const { container, items } = createDropdown(TWO_ITEMS)
      items[0].focus()
      const preventDefault = vi.fn()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('ArrowDown', container, preventDefault))

      expect(preventDefault).toHaveBeenCalledOnce()
    })
  })

  // ── ArrowUp ────────────────────────────────────────────────────────────────

  describe('ArrowUp', () => {
    it('moves focus to the previous item', () => {
      const { container, items } = createDropdown(THREE_ITEMS)
      items[1].focus()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('ArrowUp', container))

      expect(document.activeElement).toBe(items[0])
    })

    it('stays on the first item when already at the start', () => {
      const { container, items } = createDropdown(THREE_ITEMS)
      items[0].focus()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('ArrowUp', container))

      expect(document.activeElement).toBe(items[0])
    })

    it('calls preventDefault', () => {
      const { container, items } = createDropdown(TWO_ITEMS)
      items[1].focus()
      const preventDefault = vi.fn()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('ArrowUp', container, preventDefault))

      expect(preventDefault).toHaveBeenCalledOnce()
    })
  })

  // ── Escape ─────────────────────────────────────────────────────────────────

  describe('Escape', () => {
    it('calls onClose when provided', () => {
      const onClose = vi.fn()
      const { container } = createDropdown(TWO_ITEMS)

      const { result } = renderHook(() => useDropdownKeyNav(onClose))
      result.current(fakeKeyEvent('Escape', container))

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('calls preventDefault when onClose is provided', () => {
      const preventDefault = vi.fn()
      const { container } = createDropdown(TWO_ITEMS)

      const { result } = renderHook(() => useDropdownKeyNav(vi.fn()))
      result.current(fakeKeyEvent('Escape', container, preventDefault))

      expect(preventDefault).toHaveBeenCalledOnce()
    })

    it('does not throw when onClose is omitted', () => {
      const { container } = createDropdown(TWO_ITEMS)

      const { result } = renderHook(() => useDropdownKeyNav())
      expect(() => result.current(fakeKeyEvent('Escape', container))).not.toThrow()
    })

    it('does not call preventDefault when onClose is omitted', () => {
      const preventDefault = vi.fn()
      const { container } = createDropdown(TWO_ITEMS)

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('Escape', container, preventDefault))

      expect(preventDefault).not.toHaveBeenCalled()
    })
  })

  // ── Unhandled keys ─────────────────────────────────────────────────────────

  describe('unhandled keys', () => {
    it('does not call preventDefault for Enter', () => {
      const { container, items } = createDropdown(TWO_ITEMS)
      items[0].focus()
      const preventDefault = vi.fn()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('Enter', container, preventDefault))

      expect(preventDefault).not.toHaveBeenCalled()
    })

    it('does not change focus for unhandled keys', () => {
      const { container, items } = createDropdown(TWO_ITEMS)
      items[0].focus()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('Tab', container))

      expect(document.activeElement).toBe(items[0])
    })
  })

  // ── Callback stability (useCallback) ───────────────────────────────────────

  describe('callback stability', () => {
    it('returns the same handler reference across re-renders when onClose is unchanged', () => {
      const onClose = vi.fn()
      const { result, rerender } = renderHook(() => useDropdownKeyNav(onClose))
      const first = result.current
      rerender()
      expect(result.current).toBe(first)
    })

    it('returns a new handler when onClose changes', () => {
      const { result, rerender } = renderHook(
        ({ fn }: { fn: (() => void) | undefined }) => useDropdownKeyNav(fn),
        { initialProps: { fn: vi.fn() as (() => void) | undefined } },
      )
      const first = result.current
      rerender({ fn: vi.fn() })
      expect(result.current).not.toBe(first)
    })
  })

  // ── [role="option"] items ──────────────────────────────────────────────────

  describe('[role="option"] items', () => {
    it('navigates option elements in addition to buttons', () => {
      const container = document.createElement('div')
      const opt0 = document.createElement('div')
      opt0.setAttribute('role', 'option')
      opt0.setAttribute('tabindex', '0')
      const opt1 = document.createElement('div')
      opt1.setAttribute('role', 'option')
      opt1.setAttribute('tabindex', '0')
      container.appendChild(opt0)
      container.appendChild(opt1)
      document.body.appendChild(container)

      opt0.focus()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('ArrowDown', container))

      expect(document.activeElement).toBe(opt1)
    })
  })

  // ── Disabled buttons are excluded ──────────────────────────────────────────

  describe('disabled buttons', () => {
    it('skips disabled buttons when building the focusable item list', () => {
      const container = document.createElement('div')
      const enabled0 = document.createElement('button')
      enabled0.textContent = 'Enabled A'
      const disabled = document.createElement('button')
      disabled.textContent = 'Disabled'
      disabled.disabled = true
      const enabled1 = document.createElement('button')
      enabled1.textContent = 'Enabled B'
      container.appendChild(enabled0)
      container.appendChild(disabled)
      container.appendChild(enabled1)
      document.body.appendChild(container)

      enabled0.focus()

      const { result } = renderHook(() => useDropdownKeyNav())
      result.current(fakeKeyEvent('ArrowDown', container))

      // Should jump straight to enabled1, skipping the disabled button
      expect(document.activeElement).toBe(enabled1)
    })
  })
})
