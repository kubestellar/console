/**
 * Tests for createStateContext — covers the factory function's three exports:
 * Context, useRequiredStateContext, and useOptionalStateContext.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createContext, createElement, type ReactNode } from 'react'
import { createStateContext } from '../createStateContext'

describe('createStateContext', () => {
  it('returns Context, useRequiredStateContext, and useOptionalStateContext', () => {
    const result = createStateContext<string>({ name: 'Test' })
    expect(result).toHaveProperty('Context')
    expect(result).toHaveProperty('useRequiredStateContext')
    expect(result).toHaveProperty('useOptionalStateContext')
  })

  it('useOptionalStateContext returns null when no provider wraps', () => {
    const { useOptionalStateContext } = createStateContext<number>({ name: 'Num' })
    const { result } = renderHook(() => useOptionalStateContext())
    expect(result.current).toBeNull()
  })

  it('useRequiredStateContext throws when no provider and no fallback', () => {
    const { useRequiredStateContext } = createStateContext<string>({
      name: 'Strict',
      hookName: 'useStrict',
      providerLabel: 'StrictProvider',
    })
    expect(() => renderHook(() => useRequiredStateContext())).toThrow(
      'useStrict must be used within StrictProvider',
    )
  })

  it('useRequiredStateContext uses createFallbackValue when no provider', () => {
    const { useRequiredStateContext } = createStateContext<string>({
      name: 'Fallback',
      createFallbackValue: () => 'default-value',
    })
    const { result } = renderHook(() => useRequiredStateContext())
    expect(result.current).toBe('default-value')
  })

  it('useRequiredStateContext reads value provided by Context.Provider', () => {
    const { Context, useRequiredStateContext } = createStateContext<string>({
      name: 'WithProvider',
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Context.Provider, { value: 'from-provider' }, children)

    const { result } = renderHook(() => useRequiredStateContext(), { wrapper })
    expect(result.current).toBe('from-provider')
  })

  it('useOptionalStateContext reads value provided by Context.Provider', () => {
    const { Context, useOptionalStateContext } = createStateContext<number>({
      name: 'OptionalWith',
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Context.Provider, { value: 42 }, children)

    const { result } = renderHook(() => useOptionalStateContext(), { wrapper })
    expect(result.current).toBe(42)
  })

  it('uses default hookName and providerLabel in error message', () => {
    const { useRequiredStateContext } = createStateContext<boolean>({ name: 'Bool' })
    expect(() => renderHook(() => useRequiredStateContext())).toThrow(
      'useBool must be used within BoolProvider',
    )
  })
})
