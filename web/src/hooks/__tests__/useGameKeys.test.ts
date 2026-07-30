import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGameKeys, useGameKeyTracking } from '../useGameKeys'
import { type RefObject, type MutableRefObject } from 'react'

describe('useGameKeys', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('calls onKeyDown when key is pressed and container is visible', () => {
    const onKeyDown = vi.fn()
    const containerRef = { current: container } as RefObject<HTMLDivElement | null>

    renderHook(() => useGameKeys(containerRef, { onKeyDown }))

    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })
    window.dispatchEvent(event)

    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })

  it('does not call onKeyDown when container is null', () => {
    const onKeyDown = vi.fn()
    const containerRef = { current: null } as RefObject<HTMLDivElement | null>

    renderHook(() => useGameKeys(containerRef, { onKeyDown }))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('does not call onKeyDown when target is an input element', () => {
    const onKeyDown = vi.fn()
    const containerRef = { current: container } as RefObject<HTMLDivElement | null>

    renderHook(() => useGameKeys(containerRef, { onKeyDown }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    const event = new KeyboardEvent('keydown', { key: 'a' })
    Object.defineProperty(event, 'target', { value: input })
    window.dispatchEvent(event)

    expect(onKeyDown).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('does not fire when container is hidden by KeepAlive', () => {
    const onKeyDown = vi.fn()
    container.style.display = 'none'
    const containerRef = { current: container } as RefObject<HTMLDivElement | null>

    renderHook(() => useGameKeys(containerRef, { onKeyDown }))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space' }))
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('calls onKeyUp when provided', () => {
    const onKeyUp = vi.fn()
    const containerRef = { current: container } as RefObject<HTMLDivElement | null>

    renderHook(() => useGameKeys(containerRef, { onKeyUp }))

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown' }))
    expect(onKeyUp).toHaveBeenCalledTimes(1)
  })

  it('cleans up event listeners on unmount', () => {
    const onKeyDown = vi.fn()
    const containerRef = { current: container } as RefObject<HTMLDivElement | null>

    const { unmount } = renderHook(() => useGameKeys(containerRef, { onKeyDown }))
    unmount()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(onKeyDown).not.toHaveBeenCalled()
  })
})

describe('useGameKeyTracking', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('adds keys to the set on keydown', () => {
    const keysRef = { current: new Set<string>() } as MutableRefObject<Set<string>>
    const containerRef = { current: container } as RefObject<HTMLDivElement | null>

    renderHook(() => useGameKeyTracking(containerRef, keysRef))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(keysRef.current.has('ArrowUp')).toBe(true)
  })

  it('removes keys from the set on keyup', () => {
    const keysRef = { current: new Set<string>() } as MutableRefObject<Set<string>>
    const containerRef = { current: container } as RefObject<HTMLDivElement | null>

    renderHook(() => useGameKeyTracking(containerRef, keysRef))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(keysRef.current.has('ArrowUp')).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' }))
    expect(keysRef.current.has('ArrowUp')).toBe(false)
  })

  it('converts to lowercase when option is set', () => {
    const keysRef = { current: new Set<string>() } as MutableRefObject<Set<string>>
    const containerRef = { current: container } as RefObject<HTMLDivElement | null>

    renderHook(() => useGameKeyTracking(containerRef, keysRef, { lowercase: true }))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A' }))
    expect(keysRef.current.has('a')).toBe(true)
  })

  it('clears set on unmount', () => {
    const keysRef = { current: new Set<string>() } as MutableRefObject<Set<string>>
    const containerRef = { current: container } as RefObject<HTMLDivElement | null>

    const { unmount } = renderHook(() => useGameKeyTracking(containerRef, keysRef))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(keysRef.current.size).toBe(1)

    unmount()
    expect(keysRef.current.size).toBe(0)
  })
})
