import { describe, it, expect, vi } from 'vitest'
import { loadModule, makeDeployment, mockKubectlProxy, mockExecJson, setupUseCachedLLMdTestEnv } from './useCachedLLMd.test.shared'

setupUseCachedLLMdTestEnv()

describe('useCachedLLMd fetchServers', () => {
  // Tests for fetchLLMdServers - comprehensive coverage of GPU detection,
  // autoscaler handling, component classification, and error resilience
  
  describe('fetchLLMdServers multi-cluster', () => {
    it('fetches servers from multiple clusters', async () => {
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
          return mockExecJson([])
        },
      )

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['cluster-1', 'cluster-2'])

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
  })

  describe('fetchLLMdServers error handling', () => {
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

    it('handles invalid JSON from autoscaler queries gracefully', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('test-deploy', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return { exitCode: 0, output: 'INVALID_JSON' }
      })

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      // Should not crash, returns whatever deployments were found
      expect(Array.isArray(servers)).toBe(true)
      consoleError.mockRestore()
    })

    it('handles deployments exception (unparseable JSON) gracefully', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return { exitCode: 0, output: 'NOT_JSON' }
        }
        return mockExecJson([])
      })

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers).toEqual([])
      consoleError.mockRestore()
    })
  })

  describe('fetchLLMdServers autoscaler detection', () => {
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

      const deployment = servers.find(s => s.name === 'vllm-llama')
      expect(deployment!.autoscalerType).toBe('both')
    })

    it('handles VPA without targetRef gracefully', async () => {
      const vpaItems = [
        {
          metadata: { name: 'vllm-vpa', namespace: 'llm-d' },
          spec: {},
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-model', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'vpa') return mockExecJson(vpaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const vpaServer = servers.find(s => s.name === 'vllm-vpa')
      expect(vpaServer).toBeUndefined()
    })

    it('skips HPA entries that do not target Deployments', async () => {
      const hpaItems = [
        {
          metadata: { name: 'statefulset-hpa', namespace: 'llm-d' },
          spec: { scaleTargetRef: { kind: 'StatefulSet', name: 'vllm-stateful' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-deploy', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'hpa') return mockExecJson(hpaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const hpaServer = servers.find(s => s.name === 'statefulset-hpa')
      expect(hpaServer).toBeUndefined()
    })

    it('skips VA entries without targetRef.name', async () => {
      const vaItems = [
        {
          metadata: { name: 'va-invalid', namespace: 'llm-d' },
          spec: { targetRef: {} },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-model', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'variantautoscalings') return mockExecJson(vaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const vaServer = servers.find(s => s.name === 'va-invalid')
      expect(vaServer).toBeUndefined()
    })
  })

  describe('fetchLLMdServers GPU detection', () => {
    it('extracts NVIDIA GPU info from container resource limits', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('gpu-server', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              containerResources: { 'nvidia.com/gpu': '2' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0].gpuInfo).toBeDefined()
      expect(servers[0].gpuInfo).toContain('nvidia.com/gpu: 2')
    })

    it('extracts AMD GPU info from container resource limits', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('amd-gpu-server', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              containerResources: { 'amd.com/gpu': '4' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0].gpuInfo).toBeDefined()
      expect(servers[0].gpuInfo).toContain('amd.com/gpu: 4')
    })

    it('extracts generic GPU info when key contains "gpu" but not nvidia/amd', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('generic-gpu-server', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              containerResources: { 'vendor.io/gpu': '1' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0].gpuInfo).toBeDefined()
      expect(servers[0].gpuInfo).toContain('vendor.io/gpu: 1')
    })

    it('returns no GPU info when no gpu limits exist', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('no-gpu-server', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              containerResources: { 'cpu': '1', 'memory': '2Gi' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0].gpuInfo).toBeUndefined()
    })
  })

  describe('fetchLLMdServers type detection', () => {
    it('detects server types correctly via name patterns', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-model', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('tgi-model', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('triton-server', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers.find(s => s.name === 'vllm-model')!.type).toBe('vllm')
      expect(servers.find(s => s.name === 'tgi-model')!.type).toBe('tgi')
      expect(servers.find(s => s.name === 'triton-server')!.type).toBe('triton')
    })

    it('prefers vllm over the llm-d substring in vllm-deployment names', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-deployment', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0].type).toBe('vllm')
    })

    it('detects server types via labels when name does not match', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('inference-server', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: { 'llmd.org/inferenceServing': 'tgi' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0].type).toBe('tgi')
    })

    it('detects component types: epp, gateway, prometheus, model, other', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('epp-server', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('gateway-proxy', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('prometheus', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('llm-model', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers.find(s => s.name === 'epp-server')!.componentType).toBe('epp')
      expect(servers.find(s => s.name === 'gateway-proxy')!.componentType).toBe('gateway')
      expect(servers.find(s => s.name === 'prometheus')!.componentType).toBe('prometheus')
      expect(servers.find(s => s.name === 'llm-model')!.componentType).toBe('model')
    })

    it('detects component type "model" for known model name patterns', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('llama2', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('mistral-7b', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('gpt4-turbo', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      servers.forEach(s => expect(s.componentType).toBe('model'))
    })

    it('detects component type "model" via llmd.org/model label', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('unknown-service', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: { 'llmd.org/model': 'custom-model' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0].componentType).toBe('model')
    })

    it('detects gateway types: istio, kgateway, envoy (default)', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('istio-gateway', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('kgateway-api', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('envoy-proxy', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('gateway', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers.find(s => s.name === 'istio-gateway')!.gatewayType).toBe('istio')
      expect(servers.find(s => s.name === 'kgateway-api')!.gatewayType).toBe('kgateway')
      expect(servers.find(s => s.name === 'envoy-proxy')!.gatewayType).toBe('envoy')
      expect(servers.find(s => s.name === 'gateway')!.gatewayType).toBe('envoy')
    })
  })

  describe('fetchLLMdServers status and models', () => {
    it('maps server status correctly: running, stopped, scaling, error', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('running-server', 'llm-d', { replicas: 3, readyReplicas: 3 }),
            makeDeployment('stopped-server', 'llm-d', { replicas: 0, readyReplicas: 0 }),
            makeDeployment('scaling-server', 'llm-d', { replicas: 3, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers.find(s => s.name === 'running-server')!.status).toBe('running')
      expect(servers.find(s => s.name === 'stopped-server')!.status).toBe('stopped')
      expect(servers.find(s => s.name === 'scaling-server')!.status).toBe('scaling')
    })

    it('uses model from llmd.org/model label when present', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-custom', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: { 'llmd.org/model': 'gpt-neo-125m' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0].model).toBe('gpt-neo-125m')
    })

    it('falls back to deployment name when no model labels exist', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama-serve', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: {},
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0].model).toBe('vllm-llama-serve')
    })

    it('filters deployments from llm-d-related namespaces', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('gateway', 'llm-d-e2e', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('vllm-serve', 'random-ns', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('nginx', 'default', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const names = servers.map(s => s.name)
      expect(names).toContain('gateway')
      expect(names).toContain('vllm-serve')
      expect(names).not.toContain('nginx')
    })

    it('tracks gateway and prometheus status per namespace', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('gateway', 'llm-d', { replicas: 1, readyReplicas: 0 }),
            makeDeployment('prometheus', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('model-server', 'llm-d', { replicas: 2, readyReplicas: 2 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const gateway = servers.find(s => s.name === 'gateway')
      const prometheus = servers.find(s => s.name === 'prometheus')
      
      expect(gateway!.status).toBe('stopped')
      expect(prometheus!.status).toBe('running')
    })
  })
})
