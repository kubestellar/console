import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { isAgentUnavailable, reportAgentDataSuccess, reportAgentDataError } from '../useLocalAgent'
import { clusterCacheRef, LOCAL_AGENT_URL, getEffectiveInterval } from './shared'
import { isDemoMode, isNetlifyDeployment } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerRefetch } from '../../lib/modeTransition'

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
const POLL_INTERVAL = 60000

function shouldUseDemoData(): boolean {
  return isDemoMode() || isNetlifyDeployment
}

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
): Promise<T[] | null> {
  if (isAgentUnavailable()) return null

  const clusters = clusterCacheRef.clusters.filter(c => c.reachable !== false && !c.name.includes('/'))
  if (clusters.length === 0) return null

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
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.length > 0 || targets.length > 0 ? items : null
}

// ─── Hooks ─────────────────────────────────────────────────────────

export function useKagentiAgents(options?: { cluster?: string; namespace?: string }) {
  const [data, setData] = useState<KagentiAgent[]>(() => shouldUseDemoData() ? getDemoAgents() : [])
  const [isLoading, setIsLoading] = useState(!shouldUseDemoData())
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    // Demo data is already set in initial state - skip to avoid re-render flicker
    if (shouldUseDemoData()) return

    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      const agents = await agentFetchAllClusters<KagentiAgent>(
        '/kagenti/agents', 'agents', options?.namespace, options?.cluster,
      )
      // Use real data only if non-empty; fallback to demo data for demo-only cards
      if (agents !== null && agents.length > 0 && mountedRef.current) {
        setData(agents)
        setError(null)
        setConsecutiveFailures(0)
        reportAgentDataSuccess()
      } else if (mountedRef.current) {
        setData(getDemoAgents())
      }
    } catch {
      if (mountedRef.current) {
        setData(getDemoAgents())
        setConsecutiveFailures(prev => prev + 1)
        reportAgentDataError('/kagenti/agents', 'fetch failed')
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [options?.cluster, options?.namespace])

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    const interval = setInterval(() => fetchData(true), getEffectiveInterval(POLL_INTERVAL))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`kagenti-agents:${options?.cluster || 'all'}:${options?.namespace || 'all'}`, () => fetchData(false))

    return () => {
      mountedRef.current = false
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [fetchData, options?.cluster, options?.namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    // Re-set initial data based on current mode
    if (shouldUseDemoData()) {
      setData(getDemoAgents())
      setIsLoading(false)
    } else {
      fetchData(false)
    }
  }, [demoMode, fetchData])

  return { data, isLoading, error, consecutiveFailures, isRefreshing, refetch: fetchData }
}

export function useKagentiBuilds(options?: { cluster?: string; namespace?: string }) {
  const [data, setData] = useState<KagentiBuild[]>(() => shouldUseDemoData() ? getDemoBuilds() : [])
  const [isLoading, setIsLoading] = useState(!shouldUseDemoData())
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    // Demo data is already set in initial state - skip to avoid re-render flicker
    if (shouldUseDemoData()) return

    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      const builds = await agentFetchAllClusters<KagentiBuild>(
        '/kagenti/builds', 'builds', options?.namespace, options?.cluster,
      )
      // Use real data only if non-empty; fallback to demo data for demo-only cards
      if (builds !== null && builds.length > 0 && mountedRef.current) {
        setData(builds)
        setError(null)
        setConsecutiveFailures(0)
        reportAgentDataSuccess()
      } else if (mountedRef.current) {
        setData(getDemoBuilds())
      }
    } catch {
      if (mountedRef.current) {
        setData(getDemoBuilds())
        setConsecutiveFailures(prev => prev + 1)
        reportAgentDataError('/kagenti/builds', 'fetch failed')
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [options?.cluster, options?.namespace])

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    const interval = setInterval(() => fetchData(true), getEffectiveInterval(POLL_INTERVAL))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`kagenti-builds:${options?.cluster || 'all'}:${options?.namespace || 'all'}`, () => fetchData(false))

    return () => {
      mountedRef.current = false
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [fetchData, options?.cluster, options?.namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    if (shouldUseDemoData()) {
      setData(getDemoBuilds())
      setIsLoading(false)
    } else {
      fetchData(false)
    }
  }, [demoMode, fetchData])

  return { data, isLoading, error, consecutiveFailures, isRefreshing, refetch: fetchData }
}

export function useKagentiCards(options?: { cluster?: string; namespace?: string }) {
  const [data, setData] = useState<KagentiCard[]>(() => shouldUseDemoData() ? getDemoCards() : [])
  const [isLoading, setIsLoading] = useState(!shouldUseDemoData())
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    // Demo data is already set in initial state - skip to avoid re-render flicker
    if (shouldUseDemoData()) return

    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      const cards = await agentFetchAllClusters<KagentiCard>(
        '/kagenti/cards', 'cards', options?.namespace, options?.cluster,
      )
      // Use real data only if non-empty; fallback to demo data for demo-only cards
      if (cards !== null && cards.length > 0 && mountedRef.current) {
        setData(cards)
        setError(null)
        setConsecutiveFailures(0)
        reportAgentDataSuccess()
      } else if (mountedRef.current) {
        setData(getDemoCards())
      }
    } catch {
      if (mountedRef.current) {
        setData(getDemoCards())
        setConsecutiveFailures(prev => prev + 1)
        reportAgentDataError('/kagenti/cards', 'fetch failed')
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [options?.cluster, options?.namespace])

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    const interval = setInterval(() => fetchData(true), getEffectiveInterval(POLL_INTERVAL))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`kagenti-cards:${options?.cluster || 'all'}:${options?.namespace || 'all'}`, () => fetchData(false))

    return () => {
      mountedRef.current = false
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [fetchData, options?.cluster, options?.namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    if (shouldUseDemoData()) {
      setData(getDemoCards())
      setIsLoading(false)
    } else {
      fetchData(false)
    }
  }, [demoMode, fetchData])

  return { data, isLoading, error, consecutiveFailures, isRefreshing, refetch: fetchData }
}

export function useKagentiTools(options?: { cluster?: string; namespace?: string }) {
  const [data, setData] = useState<KagentiTool[]>(() => shouldUseDemoData() ? getDemoTools() : [])
  const [isLoading, setIsLoading] = useState(!shouldUseDemoData())
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    // Demo data is already set in initial state - skip to avoid re-render flicker
    if (shouldUseDemoData()) return

    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      const tools = await agentFetchAllClusters<KagentiTool>(
        '/kagenti/tools', 'tools', options?.namespace, options?.cluster,
      )
      // Use real data only if non-empty; fallback to demo data for demo-only cards
      if (tools !== null && tools.length > 0 && mountedRef.current) {
        setData(tools)
        setError(null)
        setConsecutiveFailures(0)
        reportAgentDataSuccess()
      } else if (mountedRef.current) {
        setData(getDemoTools())
      }
    } catch {
      if (mountedRef.current) {
        setData(getDemoTools())
        setConsecutiveFailures(prev => prev + 1)
        reportAgentDataError('/kagenti/tools', 'fetch failed')
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [options?.cluster, options?.namespace])

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    const interval = setInterval(() => fetchData(true), getEffectiveInterval(POLL_INTERVAL))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`kagenti-tools:${options?.cluster || 'all'}:${options?.namespace || 'all'}`, () => fetchData(false))

    return () => {
      mountedRef.current = false
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [fetchData, options?.cluster, options?.namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    if (shouldUseDemoData()) {
      setData(getDemoTools())
      setIsLoading(false)
    } else {
      fetchData(false)
    }
  }, [demoMode, fetchData])

  return { data, isLoading, error, consecutiveFailures, isRefreshing, refetch: fetchData }
}

/** Aggregated summary computed from all kagenti sub-hooks */
export function useKagentiSummary() {
  const { data: agents, isLoading: agentsLoading, error: agentsError, refetch: refetchAgents } = useKagentiAgents()
  const { data: builds, isLoading: buildsLoading, refetch: refetchBuilds } = useKagentiBuilds()
  const { data: cards, isLoading: cardsLoading, refetch: refetchCards } = useKagentiCards()
  const { data: tools, isLoading: toolsLoading, refetch: refetchTools } = useKagentiTools()

  const isLoading = agentsLoading || buildsLoading || cardsLoading || toolsLoading
  const error = agentsError

  const summary = useMemo((): KagentiSummary | null => {
    if (agents.length === 0 && builds.length === 0 && tools.length === 0 && cards.length === 0 && isLoading) {
      return null
    }

    const frameworks: Record<string, number> = {}
    for (const a of agents) {
      frameworks[a.framework] = (frameworks[a.framework] || 0) + 1
    }

    const clusterMap = new Map<string, number>()
    for (const a of agents) {
      clusterMap.set(a.cluster, (clusterMap.get(a.cluster) || 0) + 1)
    }

    const spiffeTotal = cards.length
    const spiffeBound = cards.filter(c => c.identityBinding !== 'none').length

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
      frameworks,
    }
  }, [agents, builds, cards, tools, isLoading])

  const refetch = useCallback(async () => {
    await Promise.all([refetchAgents(), refetchBuilds(), refetchCards(), refetchTools()])
  }, [refetchAgents, refetchBuilds, refetchCards, refetchTools])

  return { summary, isLoading, error, refetch }
}
