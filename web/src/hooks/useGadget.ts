/**
 * Hooks for Inspektor Gadget eBPF-powered observability.
 * Uses the ig-mcp-server bridge via /api/gadget/* endpoints.
 */

import { useCache, type RefreshCategory } from '../lib/cache'
import { authFetch } from '../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

// Types for gadget data

export interface GadgetStatus {
  available: boolean
  toolCount?: number
  reason?: string
  install?: string
}

export interface NetworkTraceEntry {
  srcPod: string
  srcNamespace: string
  dstPod: string
  dstNamespace: string
  dstPort: number
  protocol: string
  bytes: number
  cluster: string
  timestamp: string
}

export interface DNSTraceEntry {
  pod: string
  namespace: string
  query: string
  queryType: string
  responseCode: string
  latencyMs: number
  cluster: string
  timestamp: string
}

export interface ProcessTraceEntry {
  pod: string
  namespace: string
  container: string
  binary: string
  args: string
  uid: number
  cluster: string
  timestamp: string
}

export interface SecurityAuditEntry {
  pod: string
  namespace: string
  syscall: string
  action: string
  capability: string
  cluster: string
  timestamp: string
}

// Demo data

function getDemoNetworkTraces(): NetworkTraceEntry[] {
  return [
    { srcPod: 'frontend-7d8f9', srcNamespace: 'default', dstPod: 'api-server-4b2c1', dstNamespace: 'default', dstPort: 8080, protocol: 'TCP', bytes: 4096, cluster: 'kind-ks1', timestamp: new Date().toISOString() },
    { srcPod: 'api-server-4b2c1', srcNamespace: 'default', dstPod: 'postgres-0', dstNamespace: 'database', dstPort: 5432, protocol: 'TCP', bytes: 2048, cluster: 'kind-ks1', timestamp: new Date().toISOString() },
    { srcPod: 'worker-a1f3e', srcNamespace: 'jobs', dstPod: 'redis-master-0', dstNamespace: 'cache', dstPort: 6379, protocol: 'TCP', bytes: 512, cluster: 'kind-ks2', timestamp: new Date().toISOString() },
    { srcPod: 'ingress-nginx-5c7d2', srcNamespace: 'ingress', dstPod: 'frontend-7d8f9', dstNamespace: 'default', dstPort: 3000, protocol: 'TCP', bytes: 8192, cluster: 'kind-ks1', timestamp: new Date().toISOString() },
  ]
}

function getDemoDNSTraces(): DNSTraceEntry[] {
  return [
    { pod: 'frontend-7d8f9', namespace: 'default', query: 'api-server.default.svc.cluster.local', queryType: 'A', responseCode: 'NOERROR', latencyMs: 1.2, cluster: 'kind-ks1', timestamp: new Date().toISOString() },
    { pod: 'api-server-4b2c1', namespace: 'default', query: 'postgres.database.svc.cluster.local', queryType: 'A', responseCode: 'NOERROR', latencyMs: 0.8, cluster: 'kind-ks1', timestamp: new Date().toISOString() },
    { pod: 'worker-a1f3e', namespace: 'jobs', query: 'external-api.example.com', queryType: 'A', responseCode: 'NOERROR', latencyMs: 12.5, cluster: 'kind-ks2', timestamp: new Date().toISOString() },
    { pod: 'debug-pod-1', namespace: 'default', query: 'nonexistent.svc.cluster.local', queryType: 'A', responseCode: 'NXDOMAIN', latencyMs: 3.1, cluster: 'kind-ks1', timestamp: new Date().toISOString() },
  ]
}

function getDemoProcessTraces(): ProcessTraceEntry[] {
  return [
    { pod: 'api-server-4b2c1', namespace: 'default', container: 'api', binary: '/usr/local/bin/node', args: 'server.js', uid: 1000, cluster: 'kind-ks1', timestamp: new Date().toISOString() },
    { pod: 'worker-a1f3e', namespace: 'jobs', container: 'worker', binary: '/usr/bin/python3', args: 'process_job.py --queue=main', uid: 1000, cluster: 'kind-ks2', timestamp: new Date().toISOString() },
    { pod: 'postgres-0', namespace: 'database', container: 'postgres', binary: '/usr/lib/postgresql/15/bin/postgres', args: '-D /var/lib/postgresql/data', uid: 999, cluster: 'kind-ks1', timestamp: new Date().toISOString() },
  ]
}

function getDemoSecurityAudit(): SecurityAuditEntry[] {
  return [
    { pod: 'debug-pod-1', namespace: 'default', syscall: 'ptrace', action: 'SCMP_ACT_ERRNO', capability: 'CAP_SYS_PTRACE', cluster: 'kind-ks1', timestamp: new Date().toISOString() },
    { pod: 'worker-a1f3e', namespace: 'jobs', syscall: 'mount', action: 'SCMP_ACT_ERRNO', capability: 'CAP_SYS_ADMIN', cluster: 'kind-ks2', timestamp: new Date().toISOString() },
  ]
}

// Fetcher helper

async function fetchGadgetTrace<T>(tool: string, args?: Record<string, unknown>): Promise<T> {
  const resp = await authFetch(`${API_BASE}/api/gadget/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args: args || {} }),
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`Gadget trace failed: ${resp.status}`)
  }

  const data = await resp.json()
  if (data.isError) {
    throw new Error(data.result?.content?.[0]?.text || 'Gadget tool error')
  }

  // Parse result content — IG MCP server returns text JSON
  const content = data.result?.content || data.result?.Content || []
  for (const item of (content || [])) {
    const text = item.text || item.Text || ''
    if (text) {
      try {
        return JSON.parse(text)
      } catch {
        // Return raw text wrapped
        return text as unknown as T
      }
    }
  }

  return [] as unknown as T
}

// Hooks

export function useGadgetStatus(): { status: GadgetStatus; isLoading: boolean } {
  const result = useCache({
    key: 'gadget:status',
    category: 'slow' as RefreshCategory,
    initialData: { available: false } as GadgetStatus,
    demoData: { available: false, reason: 'demo mode' } as GadgetStatus,
    fetcher: async () => {
      const resp = await authFetch(`${API_BASE}/api/gadget/status`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!resp.ok) throw new Error('Failed to check gadget status')
      return resp.json()
    },
  })

  return {
    status: result.data,
    isLoading: result.isLoading,
  }
}

export function useCachedNetworkTraces(cluster?: string, namespace?: string) {
  const key = `gadget:network:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category: 'realtime' as RefreshCategory,
    initialData: [] as NetworkTraceEntry[],
    demoData: getDemoNetworkTraces(),
    fetcher: async () => {
      const args: Record<string, unknown> = {}
      if (cluster) args.cluster = cluster
      if (namespace) args.namespace = namespace
      return fetchGadgetTrace<NetworkTraceEntry[]>('trace_tcp', args)
    },
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoData: result.isDemoFallback && !result.isLoading,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
  }
}

export function useCachedDNSTraces(cluster?: string, namespace?: string) {
  const key = `gadget:dns:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category: 'realtime' as RefreshCategory,
    initialData: [] as DNSTraceEntry[],
    demoData: getDemoDNSTraces(),
    fetcher: async () => {
      const args: Record<string, unknown> = {}
      if (cluster) args.cluster = cluster
      if (namespace) args.namespace = namespace
      return fetchGadgetTrace<DNSTraceEntry[]>('trace_dns', args)
    },
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoData: result.isDemoFallback && !result.isLoading,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
  }
}

export function useCachedProcessTraces(cluster?: string, namespace?: string) {
  const key = `gadget:process:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category: 'realtime' as RefreshCategory,
    initialData: [] as ProcessTraceEntry[],
    demoData: getDemoProcessTraces(),
    fetcher: async () => {
      const args: Record<string, unknown> = {}
      if (cluster) args.cluster = cluster
      if (namespace) args.namespace = namespace
      return fetchGadgetTrace<ProcessTraceEntry[]>('trace_exec', args)
    },
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoData: result.isDemoFallback && !result.isLoading,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
  }
}

export function useCachedSecurityAudit(cluster?: string, namespace?: string) {
  const key = `gadget:security:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category: 'normal' as RefreshCategory,
    initialData: [] as SecurityAuditEntry[],
    demoData: getDemoSecurityAudit(),
    fetcher: async () => {
      const args: Record<string, unknown> = {}
      if (cluster) args.cluster = cluster
      if (namespace) args.namespace = namespace
      return fetchGadgetTrace<SecurityAuditEntry[]>('audit_seccomp', args)
    },
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoData: result.isDemoFallback && !result.isLoading,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
  }
}
