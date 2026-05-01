import { useMemo } from 'react'
import { mapSettledWithConcurrency } from '../../lib/utils/concurrency'
import { isAgentUnavailable, reportAgentDataSuccess } from '../useLocalAgent'
import { clusterCacheRef, LOCAL_AGENT_URL, agentFetch as sharedAgentFetch } from './shared'
import { deduplicateClustersByServer } from './dedup'
import { useCache } from '../../lib/cache'

// ─── Types ─────────────────────────────────────────────────────────

export interface KagentiAgent {
  name: string
  namespace: string
  status: string
  replicas: number
  readyReplicas: number
  framework: string
  protocol: string
  image: string
  cluster: string
  createdAt: string
}

export interface KagentiBuild {
  name: string
  namespace: string
  status: string
  source: string
  pipeline: string
  mode: string
  cluster: string
  startTime: string
  completionTime: string
}

export interface KagentiCard {
  name: string
  namespace: string
  agentName: string
  skills: string[]
  capabilities: string[]
  syncPeriod: string
  identityBinding: string
  cluster: string
}

export interface KagentiTool {
  name: string
  namespace: string
  toolPrefix: string
  targetRef: string
  hasCredential: boolean
  cluster: string
}

export interface KagentiSummary {
  agentCount: number
  readyAgents: number
  buildCount: number
  activeBuilds: number
  toolCount: number
  cardCount: number
  spiffeBound: number
  spiffeTotal: number
  clusterBreakdown: { cluster: string; agents: number }[]
  frameworks: Record<string, number>
}

// ─── Demo Data ─────────────────────────────────────────────────────

function getDemoAgents(): KagentiAgent[] {
  return [
    { name: 'code-review-agent', namespace: 'kagenti-system', status: 'Running', replicas: 2, readyReplicas: 2, framework: 'langgraph', protocol: 'a2a', image: 'ghcr.io/kagenti/code-review:v0.3.1', cluster: 'prod-east', createdAt: '2025-01-15T10:00:00Z' },
    { name: 'incident-responder', namespace: 'kagenti-system', status: 'Running', replicas: 1, readyReplicas: 1, framework: 'crewai', protocol: 'a2a', image: 'ghcr.io/kagenti/incident:v0.2.0', cluster: 'prod-east', createdAt: '2025-01-20T08:00:00Z' },
    { name: 'security-scanner', namespace: 'kagenti-system', status: 'Running', replicas: 3, readyReplicas: 3, framework: 'langgraph', protocol: 'mcp', image: 'ghcr.io/kagenti/sec-scan:v1.0.0', cluster: 'prod-west', createdAt: '2025-01-10T12:00:00Z' },
    { name: 'cost-optimizer', namespace: 'kagenti-system', status: 'Running', replicas: 1, readyReplicas: 1, framework: 'ag2', protocol: 'a2a', image: 'ghcr.io/kagenti/cost-opt:v0.1.5', cluster: 'prod-west', createdAt: '2025-01-22T14:00:00Z' },
    { name: 'deploy-assistant', namespace: 'kagenti-system', status: 'Running', replicas: 2, readyReplicas: 2, framework: 'langgraph', protocol: 'a2a', image: 'ghcr.io/kagenti/deploy:v0.4.0', cluster: 'staging', createdAt: '2025-01-18T09:00:00Z' },
    { name: 'log-analyzer', namespace: 'kagenti-system', status: 'Pending', replicas: 1, readyReplicas: 0, framework: 'crewai', protocol: 'mcp', image: 'ghcr.io/kagenti/log-analyzer:v0.1.0', cluster: 'staging', createdAt: '2025-01-25T16:00:00Z' },
    { name: 'drift-detector', namespace: 'kagenti-ops', status: 'Running', replicas: 1, readyReplicas: 1, framework: 'langgraph', protocol: 'a2a', image: 'ghcr.io/kagenti/drift:v0.2.3', cluster: 'prod-east', createdAt: '2025-01-12T11:00:00Z' },
    { name: 'compliance-checker', namespace: 'kagenti-ops', status: 'Running', replicas: 1, readyReplicas: 1, framework: 'ag2', protocol: 'mcp', image: 'ghcr.io/kagenti/compliance:v0.3.0', cluster: 'prod-west', createdAt: '2025-01-14T13:00:00Z' },
  ]
}

function getDemoBuilds(): KagentiBuild[] {
  return [
    { name: 'code-review-agent-build-7', namespace: 'kagenti-system', status: 'Succeeded', source: 'github.com/org/code-review', pipeline: 'kaniko', mode: 'dockerfile', cluster: 'prod-east', startTime: '2025-01-25T10:00:00Z', completionTime: '2025-01-25T10:05:30Z' },
    { name: 'log-analyzer-build-1', namespace: 'kagenti-system', status: 'Building', source: 'github.com/org/log-analyzer', pipeline: 'buildpacks', mode: 'source', cluster: 'staging', startTime: '2025-01-25T15:30:00Z', completionTime: '' },
    { name: 'security-scanner-build-12', namespace: 'kagenti-system', status: 'Succeeded', source: 'github.com/org/sec-scan', pipeline: 'kaniko', mode: 'dockerfile', cluster: 'prod-west', startTime: '2025-01-24T08:00:00Z', completionTime: '2025-01-24T08:04:12Z' },
    { name: 'drift-detector-build-5', namespace: 'kagenti-ops', status: 'Failed', source: 'github.com/org/drift-detect', pipeline: 'kaniko', mode: 'dockerfile', cluster: 'prod-east', startTime: '2025-01-23T14:00:00Z', completionTime: '2025-01-23T14:02:45Z' },
  ]
}

function getDemoCards(): KagentiCard[] {
  return [
    { name: 'code-review-agent-card', namespace: 'kagenti-system', agentName: 'code-review-agent', skills: ['code-review', 'refactoring'], capabilities: ['streaming', 'tool-use'], syncPeriod: '30s', identityBinding: 'strict', cluster: 'prod-east' },
    { name: 'incident-responder-card', namespace: 'kagenti-system', agentName: 'incident-responder', skills: ['triage', 'escalation', 'remediation'], capabilities: ['streaming'], syncPeriod: '30s', identityBinding: 'strict', cluster: 'prod-east' },
    { name: 'security-scanner-card', namespace: 'kagenti-system', agentName: 'security-scanner', skills: ['vuln-scan', 'cve-check'], capabilities: ['batch'], syncPeriod: '60s', identityBinding: 'strict', cluster: 'prod-west' },
    { name: 'cost-optimizer-card', namespace: 'kagenti-system', agentName: 'cost-optimizer', skills: ['cost-analysis', 'right-sizing'], capabilities: ['streaming', 'tool-use'], syncPeriod: '30s', identityBinding: 'permissive', cluster: 'prod-west' },
    { name: 'deploy-assistant-card', namespace: 'kagenti-system', agentName: 'deploy-assistant', skills: ['deploy', 'rollback', 'canary'], capabilities: ['streaming', 'tool-use'], syncPeriod: '30s', identityBinding: 'strict', cluster: 'staging' },
    { name: 'log-analyzer-card', namespace: 'kagenti-system', agentName: 'log-analyzer', skills: ['log-parse', 'anomaly-detect'], capabilities: ['batch'], syncPeriod: '60s', identityBinding: 'none', cluster: 'staging' },
    { name: 'drift-detector-card', namespace: 'kagenti-ops', agentName: 'drift-detector', skills: ['git-diff', 'reconcile'], capabilities: ['streaming'], syncPeriod: '30s', identityBinding: 'strict', cluster: 'prod-east' },
    { name: 'compliance-checker-card', namespace: 'kagenti-ops', agentName: 'compliance-checker', skills: ['policy-check', 'audit'], capabilities: ['batch'], syncPeriod: '120s', identityBinding: 'permissive', cluster: 'prod-west' },
  ]
}

function getDemoTools(): KagentiTool[] {
  return [
    { name: 'kubectl-tool', namespace: 'kagenti-system', toolPrefix: 'kubectl', targetRef: 'kubectl-gateway', hasCredential: true, cluster: 'prod-east' },
    { name: 'github-tool', namespace: 'kagenti-system', toolPrefix: 'github', targetRef: 'github-gateway', hasCredential: true, cluster: 'prod-east' },
    { name: 'slack-tool', namespace: 'kagenti-system', toolPrefix: 'slack', targetRef: 'slack-gateway', hasCredential: true, cluster: 'prod-east' },
    { name: 'prometheus-tool', namespace: 'kagenti-system', toolPrefix: 'prometheus', targetRef: 'prom-gateway', hasCredential: false, cluster: 'prod-west' },
    { name: 'trivy-tool', namespace: 'kagenti-system', toolPrefix: 'trivy', targetRef: 'trivy-gateway', hasCredential: false, cluster: 'prod-west' },
    { name: 'helm-tool', namespace: 'kagenti-system', toolPrefix: 'helm', targetRef: 'helm-gateway', hasCredential: true, cluster: 'staging' },
  ]
}

// ─── Agent fetch helper ────────────────────────────────────────────

const AGENT_TIMEOUT = 15000

/** Classify a caught error into a user-friendly message. */
function classifyFetchError(err: unknown, path: string, cluster: string, status?: number): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'Kagenti request timed out'
  }
  if (err instanceof TypeError && /failed to fetch|networkerror|network request failed/i.test(err.message)) {
    return 'Kagenti agent not connected'
  }
  if (status === 401 || status === 403) {
    return `Authentication failed (${status}) for ${path}`
  }
  if (status === 404) {
    return `Kagenti endpoints not found (${path})`
  }
  if (status) {
    return `Agent returned HTTP ${status} for ${path} (cluster: ${cluster})`
  }
  const msg = err instanceof Error ? err.message : String(err)
  return msg || 'Unknown kagenti error'
}

async function agentFetch<T>(path: string, cluster: string, namespace?: string): Promise<T | null> {
  if (isAgentUnavailable()) return null

  const params = new URLSearchParams()
  params.append('cluster', cluster)
  if (namespace) params.append('namespace', namespace)

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT)
  try {
    const res = await sharedAgentFetch(`${LOCAL_AGENT_URL}${path}?${params}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' } })
    clearTimeout(tid)
    if (!res.ok) {
      const classified = classifyFetchError(null, path, cluster, res.status)
      throw new Error(classified)
    }
    return await res.json()
  } catch (err: unknown) {
    clearTimeout(tid)
    console.warn(`[kagenti] fetch failed for ${path} (cluster: ${cluster}):`, err)
    // If already classified (from !res.ok branch), re-throw as-is
    if (err instanceof Error && !(/^TypeError/.test(err.constructor.name) || err.name === 'AbortError')) {
      throw err
    }
    // Classify network/abort errors into friendly messages
    throw new Error(classifyFetchError(err, path, cluster))
  }
}

/** Fetch from agent across all reachable clusters.
 *  Throws if ALL clusters fail so the error propagates to the UI
 *  instead of silently falling back to demo data. */
async function agentFetchAllClusters<T>(
  path: string,
  key: string,
  namespace?: string,
  specificCluster?: string,
): Promise<T[]> {
  if (isAgentUnavailable()) return []

  const allClusters = clusterCacheRef.clusters.filter(c => c.reachable !== false && !c.name.includes('/'))
  const clusters = deduplicateClustersByServer(allClusters)
  if (clusters.length === 0) return []

  const targets = specificCluster
    ? clusters.filter(c => c.name === specificCluster)
    : clusters

  const results = await mapSettledWithConcurrency(
    targets,
    async ({ name, context }) => {
      const data = await agentFetch<Record<string, unknown>>(path, context || name, namespace)
      if (!data) throw new Error('No data')
      const items = (data[key] || []) as T[]
      return items.map(item => ({ ...item, cluster: name }))
    },
  )

  const items: T[] = []
  const errors: string[] = []
  for (const r of (results || [])) {
    if (r.status === 'fulfilled') items.push(...r.value)
    else errors.push(r.reason?.message || 'unknown error')
  }

  // If every cluster failed, deduplicate errors and throw a concise message
  if (items.length === 0 && errors.length > 0) {
    const uniqueErrors = [...new Set(errors)]
    const clusterCount = errors.length
    const suffix = clusterCount > 1 ? ` (all ${clusterCount} clusters failed)` : ''
    throw new Error(`${uniqueErrors.join('; ')}${suffix}`)
  }

  return items
}

// ─── Hooks ─────────────────────────────────────────────────────────

export function useKagentiAgents(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentiAgent[]>({
    key: `kagenti-agents:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentiAgent[],
    demoData: getDemoAgents(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const agents = await agentFetchAllClusters<KagentiAgent>(
        '/kagenti/agents', 'agents', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return agents
    } })
}

export function useKagentiBuilds(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentiBuild[]>({
    key: `kagenti-builds:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentiBuild[],
    demoData: getDemoBuilds(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const builds = await agentFetchAllClusters<KagentiBuild>(
        '/kagenti/builds', 'builds', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return builds
    } })
}

export function useKagentiCards(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentiCard[]>({
    key: `kagenti-cards:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentiCard[],
    demoData: getDemoCards(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const cards = await agentFetchAllClusters<KagentiCard>(
        '/kagenti/cards', 'cards', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return cards
    } })
}

export function useKagentiTools(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentiTool[]>({
    key: `kagenti-tools:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentiTool[],
    demoData: getDemoTools(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const tools = await agentFetchAllClusters<KagentiTool>(
        '/kagenti/tools', 'tools', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return tools
    } })
}

/** Aggregated summary computed from all kagenti sub-hooks */
export function useKagentiSummary() {
  const { data: agents, isLoading: agentsLoading, error: agentsError, refetch: refetchAgents, isDemoFallback: agentsDemo } = useKagentiAgents()
  const { data: builds, isLoading: buildsLoading, refetch: refetchBuilds, isDemoFallback: buildsDemo } = useKagentiBuilds()
  const { data: cards, isLoading: cardsLoading, refetch: refetchCards, isDemoFallback: cardsDemo } = useKagentiCards()
  const { data: tools, isLoading: toolsLoading, refetch: refetchTools, isDemoFallback: toolsDemo } = useKagentiTools()

  const isLoading = agentsLoading || buildsLoading || cardsLoading || toolsLoading
  const isDemoData = agentsDemo || buildsDemo || cardsDemo || toolsDemo
  const error = agentsError

  const summary = useMemo((): KagentiSummary | null => {
    if (agents.length === 0 && builds.length === 0 && tools.length === 0 && cards.length === 0 && isLoading) {
      return null
    }

    const frameworks: Record<string, number> = {}
    for (const a of (agents || [])) {
      frameworks[a.framework] = (frameworks[a.framework] || 0) + 1
    }

    const clusterMap = new Map<string, number>()
    for (const a of (agents || [])) {
      clusterMap.set(a.cluster, (clusterMap.get(a.cluster) || 0) + 1)
    }

    const spiffeTotal = cards.length
    // Only count cards with an explicit, non-empty binding that is not "none".
    // Empty string (missing field) must NOT be counted as SPIFFE-bound.
    const spiffeBound = cards.filter(c =>
      c.identityBinding !== '' && c.identityBinding !== 'none',
    ).length

    return {
      agentCount: agents.length,
      readyAgents: agents.filter(a => a.status === 'Running' && a.readyReplicas > 0).length,
      buildCount: builds.length,
      activeBuilds: builds.filter(b => b.status === 'Building').length,
      toolCount: tools.length,
      cardCount: cards.length,
      spiffeBound,
      spiffeTotal,
      clusterBreakdown: Array.from(clusterMap.entries()).map(([cluster, count]) => ({ cluster, agents: count })),
      frameworks }
  }, [agents, builds, cards, tools, isLoading])

  const refetch = async () => {
    await Promise.all([refetchAgents(), refetchBuilds(), refetchCards(), refetchTools()])
  }

  return { summary, isLoading, isDemoData, error, refetch }
}
