import { isAgentUnavailable, reportAgentDataSuccess } from '../useLocalAgent'
import { clusterCacheRef, LOCAL_AGENT_URL } from './shared'
import { useCache } from '../../lib/cache'
import type {
  KagentCRDAgent,
  KagentCRDToolServer,
  KagentCRDModelConfig,
  KagentCRDMemory,
} from '../../types/kagent_crds'

// Re-export types for convenience
export type { KagentCRDAgent, KagentCRDToolServer, KagentCRDModelConfig, KagentCRDMemory }

// ─── Demo Data ─────────────────────────────────────────────────────

function getDemoAgents(): KagentCRDAgent[] {
  return [
    { name: 'k8s-assistant', namespace: 'kagent-system', cluster: 'prod-east', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 2, readyReplicas: 2, modelConfigRef: 'claude-sonnet', toolCount: 4, a2aEnabled: true, systemMessage: 'Kubernetes management agent', createdAt: '2025-01-15T10:00:00Z', age: '68d' },
    { name: 'code-reviewer', namespace: 'kagent-system', cluster: 'prod-east', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: 'gpt-4o', toolCount: 2, a2aEnabled: true, systemMessage: 'Code review agent', createdAt: '2025-01-20T08:00:00Z', age: '63d' },
    { name: 'incident-bot', namespace: 'kagent-system', cluster: 'prod-west', agentType: 'Declarative', runtime: 'go', status: 'Ready', replicas: 3, readyReplicas: 3, modelConfigRef: 'claude-sonnet', toolCount: 5, a2aEnabled: false, systemMessage: 'Incident response agent', createdAt: '2025-01-10T12:00:00Z', age: '73d' },
    { name: 'helm-deployer', namespace: 'kagent-system', cluster: 'prod-west', agentType: 'BYO', runtime: '', status: 'Accepted', replicas: 1, readyReplicas: 1, modelConfigRef: 'gemini-pro', toolCount: 3, a2aEnabled: true, systemMessage: 'Helm deployment agent', createdAt: '2025-01-22T14:00:00Z', age: '61d' },
    { name: 'security-scanner', namespace: 'kagent-system', cluster: 'staging', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 2, readyReplicas: 2, modelConfigRef: 'claude-sonnet', toolCount: 6, a2aEnabled: true, systemMessage: 'Security scanning agent', createdAt: '2025-01-18T09:00:00Z', age: '65d' },
    { name: 'cost-analyzer', namespace: 'kagent-ops', cluster: 'staging', agentType: 'Declarative', runtime: 'python', status: 'Pending', replicas: 1, readyReplicas: 0, modelConfigRef: 'gpt-4o-mini', toolCount: 2, a2aEnabled: false, systemMessage: 'Cost analysis agent', createdAt: '2025-01-25T16:00:00Z', age: '58d' },
    { name: 'log-parser', namespace: 'kagent-ops', cluster: 'prod-east', agentType: 'BYO', runtime: 'go', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: 'ollama-llama', toolCount: 1, a2aEnabled: false, systemMessage: 'Log parsing agent', createdAt: '2025-01-12T11:00:00Z', age: '71d' },
    { name: 'drift-detector', namespace: 'kagent-ops', cluster: 'prod-west', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: 'claude-sonnet', toolCount: 3, a2aEnabled: true, systemMessage: 'Configuration drift detector', createdAt: '2025-01-14T13:00:00Z', age: '69d' },
  ]
}

function getDemoTools(): KagentCRDToolServer[] {
  return [
    { name: 'kubectl-server', namespace: 'kagent-system', cluster: 'prod-east', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [{ name: 'get_pods', description: 'List pods' }, { name: 'get_deployments', description: 'List deployments' }, { name: 'apply_manifest', description: 'Apply YAML' }], status: 'Ready' },
    { name: 'github-mcp', namespace: 'kagent-system', cluster: 'prod-east', kind: 'RemoteMCPServer', protocol: 'sse', url: 'https://github-mcp.internal:8443', discoveredTools: [{ name: 'create_pr', description: 'Create pull request' }, { name: 'review_pr', description: 'Review pull request' }], status: 'Ready' },
    { name: 'trivy-scanner', namespace: 'kagent-system', cluster: 'prod-west', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [{ name: 'scan_image', description: 'Scan container image' }, { name: 'scan_fs', description: 'Scan filesystem' }], status: 'Ready' },
    { name: 'slack-mcp', namespace: 'kagent-system', cluster: 'prod-west', kind: 'RemoteMCPServer', protocol: 'streamableHTTP', url: 'https://slack-mcp.internal:8443', discoveredTools: [{ name: 'send_message', description: 'Send Slack message' }], status: 'Ready' },
    { name: 'prometheus-server', namespace: 'kagent-system', cluster: 'staging', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [{ name: 'query_range', description: 'Run PromQL range query' }, { name: 'get_alerts', description: 'List active alerts' }], status: 'Ready' },
    { name: 'helm-server', namespace: 'kagent-system', cluster: 'staging', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [{ name: 'install_chart', description: 'Install Helm chart' }, { name: 'upgrade_release', description: 'Upgrade release' }, { name: 'list_releases', description: 'List releases' }], status: 'Pending' },
  ]
}

function getDemoModels(): KagentCRDModelConfig[] {
  return [
    { name: 'claude-sonnet', namespace: 'kagent-system', cluster: 'prod-east', kind: 'ModelConfig', provider: 'Anthropic', model: 'claude-sonnet-4-20250514', discoveredModels: [], modelCount: 0, lastDiscoveryTime: '', status: 'Ready' },
    { name: 'gpt-4o', namespace: 'kagent-system', cluster: 'prod-east', kind: 'ModelConfig', provider: 'OpenAI', model: 'gpt-4o', discoveredModels: [], modelCount: 0, lastDiscoveryTime: '', status: 'Ready' },
    { name: 'gemini-pro', namespace: 'kagent-system', cluster: 'prod-west', kind: 'ModelConfig', provider: 'Gemini', model: 'gemini-2.0-flash', discoveredModels: [], modelCount: 0, lastDiscoveryTime: '', status: 'Ready' },
    { name: 'ollama-llama', namespace: 'kagent-ops', cluster: 'prod-east', kind: 'ModelConfig', provider: 'Ollama', model: 'llama3.2', discoveredModels: ['llama3.2', 'llama3.1', 'mistral'], modelCount: 3, lastDiscoveryTime: '2025-03-20T12:00:00Z', status: 'Ready' },
    { name: 'azure-provider', namespace: 'kagent-system', cluster: 'staging', kind: 'ModelProviderConfig', provider: 'AzureOpenAI', model: '', discoveredModels: ['gpt-4o', 'gpt-4o-mini', 'text-embedding-3-large'], modelCount: 3, lastDiscoveryTime: '2025-03-19T08:00:00Z', status: 'Ready' },
  ]
}

function getDemoMemories(): KagentCRDMemory[] {
  return [
    { name: 'incident-memory', namespace: 'kagent-system', cluster: 'prod-east', provider: 'pinecone', status: 'Ready' },
    { name: 'code-review-memory', namespace: 'kagent-system', cluster: 'prod-east', provider: 'pinecone', status: 'Ready' },
  ]
}

// ─── Agent fetch helper ────────────────────────────────────────────

const AGENT_TIMEOUT = 15000

async function agentFetch<T>(path: string, cluster: string, namespace?: string): Promise<T | null> {
  if (isAgentUnavailable()) return null

  const params = new URLSearchParams()
  params.append('cluster', cluster)
  if (namespace) params.append('namespace', namespace)

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT)
  try {
    const res = await fetch(`${LOCAL_AGENT_URL}${path}?${params}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(tid)
    if (!res.ok) throw new Error(`Agent ${res.status}`)
    return await res.json()
  } catch {
    clearTimeout(tid)
    return null
  }
}

/** Fetch from agent across all reachable clusters */
async function agentFetchAllClusters<T>(
  path: string,
  key: string,
  namespace?: string,
  specificCluster?: string,
): Promise<T[]> {
  if (isAgentUnavailable()) return []

  const clusters = clusterCacheRef.clusters.filter(c => c.reachable !== false && !c.name.includes('/'))
  if (clusters.length === 0) return []

  const targets = specificCluster
    ? clusters.filter(c => c.name === specificCluster)
    : clusters

  const results = await Promise.allSettled(
    targets.map(async ({ name, context }) => {
      const data = await agentFetch<Record<string, unknown>>(path, context || name, namespace)
      if (!data) throw new Error('No data')
      const items = (data[key] || []) as T[]
      return items.map(item => ({ ...item, cluster: name }))
    }),
  )

  const items: T[] = []
  for (const r of (results || [])) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items
}

// ─── Hooks ─────────────────────────────────────────────────────────

export function useKagentCRDAgents(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentCRDAgent[]>({
    key: `kagent-crd-agents:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentCRDAgent[],
    demoData: getDemoAgents(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const agents = await agentFetchAllClusters<KagentCRDAgent>(
        '/kagent-crds/agents', 'agents', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return agents
    },
  })
}

export function useKagentCRDTools(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentCRDToolServer[]>({
    key: `kagent-crd-tools:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentCRDToolServer[],
    demoData: getDemoTools(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const tools = await agentFetchAllClusters<KagentCRDToolServer>(
        '/kagent-crds/tools', 'tools', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return tools
    },
  })
}

export function useKagentCRDModels(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentCRDModelConfig[]>({
    key: `kagent-crd-models:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentCRDModelConfig[],
    demoData: getDemoModels(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const models = await agentFetchAllClusters<KagentCRDModelConfig>(
        '/kagent-crds/models', 'models', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return models
    },
  })
}

export function useKagentCRDMemories(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentCRDMemory[]>({
    key: `kagent-crd-memories:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentCRDMemory[],
    demoData: getDemoMemories(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const memories = await agentFetchAllClusters<KagentCRDMemory>(
        '/kagent-crds/memories', 'memories', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return memories
    },
  })
}
