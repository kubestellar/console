import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEffect } from 'react'
import {
  useEscapeLayer,
  useModalNavigation,
  useModalBackdropClose,
  useModalState,
} from '../useModalNavigation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate a keyboard event on the window */
function fireKeyDown(key: string, options: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  })
  window.dispatchEvent(event)
  return event
}

/** Create an input element and attach it to the DOM */
function createInput(): HTMLInputElement {
  const input = document.createElement('input')
  document.body.appendChild(input)
  return input
}

/** Create a textarea and attach it to the DOM */
function createTextarea(): HTMLTextAreaElement {
  const textarea = document.createElement('textarea')
  document.body.appendChild(textarea)
  return textarea
}

/** Create a contentEditable div and attach it to the DOM */
function _createContentEditable(): HTMLDivElement {
  const div = document.createElement('div')
  div.contentEditable = 'true'
  document.body.appendChild(div)
  return div
}

function useOverlayEscape(isOpen: boolean, onClose: () => void) {
  const isTopEscapeLayer = useEscapeLayer(isOpen)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTopEscapeLayer()) return
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isTopEscapeLayer, onClose])
}

// ---------------------------------------------------------------------------
// useModalNavigation
// ---------------------------------------------------------------------------

describe('useModalNavigation', () => {
  let onClose: ReturnType<typeof vi.fn>
  let onBack: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
    onBack = vi.fn()
  })

  afterEach(() => {
    // Clean up any appended elements
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  // -------------------------------------------------------------------------
  // 1. Escape to close
  // -------------------------------------------------------------------------

  it('calls onClose when Escape is pressed and modal is open', () => {
    renderHook(() =>
      useModalNavigation({ isOpen: true, onClose, enableEscape: true })
    )

    fireKeyDown('Escape')
    expect(onClose).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // 2. Escape disabled
  // -------------------------------------------------------------------------

  it('does not call onClose when enableEscape is false', () => {
    renderHook(() =>
      useModalNavigation({ isOpen: true, onClose, enableEscape: false })
    )

    fireKeyDown('Escape')
    expect(onClose).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 3. No listener when modal is closed
  // -------------------------------------------------------------------------

  it('does not handle keys when modal is not open', () => {
    renderHook(() =>
      useModalNavigation({ isOpen: false, onClose, enableEscape: true })
    )

    fireKeyDown('Escape')
    expect(onClose).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 4. Backspace calls onBack
  // -------------------------------------------------------------------------

  it('calls onBack when Backspace is pressed', () => {
    renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        onBack,
        enableBackspace: true,
      })
    )

    fireKeyDown('Backspace')
    expect(onBack).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 5. Space calls onBack
  // -------------------------------------------------------------------------

  it('calls onBack when Space is pressed', () => {
    renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        onBack,
        enableBackspace: true,
      })
    )

    fireKeyDown(' ')
    expect(onBack).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // 6. Backspace falls back to onClose when no onBack
  // -------------------------------------------------------------------------

  it('calls onClose when Backspace is pressed without onBack handler', () => {
    renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        enableBackspace: true,
      })
    )

    fireKeyDown('Backspace')
    expect(onClose).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // 7. Backspace disabled
  // -------------------------------------------------------------------------

  it('does not call onBack when enableBackspace is false', () => {
    renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        onBack,
        enableBackspace: false,
      })
    )

    fireKeyDown('Backspace')
    expect(onBack).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 8. Ignore Backspace in input fields
  // -------------------------------------------------------------------------

  it('does not handle Backspace when target is an input element', () => {
    renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        onBack,
        enableBackspace: true,
      })
    )

    const input = createInput()
    input.focus()
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', { value: input })
    window.dispatchEvent(event)

    expect(onBack).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 9. Ignore Space in textarea
  // -------------------------------------------------------------------------

  it('does not handle Space when target is a textarea', () => {
    renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        onBack,
        enableBackspace: true,
      })
    )

    const textarea = createTextarea()
    textarea.focus()
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', { value: textarea })
    window.dispatchEvent(event)

    expect(onBack).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 10. Ignore Backspace in contentEditable
  // -------------------------------------------------------------------------

  it('does not handle Backspace when target is contentEditable', () => {
    const { result } = renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        onBack,
        enableBackspace: true,
      })
    )

    // jsdom does not implement isContentEditable on DOM elements, so we
    // create a real HTMLElement and patch isContentEditable onto it so
    // the source code's `instanceof HTMLElement && e.target.isContentEditable`
    // check passes correctly.
    const div = document.createElement('div')
    Object.defineProperty(div, 'isContentEditable', { value: true })
    document.body.appendChild(div)

    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', { value: div })

    // Call the handler directly since the window listener receives the
    // event with target=window, not the element.
    result.current.handleKeyDown(event)

    expect(onBack).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 11. Escape works even in input fields
  // -------------------------------------------------------------------------

  it('calls onClose on Escape even when target is an input field', () => {
    renderHook(() =>
      useModalNavigation({ isOpen: true, onClose, enableEscape: true })
    )

    const input = createInput()
    input.focus()
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', { value: input })
    window.dispatchEvent(event)

    expect(onClose).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // 12. Body scroll lock
  // -------------------------------------------------------------------------

  it('sets body overflow to hidden when modal is open', () => {
    document.body.style.overflow = 'auto'

    renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        disableBodyScroll: true,
      })
    )

    expect(document.body.style.overflow).toBe('hidden')
  })

  // -------------------------------------------------------------------------
  // 13. Body scroll restored
  // -------------------------------------------------------------------------

  it('restores body overflow when modal closes', () => {
    document.body.style.overflow = 'scroll'

    const { unmount } = renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        disableBodyScroll: true,
      })
    )

    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  // -------------------------------------------------------------------------
  // 14. Body scroll lock disabled
  // -------------------------------------------------------------------------

  it('does not lock body scroll when disableBodyScroll is false', () => {
    document.body.style.overflow = 'auto'

    renderHook(() =>
      useModalNavigation({
        isOpen: true,
        onClose,
        disableBodyScroll: false,
      })
    )

    expect(document.body.style.overflow).toBe('auto')
  })

  // -------------------------------------------------------------------------
  // 15. Cleanup removes listener
  // -------------------------------------------------------------------------

  it('removes keydown listener on unmount', () => {
    const { unmount } = renderHook(() =>
      useModalNavigation({ isOpen: true, onClose, enableEscape: true })
    )

    unmount()
    fireKeyDown('Escape')
    expect(onClose).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 16. Returns handleKeyDown
  // -------------------------------------------------------------------------

  it('returns a handleKeyDown function', () => {
    const { result } = renderHook(() =>
      useModalNavigation({ isOpen: true, onClose })
    )

    expect(typeof result.current.handleKeyDown).toBe('function')
  })

  it('yields Escape handling to the top-most overlay layer', () => {
    const overlayOnClose = vi.fn()
    renderHook(() => useModalNavigation({ isOpen: true, onClose, enableEscape: true }))
    renderHook(() => useOverlayEscape(true, overlayOnClose))

    fireKeyDown('Escape')

    expect(overlayOnClose).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// useModalBackdropClose
// ---------------------------------------------------------------------------

describe('useModalBackdropClose', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('calls onClose when clicking on the backdrop element itself', () => {
    const backdrop = document.createElement('div')
    document.body.appendChild(backdrop)
    const ref = { current: backdrop }
    const onClose = vi.fn()

    renderHook(() => useModalBackdropClose(ref, true, onClose))

    // Click directly on backdrop
    const event = new MouseEvent('mousedown', { bubbles: true })
    Object.defineProperty(event, 'target', { value: backdrop })
    document.dispatchEvent(event)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when clicking a child of the backdrop', () => {
    const backdrop = document.createElement('div')
    const child = document.createElement('button')
    backdrop.appendChild(child)
    document.body.appendChild(backdrop)
    const ref = { current: backdrop }
    const onClose = vi.fn()

    renderHook(() => useModalBackdropClose(ref, true, onClose))

    const event = new MouseEvent('mousedown', { bubbles: true })
    Object.defineProperty(event, 'target', { value: child })
    document.dispatchEvent(event)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not listen when modal is not open', () => {
    const backdrop = document.createElement('div')
    document.body.appendChild(backdrop)
    const ref = { current: backdrop }
    const onClose = vi.fn()

    renderHook(() => useModalBackdropClose(ref, false, onClose))

    const event = new MouseEvent('mousedown', { bubbles: true })
    Object.defineProperty(event, 'target', { value: backdrop })
    document.dispatchEvent(event)

    expect(onClose).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// useModalState
// ---------------------------------------------------------------------------

describe('useModalState', () => {
  it('starts closed by default', () => {
    const { result } = renderHook(() => useModalState())
    expect(result.current.isOpen).toBe(false)
  })

  it('can start open with initialOpen=true', () => {
    const { result } = renderHook(() => useModalState(true))
    expect(result.current.isOpen).toBe(true)
  })

  it('open() sets isOpen to true', () => {
    const { result } = renderHook(() => useModalState())
    act(() => { result.current.open() })
    expect(result.current.isOpen).toBe(true)
  })

  it('close() sets isOpen to false', () => {
    const { result } = renderHook(() => useModalState(true))
    act(() => { result.current.close() })
    expect(result.current.isOpen).toBe(false)
  })

  it('toggle() flips the state', () => {
    const { result } = renderHook(() => useModalState())
    act(() => { result.current.toggle() })
    expect(result.current.isOpen).toBe(true)
    act(() => { result.current.toggle() })
    expect(result.current.isOpen).toBe(false)
  })
})
