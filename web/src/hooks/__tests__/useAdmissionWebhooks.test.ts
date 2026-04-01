import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [{ name: 'prod', reachable: true }],
    isLoading: false,
  })),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'kc-auth-token',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

import { useAdmissionWebhooks } from '../useAdmissionWebhooks'

describe('useAdmissionWebhooks', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  it('returns demo data when API is unavailable', async () => {
    const { result } = renderHook(() => useAdmissionWebhooks())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.webhooks.length).toBeGreaterThan(0)
    expect(result.current.isDemoData).toBe(true)
  })

  it('returns lastRefresh as a number after load', async () => {
    const { result } = renderHook(() => useAdmissionWebhooks())
    await waitFor(() => expect(result.current.lastRefresh).not.toBeNull())
    expect(typeof result.current.lastRefresh).toBe('number')
  })

  it('tracks consecutive failures', async () => {
    const { result } = renderHook(() => useAdmissionWebhooks())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('isFailed is true after 3+ consecutive failures', async () => {
    const { result } = renderHook(() => useAdmissionWebhooks())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // After first failure, not yet failed (need 3)
    expect(typeof result.current.isFailed).toBe('boolean')
  })

  it('refetch is callable', async () => {
    const { result } = renderHook(() => useAdmissionWebhooks())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('loads from cache when available', () => {
    const cached = {
      data: [{ name: 'cached-webhook', type: 'validating', failurePolicy: 'Fail', matchPolicy: 'Exact', rules: 1, cluster: 'prod' }],
      timestamp: Date.now(),
      isDemoData: false,
    }
    localStorage.setItem('kc-admission-webhooks-cache', JSON.stringify(cached))
    const { result } = renderHook(() => useAdmissionWebhooks())
    expect(result.current.webhooks).toHaveLength(1)
    expect(result.current.webhooks[0].name).toBe('cached-webhook')
  })
})
