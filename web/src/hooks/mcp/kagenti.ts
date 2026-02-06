import { useState, useEffect, useCallback, useRef } from 'react'
import { isAgentUnavailable, reportAgentDataSuccess, reportAgentDataError } from '../useLocalAgent'
import { clusterCacheRef, LOCAL_AGENT_URL, getEffectiveInterval } from './shared'

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
  frameworks: Record<string, number>
}

// ─── Agent fetch helper ────────────────────────────────────────────

const AGENT_TIMEOUT = 15000
const POLL_INTERVAL = 60000

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
  const [data, setData] = useState<KagentiAgent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      const agents = await agentFetchAllClusters<KagentiAgent>(
        '/kagenti/agents', 'agents', options?.namespace, options?.cluster,
      )
      if (agents !== null && mountedRef.current) {
        setData(agents)
        setError(null)
        setConsecutiveFailures(0)
        reportAgentDataSuccess()
      }
    } catch {
      if (mountedRef.current) {
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
    return () => { mountedRef.current = false; clearInterval(interval) }
  }, [fetchData])

  return { data, isLoading, error, consecutiveFailures, isRefreshing, refetch: fetchData }
}

export function useKagentiBuilds(options?: { cluster?: string; namespace?: string }) {
  const [data, setData] = useState<KagentiBuild[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      const builds = await agentFetchAllClusters<KagentiBuild>(
        '/kagenti/builds', 'builds', options?.namespace, options?.cluster,
      )
      if (builds !== null && mountedRef.current) {
        setData(builds)
        setError(null)
        setConsecutiveFailures(0)
        reportAgentDataSuccess()
      }
    } catch {
      if (mountedRef.current) {
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
    return () => { mountedRef.current = false; clearInterval(interval) }
  }, [fetchData])

  return { data, isLoading, error, consecutiveFailures, isRefreshing, refetch: fetchData }
}

export function useKagentiCards(options?: { cluster?: string; namespace?: string }) {
  const [data, setData] = useState<KagentiCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      const cards = await agentFetchAllClusters<KagentiCard>(
        '/kagenti/cards', 'cards', options?.namespace, options?.cluster,
      )
      if (cards !== null && mountedRef.current) {
        setData(cards)
        setError(null)
        setConsecutiveFailures(0)
        reportAgentDataSuccess()
      }
    } catch {
      if (mountedRef.current) {
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
    return () => { mountedRef.current = false; clearInterval(interval) }
  }, [fetchData])

  return { data, isLoading, error, consecutiveFailures, isRefreshing, refetch: fetchData }
}

export function useKagentiTools(options?: { cluster?: string; namespace?: string }) {
  const [data, setData] = useState<KagentiTool[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      const tools = await agentFetchAllClusters<KagentiTool>(
        '/kagenti/tools', 'tools', options?.namespace, options?.cluster,
      )
      if (tools !== null && mountedRef.current) {
        setData(tools)
        setError(null)
        setConsecutiveFailures(0)
        reportAgentDataSuccess()
      }
    } catch {
      if (mountedRef.current) {
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
    return () => { mountedRef.current = false; clearInterval(interval) }
  }, [fetchData])

  return { data, isLoading, error, consecutiveFailures, isRefreshing, refetch: fetchData }
}
