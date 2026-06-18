import { MS_PER_MINUTE } from '../../lib/constants/time'
import type { LLMdServer } from '../useLLMd'
import type { AutoscalerInfo, DeploymentResource, LLMdStack, LLMdStackComponent } from './types'

export const CACHE_KEY = 'kubestellar-stack-cache'
export const CACHE_TTL_MS = 5 * MS_PER_MINUTE
export const DEPLOYMENT_BATCH_SIZE = 3

export function safeJsonParse<T>(value: string, fallback: T, context: string): T {
  try {
    return JSON.parse(value) as T
  } catch (err) {
    console.warn(`[useStackDiscovery] Ignoring malformed JSON for ${context}:`, err)
    return fallback
  }
}

export function isLlmdNamespace(namespace: string): boolean {
  const value = namespace.toLowerCase()
  return value.includes('llm-d') || value.includes('llmd') || value.includes('e2e') || value.includes('vllm') ||
    value === 'b2' || value.includes('effi') || value.includes('guygir') || value.includes('aibrix') ||
    value.includes('hc4ai') || value.includes('inf') || value.includes('gaie') || value.includes('sched') ||
    value.includes('inference') || value.includes('serving') || value.includes('model') || value.includes('ai-') ||
    value.includes('-ai') || value.includes('ml-')
}

export function isLlmdDeployment(deployment: DeploymentResource): boolean {
  const name = deployment.metadata.name.toLowerCase()
  const labels = deployment.spec.template?.metadata?.labels || {}
  const namespaceMatch = isLlmdNamespace(deployment.metadata.namespace)
  return name.includes('vllm') || name.includes('llm-d') || name.includes('llmd') || name.includes('tgi') || name.includes('triton') ||
    name.includes('llama') || name.includes('granite') || name.includes('qwen') || name.includes('mistral') || name.includes('mixtral') ||
    name.includes('inference') || name.includes('modelservice') || labels['llmd.org/inferenceServing'] === 'true' ||
    !!labels['llmd.org/model'] || !!labels['llm-d.ai/role'] || labels.app === 'llm-inference' ||
    labels['app.kubernetes.io/name'] === 'vllm' || labels['app.kubernetes.io/name'] === 'tgi' ||
    labels['app.kubernetes.io/part-of'] === 'inference' || name.includes('-epp') || name.endsWith('epp') ||
    name.includes('scheduling') || name.includes('inference-pool') || (namespaceMatch && (name.includes('gateway') || name.includes('ingress')))
}

export function sortStacks(a: LLMdStack, b: LLMdStack): number {
  if (a.status === 'healthy' && b.status !== 'healthy') return -1
  if (a.status !== 'healthy' && b.status === 'healthy') return 1
  return a.name.localeCompare(b.name)
}

export function buildComponentsFromDeployments(deployments: DeploymentResource[], namespace: string, cluster: string, fallbackModel?: string) {
  const prefill: LLMdStackComponent[] = []
  const decode: LLMdStackComponent[] = []
  const both: LLMdStackComponent[] = []
  let epp: LLMdStackComponent | null = null
  let model = fallbackModel

  for (const deployment of (deployments || [])) {
    const name = deployment.metadata.name.toLowerCase()
    const labels = deployment.spec.template?.metadata?.labels || {}
    const role = labels['llm-d.ai/role']?.toLowerCase()
    const replicas = deployment.spec.replicas ?? deployment.status.replicas ?? 0
    const ready = deployment.status.readyReplicas ?? 0
    const componentModel = labels['llmd.org/model'] || model
    const status: LLMdStackComponent['status'] = ready === replicas && replicas > 0 ? 'running' : ready > 0 ? 'running' : 'error'
    const isEpp = name.includes('-epp') || name.endsWith('epp') || name.includes('scheduling') || name.includes('inference-pool')

    if (isEpp && !epp) {
      epp = { name: deployment.metadata.name, namespace, cluster, type: 'epp', status: ready > 0 ? 'running' : 'pending', replicas, readyReplicas: ready }
    } else if (role === 'prefill' || (!role && name.includes('prefill'))) {
      prefill.push({ name: deployment.metadata.name, namespace, cluster, type: 'prefill', status, replicas, readyReplicas: ready, model: componentModel })
    } else if (role === 'decode' || (!role && name.includes('decode'))) {
      decode.push({ name: deployment.metadata.name, namespace, cluster, type: 'decode', status, replicas, readyReplicas: ready, model: componentModel })
    } else {
      both.push({ name: deployment.metadata.name, namespace, cluster, type: 'both', status, replicas, readyReplicas: ready, model: componentModel })
    }

    if (!model && labels['llmd.org/model']) {
      model = labels['llmd.org/model']
    }
  }

  return { prefill, decode, both, epp, model }
}

export function mergeStackWithCached(fresh: LLMdStack, cached: LLMdStack): LLMdStack {
  const merged: LLMdStack = { ...fresh, components: { ...fresh.components } }
  if (fresh.components.prefill.length === 0 && cached.components.prefill.length > 0) merged.components.prefill = cached.components.prefill
  if (fresh.components.decode.length === 0 && cached.components.decode.length > 0) merged.components.decode = cached.components.decode
  if (fresh.components.both.length === 0 && cached.components.both.length > 0) merged.components.both = cached.components.both
  if (!merged.components.epp && cached.components.epp) merged.components.epp = cached.components.epp
  if (!merged.components.gateway && cached.components.gateway) merged.components.gateway = cached.components.gateway
  if (!merged.autoscaler && cached.autoscaler) merged.autoscaler = cached.autoscaler
  if (!merged.model && cached.model) merged.model = cached.model
  const allServing = [...merged.components.prefill, ...merged.components.decode, ...merged.components.both]
  merged.totalReplicas = allServing.reduce((sum, component) => sum + component.replicas, 0)
  merged.readyReplicas = allServing.reduce((sum, component) => sum + component.readyReplicas, 0)
  merged.hasDisaggregation = merged.components.prefill.length > 0 && merged.components.decode.length > 0
  merged.status = getStackStatus(merged.components)
  return merged
}

export function getStackStatus(components: LLMdStack['components']): LLMdStack['status'] {
  const allComponents = [...components.prefill, ...components.decode, ...components.both, components.epp, components.gateway].filter(Boolean) as LLMdStackComponent[]
  if (allComponents.length === 0) return 'unknown'
  const running = allComponents.filter(component => component.status === 'running').length
  if (running === allComponents.length) return 'healthy'
  if (running > 0) return 'degraded'
  return 'unhealthy'
}

export function loadCachedStacks(): { stacks: LLMdStack[]; timestamp: number } | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    const parsed = JSON.parse(cached)
    if (parsed.timestamp && parsed.stacks) return parsed
  } catch {
    // Ignore parse errors
  }
  return null
}

export function saveCachedStacks(stacks: LLMdStack[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ stacks, timestamp: Date.now() }))
  } catch {
    // Ignore storage errors
  }
}

export function stackToServerMetrics(stack: LLMdStack): LLMdServer[] {
  const servers: LLMdServer[] = []
  stack.components.prefill.forEach((component, index) => {
    servers.push({ id: `${stack.id}-prefill-${index}`, name: `Prefill-${index}`, namespace: stack.namespace, cluster: stack.cluster, model: component.model || stack.model || 'unknown', type: 'llm-d', componentType: 'model', status: component.status === 'running' ? 'running' : 'error', replicas: component.replicas, readyReplicas: component.readyReplicas })
  })
  stack.components.decode.forEach((component, index) => {
    servers.push({ id: `${stack.id}-decode-${index}`, name: `Decode-${index}`, namespace: stack.namespace, cluster: stack.cluster, model: component.model || stack.model || 'unknown', type: 'llm-d', componentType: 'model', status: component.status === 'running' ? 'running' : 'error', replicas: component.replicas, readyReplicas: component.readyReplicas })
  })
  stack.components.both.forEach((component, index) => {
    servers.push({ id: `${stack.id}-unified-${index}`, name: `Server-${index}`, namespace: stack.namespace, cluster: stack.cluster, model: component.model || stack.model || 'unknown', type: 'llm-d', componentType: 'model', status: component.status === 'running' ? 'running' : 'error', replicas: component.replicas, readyReplicas: component.readyReplicas })
  })
  if (stack.components.epp) {
    servers.push({ id: `${stack.id}-epp`, name: 'EPP Scheduler', namespace: stack.namespace, cluster: stack.cluster, model: 'epp', type: 'llm-d', componentType: 'epp', status: stack.components.epp.status === 'running' ? 'running' : 'error', replicas: 1, readyReplicas: stack.components.epp.status === 'running' ? 1 : 0 })
  }
  if (stack.components.gateway) {
    servers.push({ id: `${stack.id}-gateway`, name: 'Istio Gateway', namespace: stack.namespace, cluster: stack.cluster, model: 'gateway', type: 'llm-d', componentType: 'gateway', status: stack.components.gateway.status === 'running' ? 'running' : 'error', replicas: 1, readyReplicas: stack.components.gateway.status === 'running' ? 1 : 0, gatewayStatus: stack.components.gateway.status === 'running' ? 'running' : 'stopped', gatewayType: 'istio' })
  }
  return servers
}
