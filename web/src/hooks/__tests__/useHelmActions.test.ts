import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

import { useHelmActions } from '../useHelmActions'

describe('useHelmActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, message: 'OK' }), { status: 200 })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with idle state', () => {
    const { result } = renderHook(() => useHelmActions())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastResult).toBeNull()
  })

  it('provides rollback, uninstall, upgrade functions', () => {
    const { result } = renderHook(() => useHelmActions())
    expect(typeof result.current.rollback).toBe('function')
    expect(typeof result.current.uninstall).toBe('function')
    expect(typeof result.current.upgrade).toBe('function')
  })

  it('rollback calls the API and returns result', async () => {
    const { result } = renderHook(() => useHelmActions())
    let actionResult: { success: boolean } | undefined
    await act(async () => {
      actionResult = await result.current.rollback({
        release: 'my-release',
        namespace: 'default',
        cluster: 'prod',
        revision: 1,
      })
    })
    expect(actionResult?.success).toBe(true)
    expect(fetch).toHaveBeenCalled()
  })

  it('uninstall calls the API', async () => {
    const { result } = renderHook(() => useHelmActions())
    await act(async () => {
      await result.current.uninstall({
        release: 'my-release',
        namespace: 'default',
        cluster: 'prod',
      })
    })
    expect(fetch).toHaveBeenCalled()
  })

  it('upgrade calls the API', async () => {
    const { result } = renderHook(() => useHelmActions())
    await act(async () => {
      await result.current.upgrade({
        release: 'my-release',
        namespace: 'default',
        cluster: 'prod',
        chart: 'bitnami/nginx',
        version: '1.0.0',
      })
    })
    expect(fetch).toHaveBeenCalled()
  })

  it('handles API failure gracefully', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'helm error', detail: 'release not found' }), { status: 500 })
    )
    const { result } = renderHook(() => useHelmActions())
    let actionResult: { success: boolean } | undefined
    await act(async () => {
      actionResult = await result.current.rollback({
        release: 'missing',
        namespace: 'default',
        cluster: 'prod',
        revision: 1,
      })
    })
    expect(actionResult?.success).toBe(false)
  })
})
