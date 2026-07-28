import type { LLMdStack, LLMdStackComponent } from './useStackDiscovery.types'

export interface InferencePoolResource {
  metadata: {
    name: string
    namespace: string
  }
  spec?: {
    selector?: {
      matchLabels?: Record<string, string>
    }
  }
}

export interface GatewayResource {
  metadata: {
    name: string
    namespace: string
  }
  spec?: {
    gatewayClassName?: string
  }
  status?: {
    addresses?: Array<{
      value: string
    }>
  }
}

export interface DeploymentResource {
  metadata: { name: string; namespace: string; labels?: Record<string, string> }
  spec: {
    replicas?: number
    template?: { metadata?: { labels?: Record<string, string> } }
  }
  status: { replicas?: number; readyReplicas?: number; availableReplicas?: number }
}

export interface HPAResource {
  metadata: { name: string; namespace: string }
  spec?: { minReplicas?: number; maxReplicas?: number }
  status?: { currentReplicas?: number; desiredReplicas?: number }
}

export interface WVAResource {
  metadata: { name: string; namespace: string }
  spec?: {
    minReplicas?: number
    maxReplicas?: number
    scaleTargetRef?: { namespace?: string }
  }
  status?: {
    currentReplicas?: number
    desiredReplicas?: number
    desiredOptimizedAlloc?: { numReplicas?: number }
  }
}

export interface VPAResource {
  metadata: { name: string; namespace: string }
}

export function safeJsonParse<T>(value: string, fallback: T, context: string): T {
  try {
    return JSON.parse(value) as T
  } catch (err) {
    console.error(`[useStackDiscovery] Ignoring malformed JSON for ${context}:`, err)
    return fallback
  }
}

export function isLlmdNamespace(ns: string): boolean {
  const n = ns.toLowerCase()
  return n.includes('llm-d') || n.includes('llmd') || n.includes('e2e') || n.includes('vllm') ||
    n === 'b2' || n.includes('effi') || n.includes('guygir') || n.includes('aibrix') ||
    n.includes('hc4ai') || n.includes('inf') || n.includes('gaie') || n.includes('sched') ||
    n.includes('inference') || n.includes('serving') || n.includes('model') ||
    n.includes('ai-') || n.includes('-ai') || n.includes('ml-')
}

export function isLlmdDeployment(d: DeploymentResource): boolean {
  const name = d.metadata.name.toLowerCase()
  const labels = d.spec.template?.metadata?.labels || {}
  const nsMatch = isLlmdNamespace(d.metadata.namespace)
  return (
    name.includes('vllm') || name.includes('llm-d') || name.includes('llmd') ||
    name.includes('tgi') || name.includes('triton') ||
    name.includes('llama') || name.includes('granite') ||
    name.includes('qwen') || name.includes('mistral') || name.includes('mixtral') ||
    name.includes('inference') || name.includes('modelservice') ||
    labels['llmd.org/inferenceServing'] === 'true' ||
    !!labels['llmd.org/model'] ||
    !!labels['llm-d.ai/role'] ||
    labels['app'] === 'llm-inference' ||
    labels['app.kubernetes.io/name'] === 'vllm' ||
    labels['app.kubernetes.io/name'] === 'tgi' ||
    labels['app.kubernetes.io/part-of'] === 'inference' ||
    name.includes('-epp') || name.endsWith('epp') ||
    name.includes('scheduling') || name.includes('inference-pool') ||
    (nsMatch && (name.includes('gateway') || name.includes('ingress')))
  )
}

export function sortStacks(a: LLMdStack, b: LLMdStack): number {
  if (a.status === 'healthy' && b.status !== 'healthy') return -1
  if (a.status !== 'healthy' && b.status === 'healthy') return 1
  return a.name.localeCompare(b.name)
}

export function buildComponentsFromDeployments(
  deployments: DeploymentResource[],
  namespace: string,
  cluster: string,
  fallbackModel?: string,
): {
  prefill: LLMdStackComponent[]
  decode: LLMdStackComponent[]
  both: LLMdStackComponent[]
  epp: LLMdStackComponent | null
  model: string | undefined
} {
  const prefill: LLMdStackComponent[] = []
  const decode: LLMdStackComponent[] = []
  const both: LLMdStackComponent[] = []
  let epp: LLMdStackComponent | null = null
  let model = fallbackModel

  for (const dep of (deployments || [])) {
    const depName = dep.metadata.name.toLowerCase()
    const depLabels = dep.spec.template?.metadata?.labels || {}
    const role = depLabels['llm-d.ai/role']?.toLowerCase()
    const replicas = dep.spec.replicas ?? dep.status.replicas ?? 0
    const ready = dep.status.readyReplicas ?? 0
    const depModel = depLabels['llmd.org/model'] || model
    const depStatus: LLMdStackComponent['status'] =
      ready === replicas && replicas > 0 ? 'running' : ready > 0 ? 'running' : 'error'

    const isEpp = depName.includes('-epp') || depName.endsWith('epp') ||
      depName.includes('scheduling') || depName.includes('inference-pool')

    if (isEpp && !epp) {
      epp = { name: dep.metadata.name, namespace, cluster, type: 'epp', status: ready > 0 ? 'running' : 'pending', replicas, readyReplicas: ready }
    } else if (role === 'prefill' || (!role && depName.includes('prefill'))) {
      prefill.push({ name: dep.metadata.name, namespace, cluster, type: 'prefill', status: depStatus, replicas, readyReplicas: ready, model: depModel })
    } else if (role === 'decode' || (!role && depName.includes('decode'))) {
      decode.push({ name: dep.metadata.name, namespace, cluster, type: 'decode', status: depStatus, replicas, readyReplicas: ready, model: depModel })
    } else {
      both.push({ name: dep.metadata.name, namespace, cluster, type: 'both', status: depStatus, replicas, readyReplicas: ready, model: depModel })
    }

    if (!model && depLabels['llmd.org/model']) {
      model = depLabels['llmd.org/model']
    }
  }

  return { prefill, decode, both, epp, model }
}

export function mergeStackWithCached(fresh: LLMdStack, cached: LLMdStack): LLMdStack {
  const merged = {
    ...fresh,
    components: { ...fresh.components } }

  if (fresh.components.prefill.length === 0 && cached.components.prefill.length > 0) {
    merged.components.prefill = cached.components.prefill
  }
  if (fresh.components.decode.length === 0 && cached.components.decode.length > 0) {
    merged.components.decode = cached.components.decode
  }
  if (fresh.components.both.length === 0 && cached.components.both.length > 0) {
    merged.components.both = cached.components.both
  }

  if (!merged.components.epp && cached.components.epp) {
    merged.components.epp = cached.components.epp
  }
  if (!merged.components.gateway && cached.components.gateway) {
    merged.components.gateway = cached.components.gateway
  }

  if (!merged.autoscaler && cached.autoscaler) {
    merged.autoscaler = cached.autoscaler
  }

  if (!merged.model && cached.model) {
    merged.model = cached.model
  }

  const allServing = [...merged.components.prefill, ...merged.components.decode, ...merged.components.both]
  merged.totalReplicas = allServing.reduce((sum, c) => sum + c.replicas, 0)
  merged.readyReplicas = allServing.reduce((sum, c) => sum + c.readyReplicas, 0)
  merged.hasDisaggregation = merged.components.prefill.length > 0 && merged.components.decode.length > 0
  merged.status = getStackStatus(merged.components)

  return merged
}

export function getStackStatus(components: LLMdStack['components']): LLMdStack['status'] {
  const allComponents = [
    ...components.prefill,
    ...components.decode,
    ...components.both,
    components.epp,
    components.gateway,
  ].filter(Boolean) as LLMdStackComponent[]

  if (allComponents.length === 0) return 'unknown'

  const running = allComponents.filter(c => c.status === 'running').length
  const total = allComponents.length

  if (running === total) return 'healthy'
  if (running > 0) return 'degraded'
  return 'unhealthy'
}

export function loadCachedStacks(): { stacks: LLMdStack[]; timestamp: number } | null {
  const CACHE_KEY = 'kubestellar-stack-cache'
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    const parsed = safeJsonParse<{ stacks?: LLMdStack[]; timestamp?: number } | null>(cached, null, 'stack cache')
    if (parsed?.timestamp && parsed.stacks) {
      return { stacks: parsed.stacks, timestamp: parsed.timestamp }
    }
  } catch {
    // Ignore storage errors
  }
  return null
}

export function saveCachedStacks(stacks: LLMdStack[]) {
  const CACHE_KEY = 'kubestellar-stack-cache'
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      stacks,
      timestamp: Date.now() }))
  } catch {
    // Ignore storage errors
  }
}

export const DEPLOYMENT_BATCH_SIZE = 3
