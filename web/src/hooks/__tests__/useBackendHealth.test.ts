import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

import { useBackendHealth, isBackendConnected, isInClusterMode } from '../useBackendHealth'

describe('useBackendHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), { status: 200 })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns initial state with connecting status', () => {
    const { result } = renderHook(() => useBackendHealth())
    // Initial status is 'connecting' before first check completes
    expect(['connecting', 'connected']).toContain(result.current.status)
  })

  it('returns connected status after successful health check', async () => {
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.isConnected).toBe(true)
  })

  it('returns lastCheck as a Date after check', async () => {
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.lastCheck).toBeInstanceOf(Date))
  })

  it('versionChanged is false initially', async () => {
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.versionChanged).toBe(false)
  })

  it('inCluster reflects backend data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0', in_cluster: true }), { status: 200 })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.inCluster).toBe(true))
    expect(result.current.isInClusterMode).toBe(true)
  })
})

describe('isBackendConnected', () => {
  it('is a function that returns boolean', () => {
    const result = isBackendConnected()
    expect(typeof result).toBe('boolean')
  })
})

describe('isInClusterMode', () => {
  it('is a function that returns boolean', () => {
    const result = isInClusterMode()
    expect(typeof result).toBe('boolean')
  })
})
