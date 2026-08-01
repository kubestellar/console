describe('useCachedLLMdModels', () => {
    it('returns expected shape with models alias', async () => {
      const { useCachedLLMdModels } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdModels())

      expect(result.current).toHaveProperty('models')
      expect(result.current).toHaveProperty('data')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('refetch')

    it('uses correct cache key', async () => {
      const { useCachedLLMdModels } = await loadModule()
      renderHook(() => useCachedLLMdModels(['my-cluster']))

      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toBe('llmd-models:my-cluster')
      expect(call.category).toBe('gitops')
    })

    it('passes demo models data', async () => {
      const { useCachedLLMdModels } = await loadModule()
      renderHook(() => useCachedLLMdModels())

      const call = mockUseCache.mock.calls[0][0]
      expect(call.demoData).toHaveLength(2)
      expect(call.demoData[0].name).toBe('llama-3-70b')
      expect(call.demoData[1].name).toBe('granite-13b')
    })
  })

  // ========================================================================
  // fetchLLMdServers (exported async function)
  // ========================================================================

  describe('fetchLLMdServers', () => {
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

    it('detects server types correctly via name patterns', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-model-a', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('tgi-model-b', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('triton-server', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('llm-d-custom', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('some-unknown', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: { 'llmd.org/inferenceServing': 'true' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const byName = (n: string) => servers.find(s => s.name === n)
      expect(byName('vllm-model-a')!.type).toBe('vllm')
      expect(byName('tgi-model-b')!.type).toBe('tgi')
      expect(byName('triton-server')!.type).toBe('triton')
      expect(byName('llm-d-custom')!.type).toBe('llm-d')
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

      expect(servers[0]?.type).toBe('vllm')
    })

    it('detects server types via labels when name does not match', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('custom-model', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: { 'app.kubernetes.io/name': 'tgi', 'llmd.org/inferenceServing': 'true' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      // tgi label takes precedence
      expect(servers.find(s => s.name === 'custom-model')!.type).toBe('tgi')
    })

    it('detects component types: epp, gateway, prometheus, model, other', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('my-epp-service', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('istio-gateway', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('prometheus', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('vllm-llama-serve', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('random-svc', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: { 'llmd.org/inferenceServing': 'true' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const byName = (n: string) => servers.find(s => s.name === n)
      expect(byName('my-epp-service')!.componentType).toBe('epp')
      expect(byName('istio-gateway')!.componentType).toBe('gateway')
      expect(byName('prometheus')!.componentType).toBe('prometheus')
      expect(byName('vllm-llama-serve')!.componentType).toBe('model')
    })

    it('detects component type "model" for known model name patterns', async () => {
      const modelNames = ['llama-serve', 'granite-7b', 'qwen-chat', 'mistral-7b', 'mixtral-8x7b']

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson(
            modelNames.map(name =>
              makeDeployment(name, 'llm-d', { replicas: 1, readyReplicas: 1 }),
            ),
          )
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      for (const name of modelNames) {
        const srv = servers.find(s => s.name === name)
        expect(srv!.componentType).toBe('model')
      }
    })

    it('detects component type "model" via llmd.org/model label', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('custom-deploy', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: { 'llmd.org/model': 'my-model', 'llmd.org/inferenceServing': 'true' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers.find(s => s.name === 'custom-deploy')!.componentType).toBe('model')
    })

    it('maps server status correctly: running, stopped, scaling, error', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-running', 'llm-d', { replicas: 2, readyReplicas: 2 }),
            makeDeployment('vllm-stopped', 'llm-d', { replicas: 0, readyReplicas: 0 }),
            makeDeployment('vllm-scaling', 'llm-d', { replicas: 3, readyReplicas: 1 }),
            makeDeployment('vllm-error', 'llm-d', { replicas: 2, readyReplicas: 0 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const byName = (n: string) => servers.find(s => s.name === n)
      expect(byName('vllm-running')!.status).toBe('running')
      expect(byName('vllm-stopped')!.status).toBe('stopped')
      expect(byName('vllm-scaling')!.status).toBe('scaling')
      expect(byName('vllm-error')!.status).toBe('error')
    })

    it('tracks gateway and prometheus status per namespace', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('istio-gateway', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('prometheus', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('vllm-model', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const model = servers.find(s => s.name === 'vllm-model')
      expect(model!.gatewayStatus).toBe('running')
      expect(model!.gatewayType).toBe('istio')
      expect(model!.prometheusStatus).toBe('running')
    })

    it('detects gateway types: istio, kgateway, envoy (default)', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            // Use llm-d-related namespaces so the filter includes gateways
            makeDeployment('istio-ingress', 'llm-d-a', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('kgateway-proxy', 'llm-d-b', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('my-gateway', 'llm-d-c', { replicas: 1, readyReplicas: 1 }),
            // Add a vllm deployment in each ns to get gateway info propagated
            makeDeployment('vllm-a', 'llm-d-a', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('vllm-b', 'llm-d-b', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('vllm-c', 'llm-d-c', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const vllmA = servers.find(s => s.name === 'vllm-a')
      const vllmB = servers.find(s => s.name === 'vllm-b')
      const vllmC = servers.find(s => s.name === 'vllm-c')
      expect(vllmA!.gatewayType).toBe('istio')
      expect(vllmB!.gatewayType).toBe('kgateway')
      expect(vllmC!.gatewayType).toBe('envoy')
    })

    it('handles invalid JSON from autoscaler queries gracefully', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-model', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'hpa') return { exitCode: 0, output: 'not-json' }
        if (args[1] === 'variantautoscalings') return { exitCode: 0, output: '{bad' }
        if (args[1] === 'vpa') return { exitCode: 0, output: 'corrupted' }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      // Should still return the deployment without crashing
      expect(servers.find(s => s.name === 'vllm-model')).toBeDefined()
    })

    it('skips HPA entries that do not target Deployments', async () => {
      const hpaItems = [
        {
          metadata: { name: 'hpa-stateful', namespace: 'llm-d' },
          spec: { scaleTargetRef: { kind: 'StatefulSet', name: 'some-sts' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-model', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'hpa') return mockExecJson(hpaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const autoscalers = servers.filter(s => s.componentType === 'autoscaler')
      expect(autoscalers).toHaveLength(0)
    })

    it('skips VA entries without targetRef.name', async () => {
      const vaItems = [
        {
          metadata: { name: 'va-orphan', namespace: 'llm-d' },
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

      const autoscalers = servers.filter(s => s.componentType === 'autoscaler')
      expect(autoscalers).toHaveLength(0)
    })

    it('handles VPA without targetRef gracefully', async () => {
      const vpaItems = [
        { metadata: { name: 'vpa-no-target', namespace: 'llm-d' }, spec: {} },
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

      const vpaServer = servers.find(s => s.autoscalerType === 'vpa')
      expect(vpaServer).toBeDefined()
      expect(vpaServer!.model).toBe('\u2192 unknown')
    })

    it('filters deployments from llm-d-related namespaces', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            // Not an llm-d name, but gateway in an llm-d namespace
            makeDeployment('gateway', 'llm-d-e2e', { replicas: 1, readyReplicas: 1 }),
            // vllm name in a random namespace
            makeDeployment('vllm-serve', 'random-ns', { replicas: 1, readyReplicas: 1 }),
            // Non-matching name and non-matching namespace
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

    it('handles deployments exception (unparseable JSON) gracefully', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return { exitCode: 0, output: 'NOT_JSON' }
        }
        return mockExecJson([])
      })

      // The JSON.parse inside the catch should cause it to throw,
      // but the outer try/catch in fetchLLMdServersForCluster handles it
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      // The error is caught in the per-cluster handler
      expect(servers).toEqual([])
      consoleError.mockRestore()
    })
  })
})
