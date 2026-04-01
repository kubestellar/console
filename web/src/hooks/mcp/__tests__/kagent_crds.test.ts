import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../shared', () => ({
  useMCPHook: vi.fn(() => ({
    data: [],
    isLoading: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
  })),
  clusterCacheRef: { clusters: [] },
}))

vi.mock('../../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  MCP_HOOK_TIMEOUT_MS: 10000,
}))

describe('kagent_crds', () => {
  it('module is importable', async () => {
    const mod = await import('../kagent_crds')
    expect(mod).toBeDefined()
  })
})
