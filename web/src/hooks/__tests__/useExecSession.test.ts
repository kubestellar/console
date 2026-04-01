import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))

import { useExecSession } from '../useExecSession'

describe('useExecSession', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('starts with disconnected status', () => {
    const { result } = renderHook(() => useExecSession())
    expect(result.current.status).toBe('disconnected')
    expect(result.current.error).toBeNull()
    expect(result.current.reconnectAttempt).toBe(0)
    expect(result.current.reconnectCountdown).toBe(0)
  })

  it('provides connect/disconnect/sendInput/resize functions', () => {
    const { result } = renderHook(() => useExecSession())
    expect(typeof result.current.connect).toBe('function')
    expect(typeof result.current.disconnect).toBe('function')
    expect(typeof result.current.sendInput).toBe('function')
    expect(typeof result.current.resize).toBe('function')
  })

  it('provides callback registration functions', () => {
    const { result } = renderHook(() => useExecSession())
    expect(typeof result.current.onData).toBe('function')
    expect(typeof result.current.onExit).toBe('function')
    expect(typeof result.current.onStatusChange).toBe('function')
  })

  it('onData registers a callback without error', () => {
    const { result } = renderHook(() => useExecSession())
    const callback = vi.fn()
    act(() => { result.current.onData(callback) })
    // No error — callback is stored in a ref
  })

  it('onExit registers a callback without error', () => {
    const { result } = renderHook(() => useExecSession())
    const callback = vi.fn()
    act(() => { result.current.onExit(callback) })
  })

  it('onStatusChange registers a callback without error', () => {
    const { result } = renderHook(() => useExecSession())
    const callback = vi.fn()
    act(() => { result.current.onStatusChange(callback) })
  })

  it('disconnect sets status to disconnected', () => {
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.disconnect() })
    expect(result.current.status).toBe('disconnected')
  })

  it('sendInput does not throw when not connected', () => {
    const { result } = renderHook(() => useExecSession())
    expect(() => {
      act(() => { result.current.sendInput('test input') })
    }).not.toThrow()
  })

  it('resize does not throw when not connected', () => {
    const { result } = renderHook(() => useExecSession())
    expect(() => {
      act(() => { result.current.resize(120, 40) })
    }).not.toThrow()
  })
})
