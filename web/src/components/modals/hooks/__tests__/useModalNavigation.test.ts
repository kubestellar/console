/**
 * useModalNavigation / useFocusTrap — keyboard + focus behavior for modals.
 *
 * Covers:
 *   - ESC → onClose (always, even from inputs)
 *   - Backspace → onBack when provided, otherwise onClose
 *   - Other keys are ignored / do not preventDefault
 *   - Backspace is suppressed while typing in INPUT/TEXTAREA/contentEditable
 *   - handleBackdropClick fires onClose only when clicking the backdrop itself
 *   - handleContentClick stops propagation
 *   - keydown listener is attached only when open and enableKeyboard != false
 *   - listener is removed on unmount / when closed
 *   - body scroll is locked/restored when open
 *   - useFocusTrap moves focus to first element and cycles Tab / Shift+Tab
 *   - KEYBOARD_HINTS constant shape
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useModalNavigation,
  useFocusTrap,
  KEYBOARD_HINTS,
} from '../useModalNavigation'

function makeKeyEvent(key: string, target: EventTarget | null = document.body): KeyboardEvent {
  const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  if (target) Object.defineProperty(evt, 'target', { value: target, configurable: true })
  return evt
}

function makeMouseEvent(target: EventTarget, currentTarget: EventTarget) {
  const stopPropagation = vi.fn()
  return {
    target,
    currentTarget,
    stopPropagation,
  } as unknown as React.MouseEvent
}

describe('useModalNavigation.handleKeyDown', () => {
  let onClose: ReturnType<typeof vi.fn>
  let onBack: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
    onBack = vi.fn()
  })

  it('ESC calls onClose and preventDefault + stopPropagation', () => {
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, onBack, isOpen: true }),
    )
    const evt = makeKeyEvent('Escape')
    const pd = vi.spyOn(evt, 'preventDefault')
    const sp = vi.spyOn(evt, 'stopPropagation')
    act(() => result.current.handleKeyDown(evt))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onBack).not.toHaveBeenCalled()
    expect(pd).toHaveBeenCalled()
    expect(sp).toHaveBeenCalled()
  })

  it('Backspace calls onBack when provided', () => {
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, onBack, isOpen: true }),
    )
    act(() => result.current.handleKeyDown(makeKeyEvent('Backspace')))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Backspace falls back to onClose when onBack is undefined', () => {
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, isOpen: true }),
    )
    act(() => result.current.handleKeyDown(makeKeyEvent('Backspace')))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores unrelated keys (does not preventDefault)', () => {
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, onBack, isOpen: true }),
    )
    const evt = makeKeyEvent('a')
    const pd = vi.spyOn(evt, 'preventDefault')
    act(() => result.current.handleKeyDown(evt))
    expect(onClose).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
    expect(pd).not.toHaveBeenCalled()
  })

  it('suppresses Backspace when typing in an INPUT', () => {
    const input = document.createElement('input')
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, onBack, isOpen: true }),
    )
    act(() => result.current.handleKeyDown(makeKeyEvent('Backspace', input)))
    expect(onBack).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('suppresses Backspace when typing in a TEXTAREA', () => {
    const ta = document.createElement('textarea')
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, onBack, isOpen: true }),
    )
    act(() => result.current.handleKeyDown(makeKeyEvent('Backspace', ta)))
    expect(onBack).not.toHaveBeenCalled()
  })

  it('suppresses Backspace when target is contentEditable', () => {
    const div = document.createElement('div')
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true })
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, onBack, isOpen: true }),
    )
    act(() => result.current.handleKeyDown(makeKeyEvent('Backspace', div)))
    expect(onBack).not.toHaveBeenCalled()
  })

  it('ESC still fires from inside an INPUT', () => {
    const input = document.createElement('input')
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, onBack, isOpen: true }),
    )
    act(() => result.current.handleKeyDown(makeKeyEvent('Escape', input)))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useModalNavigation.handleBackdropClick', () => {
  it('fires onClose only when click target === currentTarget', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, isOpen: true }),
    )
    const backdrop = document.createElement('div')
    result.current.handleBackdropClick(makeMouseEvent(backdrop, backdrop))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClose when click bubbled from a child', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, isOpen: true }),
    )
    const backdrop = document.createElement('div')
    const child = document.createElement('div')
    result.current.handleBackdropClick(makeMouseEvent(child, backdrop))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('useModalNavigation.handleContentClick', () => {
  it('stops propagation so the backdrop handler never runs', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useModalNavigation({ onClose, isOpen: true }),
    )
    const evt = makeMouseEvent(document.body, document.body)
    result.current.handleContentClick(evt)
    expect((evt.stopPropagation as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })
})

describe('useModalNavigation window keydown listener', () => {
  let addSpy: ReturnType<typeof vi.spyOn>
  let removeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener')
    removeSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('attaches keydown when open and detaches on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = renderHook(() =>
      useModalNavigation({ onClose, isOpen: true }),
    )
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('does not attach keydown when closed', () => {
    const onClose = vi.fn()
    renderHook(() => useModalNavigation({ onClose, isOpen: false }))
    expect(
      addSpy.mock.calls.some(([evt]) => evt === 'keydown'),
    ).toBe(false)
  })

  it('does not attach keydown when enableKeyboard is false', () => {
    const onClose = vi.fn()
    renderHook(() =>
      useModalNavigation({ onClose, isOpen: true, enableKeyboard: false }),
    )
    expect(
      addSpy.mock.calls.some(([evt]) => evt === 'keydown'),
    ).toBe(false)
  })
})

describe('useModalNavigation body scroll lock', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  it('locks body overflow when open and restores on unmount', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = renderHook(() =>
      useModalNavigation({ onClose: vi.fn(), isOpen: true }),
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('does not touch overflow when closed', () => {
    document.body.style.overflow = 'auto'
    renderHook(() => useModalNavigation({ onClose: vi.fn(), isOpen: false }))
    expect(document.body.style.overflow).toBe('auto')
  })
})

describe('useFocusTrap', () => {
  function setupContainer(buttonCount = 3) {
    const container = document.createElement('div')
    for (let i = 0; i < buttonCount; i++) {
      const btn = document.createElement('button')
      btn.textContent = `btn-${i}`
      container.appendChild(btn)
    }
    document.body.appendChild(container)
    return container
  }

  it('focuses the first focusable element when opened', () => {
    const container = setupContainer(3)
    const ref = { current: container } as React.RefObject<HTMLElement | null>
    renderHook(() => useFocusTrap(ref, true))
    expect(document.activeElement).toBe(container.querySelectorAll('button')[0])
  })

  it('wraps focus back to first element on Tab from the last', () => {
    const container = setupContainer(3)
    const ref = { current: container } as React.RefObject<HTMLElement | null>
    renderHook(() => useFocusTrap(ref, true))
    const buttons = container.querySelectorAll<HTMLButtonElement>('button')
    const last = buttons[buttons.length - 1]!
    last.focus()
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    const pd = vi.spyOn(evt, 'preventDefault')
    container.dispatchEvent(evt)
    expect(pd).toHaveBeenCalled()
    expect(document.activeElement).toBe(buttons[0])
  })

  it('wraps focus back to last element on Shift+Tab from the first', () => {
    const container = setupContainer(3)
    const ref = { current: container } as React.RefObject<HTMLElement | null>
    renderHook(() => useFocusTrap(ref, true))
    const buttons = container.querySelectorAll<HTMLButtonElement>('button')
    buttons[0]!.focus()
    const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    const pd = vi.spyOn(evt, 'preventDefault')
    container.dispatchEvent(evt)
    expect(pd).toHaveBeenCalled()
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
  })

  it('does not preventDefault mid-cycle Tab (non-boundary focus)', () => {
    const container = setupContainer(3)
    const ref = { current: container } as React.RefObject<HTMLElement | null>
    renderHook(() => useFocusTrap(ref, true))
    const buttons = container.querySelectorAll<HTMLButtonElement>('button')
    buttons[1]!.focus()
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    const pd = vi.spyOn(evt, 'preventDefault')
    container.dispatchEvent(evt)
    expect(pd).not.toHaveBeenCalled()
  })

  it('ignores non-Tab keys', () => {
    const container = setupContainer(3)
    const ref = { current: container } as React.RefObject<HTMLElement | null>
    renderHook(() => useFocusTrap(ref, true))
    const buttons = container.querySelectorAll<HTMLButtonElement>('button')
    const first = buttons[0]!
    first.focus()
    const evt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    const pd = vi.spyOn(evt, 'preventDefault')
    container.dispatchEvent(evt)
    expect(pd).not.toHaveBeenCalled()
  })

  it('no-ops when container has no focusable elements', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const ref = { current: container } as React.RefObject<HTMLElement | null>
    // Should not throw
    expect(() =>
      renderHook(() => useFocusTrap(ref, true)),
    ).not.toThrow()
  })

  it('no-ops when isOpen is false', () => {
    const container = setupContainer(3)
    const ref = { current: container } as React.RefObject<HTMLElement | null>
    // Focus something outside so we can detect no auto-focus happened.
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    renderHook(() => useFocusTrap(ref, false))
    expect(document.activeElement).toBe(outside)
  })
})

describe('KEYBOARD_HINTS constant', () => {
  it('exposes the four known modal hints with key + label', () => {
    for (const hint of Object.values(KEYBOARD_HINTS)) {
      expect(hint.key).toBeTruthy()
      expect(hint.label).toBeTruthy()
    }
    expect(KEYBOARD_HINTS.close.key).toBe('ESC')
    expect(KEYBOARD_HINTS.back.label).toBe('Back')
    expect(KEYBOARD_HINTS.navigate.label).toBe('Navigate')
    expect(KEYBOARD_HINTS.select.key).toBe('↵')
  })
})
