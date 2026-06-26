import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useModal } from '../useModal'

describe('useModal', () => {
  it('defaults to closed', () => {
    const { result } = renderHook(() => useModal())
    expect(result.current.isOpen).toBe(false)
  })

  it('honors the initialOpen argument', () => {
    const { result } = renderHook(() => useModal(true))
    expect(result.current.isOpen).toBe(true)
  })

  it('open() sets isOpen true', () => {
    const { result } = renderHook(() => useModal())
    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)
  })

  it('close() sets isOpen false', () => {
    const { result } = renderHook(() => useModal(true))
    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
  })

  it('toggle() flips isOpen', () => {
    const { result } = renderHook(() => useModal())
    act(() => result.current.toggle())
    expect(result.current.isOpen).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.isOpen).toBe(false)
  })

  it('setIsOpen() sets arbitrary value', () => {
    const { result } = renderHook(() => useModal())
    act(() => result.current.setIsOpen(true))
    expect(result.current.isOpen).toBe(true)
    act(() => result.current.setIsOpen(false))
    expect(result.current.isOpen).toBe(false)
  })

  it('returns stable callback references across renders', () => {
    const { result, rerender } = renderHook(() => useModal())
    const firstOpen = result.current.open
    const firstClose = result.current.close
    const firstToggle = result.current.toggle
    rerender()
    expect(result.current.open).toBe(firstOpen)
    expect(result.current.close).toBe(firstClose)
    expect(result.current.toggle).toBe(firstToggle)
  })
})
