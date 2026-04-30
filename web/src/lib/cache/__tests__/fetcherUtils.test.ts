import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing module under test
vi.mock('../../api', () => ({
  isBackendUnavailable: vi.fn(() => false),
}))
vi.mock('../../sseClient', () => ({
  fetchSSE: vi.fn(),
}))
vi.mock('../../../hooks/mcp/shared', () => ({
  clusterCacheRef: { clusters: [] },
  agentFetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
}))
vi.mock('../../constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  STORAGE_KEY_TOKEN: 'kc-token',
}))
vi.mock('../../constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))
vi.mock('../../utils/concurrency', () => ({
  settledWithConcurrency: vi.fn(),
}))
vi.mock('../../schemas', () => ({
  ClustersResponseSchema: {},
}))
vi.mock('../../schemas/validate', () => ({
  validateArrayResponse: vi.fn((_, raw) => raw),
}))

import {
  getToken,
  abortAllFetches,
  AGENT_HTTP_TIMEOUT_MS,
  MAX_PREFETCH_PODS,
  RBAC_FETCH_TIMEOUT_MS,
} from '../fetcherUtils'

describe('fetcherUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('constants', () => {
    it('AGENT_HTTP_TIMEOUT_MS is a positive number', () => {
      expect(AGENT_HTTP_TIMEOUT_MS).toBeGreaterThan(0)
    })

    it('MAX_PREFETCH_PODS is a positive number', () => {
      expect(MAX_PREFETCH_PODS).toBeGreaterThan(0)
    })

    it('RBAC_FETCH_TIMEOUT_MS is a positive number', () => {
      expect(RBAC_FETCH_TIMEOUT_MS).toBeGreaterThan(0)
    })
  })

  describe('getToken', () => {
    it('returns null when no token is stored', () => {
      expect(getToken()).toBeNull()
    })

    it('returns stored token value', () => {
      localStorage.setItem('kc-token', 'test-token-123')
      expect(getToken()).toBe('test-token-123')
    })
  })

  describe('abortAllFetches', () => {
    it('does not throw when called', () => {
      expect(() => abortAllFetches()).not.toThrow()
    })

    it('can be called multiple times', () => {
      expect(() => {
        abortAllFetches()
        abortAllFetches()
        abortAllFetches()
      }).not.toThrow()
    })
  })
})
