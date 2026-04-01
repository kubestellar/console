import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExec = vi.fn()
vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], isLoading: false })),
}))

const mockGetDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
  getDemoMode: () => mockGetDemoMode(),
  useDemoMode: () => ({ isDemoMode: mockGetDemoMode() }),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(() => vi.fn()),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockGetDemoMode(),
  getDemoMode: () => mockGetDemoMode(),
  isNetlifyDeployment: false,
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 5000 }
})

import { useLLMdServers, useLLMdModels } from '../useLLMd'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKubectlResponse(output: unknown, exitCode = 0) {
  return { output: JSON.stringify(output), exitCode, error: '' }
}

function makeDeploymentList(deployments: Array<{ name: string; namespace: string; replicas?: number }>) {
  return {
    items: deployments.map(d => ({
      metadata: { name: d.name, namespace: d.namespace, labels: {} },
      spec: { replicas: d.replicas ?? 1, template: { spec: { containers: [{ name: d.name, image: 'vllm/vllm:latest', resources: {} }] } } },
      status: { readyReplicas: d.replicas ?? 1, availableReplicas: d.replicas ?? 1 },
    })),
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockGetDemoMode.mockReturnValue(false)
  // Default: return empty lists for all kubectl calls
  mockExec.mockResolvedValue(makeKubectlResponse({ items: [] }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLLMdServers', () => {

  describe('initialization', () => {
    it('returns expected shape', () => {
      const { result } = renderHook(() => useLLMdServers())
      expect(result.current).toHaveProperty('servers')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isRefreshing')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('refetch')
      expect(result.current).toHaveProperty('lastRefresh')
    })

    it('starts with empty servers array', () => {
      const { result } = renderHook(() => useLLMdServers())
      expect(result.current.servers).toEqual([])
    })
  })

  describe('demo mode', () => {
    it('skips fetching in demo mode', async () => {
      mockGetDemoMode.mockReturnValue(true)

      const { result } = renderHook(() => useLLMdServers())

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      // Should NOT call kubectl
      expect(mockExec).not.toHaveBeenCalled()
    })
  })

  describe('fetching servers', () => {
    it('calls kubectl to get deployments from specified clusters', async () => {
      mockExec.mockResolvedValue(makeKubectlResponse({ items: [] }))

      renderHook(() => useLLMdServers(['test-cluster']))

      await waitFor(() => {
        expect(mockExec).toHaveBeenCalledWith(
          ['get', 'deployments', '-A', '-o', 'json'],
          expect.objectContaining({ context: 'test-cluster' })
        )
      })
    })

    it('handles kubectl error gracefully', async () => {
      mockExec.mockRejectedValue(new Error('Connection failed'))

      const { result } = renderHook(() => useLLMdServers(['bad-cluster']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      // Should not crash, error may be set
      expect(result.current.servers).toEqual([])
    })

    it('handles kubectl exit code > 0', async () => {
      mockExec.mockResolvedValue({ output: 'error: cluster not found', exitCode: 1, error: 'not found' })

      const { result } = renderHook(() => useLLMdServers(['missing-cluster']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.servers).toEqual([])
    })

    it('handles invalid JSON from kubectl', async () => {
      mockExec.mockResolvedValue({ output: 'not json', exitCode: 0, error: '' })

      const { result } = renderHook(() => useLLMdServers(['cluster']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.servers).toEqual([])
    })

    it('passes empty cluster list without crashing', () => {
      const { result } = renderHook(() => useLLMdServers([]))
      expect(result.current.servers).toEqual([])
    })
  })

  describe('cleanup', () => {
    it('does not throw on unmount', () => {
      const { unmount } = renderHook(() => useLLMdServers())
      expect(() => unmount()).not.toThrow()
    })
  })
})

describe('useLLMdModels', () => {

  describe('initialization', () => {
    it('returns expected shape', () => {
      const { result } = renderHook(() => useLLMdModels())
      expect(result.current).toHaveProperty('models')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('refetch')
    })

    it('starts with empty models array', () => {
      const { result } = renderHook(() => useLLMdModels())
      expect(result.current.models).toEqual([])
    })
  })

  describe('demo mode', () => {
    it('skips fetching in demo mode', async () => {
      mockGetDemoMode.mockReturnValue(true)

      const { result } = renderHook(() => useLLMdModels())

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(mockExec).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('does not throw on unmount', () => {
      const { unmount } = renderHook(() => useLLMdModels())
      expect(() => unmount()).not.toThrow()
    })
  })
})
