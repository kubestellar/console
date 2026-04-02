import { describe, it, expect, vi } from 'vitest'

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

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
} })

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  MCP_HOOK_TIMEOUT_MS: 10000,
} })

describe('kagent_crds', () => {
  it('module is importable', async () => {
    const mod = await import('../kagent_crds')
    expect(mod).toBeDefined()
  })
})
