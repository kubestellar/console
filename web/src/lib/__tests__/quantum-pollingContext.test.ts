import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import {
  QuantumPollingContext,
  useQuantumPolling,
  isGlobalQuantumPollingPaused,
} from '../quantum/pollingContext'

describe('QuantumPollingContext', () => {
  it('provides default pausePolling = false', () => {
    const { result } = renderHook(() => useQuantumPolling())
    expect(result.current.pausePolling).toBe(false)
  })

  it('default setPausePolling is a no-op (does not throw)', () => {
    const { result } = renderHook(() => useQuantumPolling())
    expect(() => result.current.setPausePolling(true)).not.toThrow()
  })

  it('returns value from custom provider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QuantumPollingContext.Provider, { value: { pausePolling: true, setPausePolling: () => {} } }, children)
    const { result } = renderHook(() => useQuantumPolling(), { wrapper })
    expect(result.current.pausePolling).toBe(true)
  })

  it('setPausePolling from provider is callable', () => {
    let called = false
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QuantumPollingContext.Provider, {
        value: { pausePolling: false, setPausePolling: () => { called = true } },
      }, children)
    const { result } = renderHook(() => useQuantumPolling(), { wrapper })
    act(() => { result.current.setPausePolling(true) })
    expect(called).toBe(true)
  })
})

describe('isGlobalQuantumPollingPaused', () => {
  beforeEach(() => {
    // The module-level global starts false; we can only read it here
    // since there is no exported setter. Just verify the initial contract.
  })

  it('returns a boolean', () => {
    expect(typeof isGlobalQuantumPollingPaused()).toBe('boolean')
  })

  it('returns false initially (module default)', () => {
    // Module initialises globalQuantumPollingPaused = false
    expect(isGlobalQuantumPollingPaused()).toBe(false)
  })
})
