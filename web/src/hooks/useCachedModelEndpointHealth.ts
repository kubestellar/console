import { createCachedHook, type CachedHookResult, type RefreshCategory } from '../lib/cache'
import { fetchLLMdServers } from './useCachedLLMd'
import type { LLMdServer } from './useLLMd'

export type ModelEndpointHealth = 'healthy' | 'degraded' | 'unavailable'

export interface ModelEndpointSummary {
  health: ModelEndpointHealth
  totalEndpoints: number
  readyEndpoints: number
  degradedEndpoints: number
  unavailableEndpoints: number
  totalReadyReplicas: number
  totalReplicas: number
}

export interface ModelEndpointHealthData {
  endpoints: LLMdServer[]
  summary: ModelEndpointSummary
  lastCheckTime: string
}

const DEFAULT_LLMD_CLUSTERS = ['vllm-d', 'platform-eval'] as const

const EMPTY_MODEL_ENDPOINT_HEALTH: ModelEndpointHealthData = {
  endpoints: [],
  summary: {
    health: 'unavailable',
    totalEndpoints: 0,
    readyEndpoints: 0,
    degradedEndpoints: 0,
    unavailableEndpoints: 0,
    totalReadyReplicas: 0,
    totalReplicas: 0,
  },
  lastCheckTime: '',
}

export function summarizeModelEndpointHealth(endpoints: LLMdServer[]): ModelEndpointSummary {
  const readyEndpoints = endpoints.filter((endpoint) => endpoint.status === 'running').length
  const degradedEndpoints = endpoints.filter((endpoint) => endpoint.status === 'scaling').length
  const unavailableEndpoints = endpoints.filter((endpoint) => endpoint.status === 'stopped' || endpoint.status === 'error').length
  const totalReadyReplicas = endpoints.reduce((sum, endpoint) => sum + (endpoint.readyReplicas ?? 0), 0)
  const totalReplicas = endpoints.reduce((sum, endpoint) => sum + (endpoint.replicas ?? 0), 0)

  let health: ModelEndpointHealth = 'healthy'
  if (endpoints.length === 0 || totalReplicas === 0) {
    health = 'unavailable'
  } else if (degradedEndpoints > 0 || unavailableEndpoints > 0 || totalReadyReplicas < totalReplicas) {
    health = 'degraded'
  }

  return {
    health,
    totalEndpoints: endpoints.length,
    readyEndpoints,
    degradedEndpoints,
    unavailableEndpoints,
    totalReadyReplicas,
    totalReplicas,
  }
}

export const getDemoModelEndpointHealth = (): ModelEndpointHealthData => {
  const endpoints: LLMdServer[] = [
    {
      id: 'vllm-d-llm-d-llama-model',
      name: 'vllm-llama-3',
      namespace: 'llm-d',
      cluster: 'vllm-d',
      model: 'llama-3-70b',
      type: 'vllm',
      componentType: 'model',
      status: 'running',
      replicas: 2,
      readyReplicas: 2,
      gpu: 'NVIDIA',
      gpuCount: 4,
    },
    {
      id: 'platform-eval-llm-d-granite-model',
      name: 'tgi-granite',
      namespace: 'llm-d',
      cluster: 'platform-eval',
      model: 'granite-13b',
      type: 'tgi',
      componentType: 'model',
      status: 'scaling',
      replicas: 2,
      readyReplicas: 1,
      gpu: 'NVIDIA',
      gpuCount: 2,
    },
  ]

  return {
    endpoints,
    summary: summarizeModelEndpointHealth(endpoints),
    lastCheckTime: new Date().toISOString(),
  }
}

export async function fetchModelEndpointHealth(
  clusters: string[] = [...DEFAULT_LLMD_CLUSTERS]
): Promise<ModelEndpointHealthData> {
  const servers = await fetchLLMdServers(clusters)
  const endpoints = servers.filter((server) => server.componentType === 'model')

  return {
    endpoints,
    summary: summarizeModelEndpointHealth(endpoints),
    lastCheckTime: new Date().toISOString(),
  }
}

export function useCachedModelEndpointHealth(
  clusters: string[] = [...DEFAULT_LLMD_CLUSTERS]
): CachedHookResult<ModelEndpointHealthData> & { endpoints: LLMdServer[]; summary: ModelEndpointSummary } {
  const key = `llmd-model-endpoint-health:${clusters.join(',')}`

  const useModelEndpointHealthBase = createCachedHook<ModelEndpointHealthData>({
    key,
    category: 'gitops' as RefreshCategory,
    initialData: EMPTY_MODEL_ENDPOINT_HEALTH,
    getDemoData: getDemoModelEndpointHealth,
    fetcher: () => fetchModelEndpointHealth(clusters),
  })
  const result = useModelEndpointHealthBase()

  return {
    ...result,
    endpoints: result.data.endpoints,
    summary: result.data.summary,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
  }
}
