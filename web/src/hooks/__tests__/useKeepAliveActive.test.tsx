import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { useKeepAliveActive, KeepAliveActiveContext } from '../useKeepAliveActive'

describe('useKeepAliveActive', () => {
  it('returns true by default (outside any KeepAliveActiveContext)', () => {
    const { result } = renderHook(() => useKeepAliveActive())
    expect(result.current).toBe(true)
  })

  it('returns true when context value is true', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(KeepAliveActiveContext.Provider, { value: true }, children)
    const { result } = renderHook(() => useKeepAliveActive(), { wrapper })
    expect(result.current).toBe(true)
  })

  it('returns false when context value is false', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(KeepAliveActiveContext.Provider, { value: false }, children)
    const { result } = renderHook(() => useKeepAliveActive(), { wrapper })
    expect(result.current).toBe(false)
  })

  it('KeepAliveActiveContext has a default value of true', () => {
    expect(KeepAliveActiveContext['_currentValue']).toBe(true)
  })
})
