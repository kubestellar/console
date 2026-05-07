import { useEffect, useRef } from 'react'
import { useCache } from '../lib/cache'
import { useClusters } from './mcp/clusters'
import { detectCloudProvider, getProviderLabel } from '../components/ui/CloudProviderIcon'
import type { CloudProvider } from '../components/ui/CloudProviderIcon'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { agentFetch } from './mcp/shared'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { isInClusterMode } from './useBackendHealth'

/** Health status of a single provider */
export interface ProviderHealthInfo {
  id: string
  name: string
  category: 'ai' | 'cloud'
  status: 'operational' | 'degraded' | 'down' | 'unknown'
  configured: boolean
  statusUrl?: string
  detail?: string
}

/** Status page URLs for known providers — extensible */
const STATUS_PAGES: Record<string, string> = {
  // AI providers
  anthropic: 'https://status.claude.com',
  openai: 'https://status.openai.com',
  google: 'https://aistudio.google.com/status',
  // Cloud providers
  eks: 'https://health.aws.amazon.com/health/status',
  gke: 'https://status.cloud.google.com',
  aks: 'https://status.azure.com/en-us/status',
  openshift: 'https://status.redhat.com',
  oci: 'https://ocistatus.oraclecloud.com',
  alibaba: 'https://status.alibabacloud.com',
  digitalocean: 'https://status.digitalocean.com',
  rancher: 'https://status.rancher.com' }

/** Display name mapping for AI providers */
const AI_PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  claude: 'Anthropic (Claude)',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
  gemini: 'Google (Gemini)',
  bob: 'Bob (Built-in)',
  'anthropic-local': 'Claude Code (Local)' }

/** Normalize AI provider ID for dedup and status lookup */
function normalizeAIProvider(provider: string): string {
  if (provider === 'claude') return 'anthropic'
  if (provider === 'gemini') return 'google'
  if (provider === 'anthropic-local') return 'anthropic-local'
  return provider
}

interface KeyStatus {
  provider: string
  displayName: string
  configured: boolean
  source?: 'env' | 'config'
  valid?: boolean
  error?: string
}

interface KeysStatusResponse {
  keys: KeyStatus[]
  configPath: string
}

/** Demo data — shows a realistic set of providers all operational */
const DEMO_PROVIDERS: ProviderHealthInfo[] = [
  { id: 'anthropic', name: 'Anthropic (Claude)', category: 'ai', status: 'operational', configured: true, statusUrl: STATUS_PAGES.anthropic, detail: 'API key configured' },
  { id: 'openai', name: 'OpenAI', category: 'ai', status: 'operational', configured: true, statusUrl: STATUS_PAGES.openai, detail: 'API key configured' },
  { id: 'google', name: 'Google (Gemini)', category: 'ai', status: 'operational', configured: true, statusUrl: STATUS_PAGES.google, detail: 'API key configured' },
  { id: 'eks', name: 'AWS EKS', category: 'cloud', status: 'operational', configured: true, statusUrl: STATUS_PAGES.eks, detail: '3 clusters' },
  { id: 'gke', name: 'Google GKE', category: 'cloud', status: 'operational', configured: true, statusUrl: STATUS_PAGES.gke, detail: '2 clusters' },
  { id: 'aks', name: 'Azure AKS', category: 'cloud', status: 'operational', configured: true, statusUrl: STATUS_PAGES.aks, detail: '1 cluster' },
  { id: 'openshift', name: 'OpenShift', category: 'cloud', status: 'operational', configured: true, statusUrl: STATUS_PAGES.openshift, detail: '1 cluster' },
  { id: 'oci', name: 'Oracle OKE', category: 'cloud', status: 'operational', configured: true, statusUrl: STATUS_PAGES.oci, detail: '1 cluster' },
]

/** Fetch AI + Cloud providers and their health status */
async function fetchProviders(clusterSnapshot: Array<{ name: string; server?: string; namespaces?: string[]; user?: string }>): Promise<ProviderHealthInfo[]> {
  const result: ProviderHealthInfo[] = []

  if (isInClusterMode()) {
    return result
  }

  // --- AI Providers from /settings/keys ---
  try {
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/settings/keys`, {
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    if (response.ok) {
      const data: KeysStatusResponse = await response.json()
      const seen = new Set<string>()
      for (const key of (data.keys || [])) {
        // Skip unconfigured providers — they shouldn't appear in the health card.
        // Local LLM runners (Ollama, LM Studio, etc.) are always registered in
        // the backend but should only show up here if explicitly configured via
        // API key or base URL env var/config (#12377).
        if (!key.configured) {
          continue
        }

        const normalized = normalizeAIProvider(key.provider)
        if (seen.has(normalized)) continue
        seen.add(normalized)

        const name = AI_PROVIDER_NAMES[key.provider] || key.displayName || key.provider
        let status: ProviderHealthInfo['status'] = 'unknown'
        let detail: string | undefined

        if (key.valid === true) {
          status = 'operational'
          detail = 'API key configured and valid'
        } else if (key.valid === false) {
          status = 'down'
          detail = key.error || 'API key invalid'
        } else {
          status = 'operational'
          detail = 'API key configured'
        }

        result.push({
          id: normalized,
          name,
          category: 'ai',
          status,
          configured: true,
          statusUrl: STATUS_PAGES[normalized],
          detail })
      }
    }
  } catch {
    // Agent unreachable — no AI providers to show
  }

  // --- Cloud Providers from cluster distributions ---
  if (clusterSnapshot.length > 0) {
    const providerCounts = new Map<CloudProvider, number>()
    for (const cluster of clusterSnapshot) {
      const provider = detectCloudProvider(
        cluster.name,
        cluster.server,
        cluster.namespaces,
        cluster.user,
      )
      // Skip generic/local providers — only show real cloud platforms
      if (provider === 'kubernetes' || provider === 'kind' || provider === 'minikube' || provider === 'k3s') {
        continue
      }
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1)
    }

    for (const [provider, count] of providerCounts) {
      result.push({
        id: provider,
        name: getProviderLabel(provider),
        category: 'cloud',
        status: 'operational',
        configured: true,
        statusUrl: STATUS_PAGES[provider],
        detail: `${count} cluster${count !== 1 ? 's' : ''} detected` })
    }
  }

  return result
}

/**
 * Hook that discovers AI + Cloud providers and reports their health.
 * Uses useCache for persistent caching, SWR, and demo fallback.
 */
export function useProviderHealth() {
  const { deduplicatedClusters: clusters } = useClusters()

  // Always use a stable cache key — refetch when the cluster set changes
  const clustersRef = useRef(clusters)
  clustersRef.current = clusters

  const cacheResult = useCache<ProviderHealthInfo[]>({
    key: 'provider-health',
    category: 'default',
    initialData: [],
    demoData: DEMO_PROVIDERS,
    demoWhenEmpty: true,
    fetcher: () => fetchProviders(clustersRef.current),
    refreshInterval: 60_000 })

  // Re-fetch when the cluster count changes (cloud provider list depends on clusters)
  const prevClusterCountRef = useRef<number | null>(null)
  useEffect(() => {
    if (prevClusterCountRef.current === null) {
      prevClusterCountRef.current = clusters.length
      return
    }
    if (clusters.length !== prevClusterCountRef.current) {
      prevClusterCountRef.current = clusters.length
      void cacheResult.refetch()
    }
  }, [clusters.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const aiProviders = (cacheResult.data || []).filter(p => p.category === 'ai')
  const cloudProviders = (cacheResult.data || []).filter(p => p.category === 'cloud')

  // Don't signal demo fallback while still loading — card should show skeleton, not demo data
  const effectiveIsDemoFallback = cacheResult.isDemoFallback && !cacheResult.isLoading

  return {
    providers: cacheResult.data,
    aiProviders,
    cloudProviders,
    isLoading: cacheResult.isLoading,
    isRefreshing: cacheResult.isRefreshing,
    isDemoFallback: effectiveIsDemoFallback,
    isFailed: cacheResult.isFailed,
    consecutiveFailures: cacheResult.consecutiveFailures,
    refetch: cacheResult.refetch }
}
