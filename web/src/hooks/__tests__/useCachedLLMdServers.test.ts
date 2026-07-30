import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { loadModule, makeCacheResult, makeDeployment, mockKubectlProxy, mockExecJson, mockUseCache, setupUseCachedLLMdTestEnv } from './useCachedLLMd.test.shared'

setupUseCachedLLMdTestEnv()

describe('useCachedLLMd', () => {
  // ========================================================================
  // useCachedLLMdServers hook
  // ========================================================================

  describe('useCachedLLMdServers', () => {
    it('returns expected shape with default clusters', async () => {
      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current).toHaveProperty('servers')
      expect(result.current).toHaveProperty('status')
      expect(result.current).toHaveProperty('data')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isRefreshing')
      expect(result.current).toHaveProperty('isDemoFallback')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('isFailed')
      expect(result.current).toHaveProperty('consecutiveFailures')
      expect(result.current).toHaveProperty('lastRefresh')
      expect(result.current).toHaveProperty('refetch')
    })

    it('uses cluster-based cache key', async () => {
      const { useCachedLLMdServers } = await loadModule()
      renderHook(() => useCachedLLMdServers(['cluster-a', 'cluster-b']))

      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toBe('llmd-servers:cluster-a,cluster-b')
      expect(call.category).toBe('gitops')
    })

    it('passes demo data to useCache', async () => {
      const { useCachedLLMdServers } = await loadModule()
      renderHook(() => useCachedLLMdServers())

      const call = mockUseCache.mock.calls[0][0]
      expect(call.demoData).toHaveLength(2)
      expect(call.demoData[0].name).toBe('vllm-llama-3')
      expect(call.demoData[1].name).toBe('tgi-granite')
    })

    it('computes status from server data', async () => {
      const servers = [
        { id: '1', name: 'a', status: 'running', model: 'm1' },
        { id: '2', name: 'b', status: 'stopped', model: 'm2' },
        { id: '3', name: 'c', status: 'running', model: 'm1' },
      ]
      mockUseCache.mockReturnValue(makeCacheResult(servers))

      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current.status.totalServers).toBe(3)
      expect(result.current.status.runningServers).toBe(2)
      expect(result.current.status.stoppedServers).toBe(1)
      expect(result.current.status.totalModels).toBe(2)
      expect(result.current.status.loadedModels).toBe(1)
      expect(result.current.status.healthy).toBe(true)
    })

    it('marks status unhealthy when consecutiveFailures >= 3', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([], { consecutiveFailures: 3 }))

      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current.status.healthy).toBe(false)
    })

    it('marks status healthy when consecutiveFailures < 3', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([], { consecutiveFailures: 2 }))

      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current.status.healthy).toBe(true)
    })

    it('propagates all cache result fields', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([], {
        isLoading: true,
        isRefreshing: true,
        isDemoFallback: true,
        error: 'test error',
        isFailed: true,
        consecutiveFailures: 5,
        lastRefresh: 12345,
      }))

      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current.isLoading).toBe(true)
      expect(result.current.isRefreshing).toBe(true)
      // isDemoFallback is gated by !isLoading in the hook (prevents demo badge during loading)
      expect(result.current.isDemoFallback).toBe(false)
      expect(result.current.error).toBe('test error')
      expect(result.current.isFailed).toBe(true)
      expect(result.current.consecutiveFailures).toBe(5)
      expect(result.current.lastRefresh).toBe(12345)
    })
  })

  describe('fetchLLMdServers (cluster and autoscaler behavior)', () => {
    it('fetches servers from multiple clusters', async () => {
      // Deployments response
      mockKubectlProxy.exec.mockImplementation(
        async (args: string[], _opts: { context: string }) => {
          if (args[0] === 'get' && args[1] === 'deployments') {
            return mockExecJson([
              makeDeployment('vllm-llama', 'llm-d', {
                replicas: 2,
                readyReplicas: 2,
                podLabels: { 'llmd.org/model': 'llama-3' },
              }),
            ])
          }
          // Autoscaler queries return empty
          return mockExecJson([])
        },
      )

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['cluster-1', 'cluster-2'])

      // 2 clusters, each producing 1 server from deployments
      expect(servers.length).toBe(2)
      expect(servers[0].name).toBe('vllm-llama')
      expect(servers[0].model).toBe('llama-3')
    })

    it('calls onProgress callback with accumulated results', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-test', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const onProgress = vi.fn()
      const { fetchLLMdServers } = await loadModule()
      await fetchLLMdServers(['c1'], onProgress)

      expect(onProgress).toHaveBeenCalled()
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0]
      expect(lastCall.length).toBeGreaterThan(0)
    })

    it('handles cluster errors gracefully without crashing', async () => {
      mockKubectlProxy.exec.mockRejectedValue(new Error('connection refused'))

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['bad-cluster'])

      expect(servers).toEqual([])
      consoleError.mockRestore()
    })

    it('suppresses demo mode errors without logging', async () => {
      mockKubectlProxy.exec.mockRejectedValue(new Error('demo mode active'))

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { fetchLLMdServers } = await loadModule()
      await fetchLLMdServers(['c1'])

      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('returns empty when deployments query fails', async () => {
      mockKubectlProxy.exec.mockResolvedValue({ exitCode: 1, output: '' })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers).toEqual([])
    })

    it('detects and includes HPA autoscalers', async () => {
      const hpaItems = [
        {
          metadata: { name: 'vllm-hpa', namespace: 'llm-d' },
          spec: { scaleTargetRef: { kind: 'Deployment', name: 'vllm-llama' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'hpa') return mockExecJson(hpaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const autoscalerServer = servers.find(s => s.componentType === 'autoscaler' && s.autoscalerType === 'hpa')
      expect(autoscalerServer).toBeDefined()
      expect(autoscalerServer!.model).toBe('\u2192 vllm-llama')

      const deploymentServer = servers.find(s => s.name === 'vllm-llama')
      expect(deploymentServer!.hasAutoscaler).toBe(true)
      expect(deploymentServer!.autoscalerType).toBe('hpa')
    })

    it('detects VariantAutoscaling (VA) resources', async () => {
      const vaItems = [
        {
          metadata: { name: 'llm-va', namespace: 'llm-d' },
          spec: { targetRef: { kind: 'Deployment', name: 'vllm-llama' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'variantautoscalings') return mockExecJson(vaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const vaServer = servers.find(s => s.autoscalerType === 'va' && s.componentType === 'autoscaler')
      expect(vaServer).toBeDefined()
      expect(vaServer!.name).toBe('llm-va')
    })

    it('detects VPA autoscaler resources', async () => {
      const vpaItems = [
        {
          metadata: { name: 'vllm-vpa', namespace: 'llm-d' },
          spec: { targetRef: { name: 'vllm-llama' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'vpa') return mockExecJson(vpaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const vpaServer = servers.find(s => s.autoscalerType === 'vpa')
      expect(vpaServer).toBeDefined()
      expect(vpaServer!.model).toBe('\u2192 vllm-llama')
    })

    it('marks autoscaler as "both" when HPA and VA target same deployment', async () => {
      const hpaItems = [
        {
          metadata: { name: 'hpa-1', namespace: 'llm-d' },
          spec: { scaleTargetRef: { kind: 'Deployment', name: 'vllm-llama' } },
        },
      ]
      const vaItems = [
        {
          metadata: { name: 'va-1', namespace: 'llm-d' },
          spec: { targetRef: { kind: 'Deployment', name: 'vllm-llama' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'hpa') return mockExecJson(hpaItems)
        if (args[1] === 'variantautoscalings') return mockExecJson(vaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const deploymentServer = servers.find(s => s.name === 'vllm-llama')
      expect(deploymentServer!.autoscalerType).toBe('both')
    })

    it('extracts NVIDIA GPU info from container resource limits', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              gpuLimits: { 'nvidia.com/gpu': '4' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const server = servers.find(s => s.name === 'vllm-llama')
      expect(server!.gpu).toBe('NVIDIA')
      expect(server!.gpuCount).toBe(4)
    })

    it('extracts AMD GPU info from container resource limits', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              gpuLimits: { 'amd.com/gpu': '2' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const server = servers.find(s => s.name === 'vllm-llama')
      expect(server!.gpu).toBe('AMD')
      expect(server!.gpuCount).toBe(2)
    })

    it('extracts generic GPU info when key contains "gpu" but not nvidia/amd', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              gpuLimits: { 'custom.io/gpu': '1' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const server = servers.find(s => s.name === 'vllm-llama')
      expect(server!.gpu).toBe('GPU')
      expect(server!.gpuCount).toBe(1)
    })

    it('returns no GPU info when no gpu limits exist', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              gpuLimits: { 'cpu': '4', 'memory': '8Gi' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const server = servers.find(s => s.name === 'vllm-llama')
      expect(server!.gpu).toBeUndefined()
      expect(server!.gpuCount).toBeUndefined()
    })
  })
})
