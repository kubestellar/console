import { useState, useEffect, useCallback, useRef } from 'react'
import { getDemoMode } from './useDemoMode'
import { useClusters } from './mcp/clusters'
import { detectCloudProvider, getProviderLabel } from '../components/ui/CloudProviderIcon'
import type { CloudProvider } from '../components/ui/CloudProviderIcon'

const KC_AGENT_URL = 'http://127.0.0.1:8585'
const REFRESH_INTERVAL = 60_000 // 60 seconds

/** Health status of a single provider */
export interface ProviderHealthInfo {
  id: string
  name: string
  category: 'ai' | 'cloud'
  status: 'operational' | 'degraded' | 'down' | 'unknown' | 'not_configured'
  statusUrl?: string
  detail?: string
}

/** Status page URLs for known providers — extensible */
const STATUS_PAGES: Record<string, string> = {
  // AI providers
  anthropic: 'https://status.anthropic.com',
  openai: 'https://status.openai.com',
  google: 'https://status.cloud.google.com',
  // Cloud providers
  eks: 'https://health.aws.amazon.com/health/status',
  gke: 'https://status.cloud.google.com',
  aks: 'https://status.azure.com/en-us/status',
  openshift: 'https://status.redhat.com',
  oci: 'https://ocistatus.oraclecloud.com',
  alibaba: 'https://status.alibabacloud.com',
  digitalocean: 'https://status.digitalocean.com',
  rancher: 'https://status.rancher.com',
}

/** Display name mapping for AI providers */
const AI_PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  claude: 'Anthropic (Claude)',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
  gemini: 'Google (Gemini)',
  bob: 'Bob (Built-in)',
  'anthropic-local': 'Claude Code (Local)',
}

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
function getDemoProviders(): ProviderHealthInfo[] {
  return [
    { id: 'anthropic', name: 'Anthropic (Claude)', category: 'ai', status: 'operational', statusUrl: STATUS_PAGES.anthropic, detail: 'API key configured' },
    { id: 'openai', name: 'OpenAI', category: 'ai', status: 'operational', statusUrl: STATUS_PAGES.openai, detail: 'API key configured' },
    { id: 'google', name: 'Google (Gemini)', category: 'ai', status: 'operational', statusUrl: STATUS_PAGES.google, detail: 'API key configured' },
    { id: 'eks', name: 'AWS EKS', category: 'cloud', status: 'operational', statusUrl: STATUS_PAGES.eks, detail: '3 clusters' },
    { id: 'gke', name: 'Google GKE', category: 'cloud', status: 'operational', statusUrl: STATUS_PAGES.gke, detail: '2 clusters' },
    { id: 'aks', name: 'Azure AKS', category: 'cloud', status: 'operational', statusUrl: STATUS_PAGES.aks, detail: '1 cluster' },
    { id: 'openshift', name: 'OpenShift', category: 'cloud', status: 'operational', statusUrl: STATUS_PAGES.openshift, detail: '1 cluster' },
    { id: 'oci', name: 'Oracle OKE', category: 'cloud', status: 'operational', statusUrl: STATUS_PAGES.oci, detail: '1 cluster' },
  ]
}

/**
 * Hook that discovers AI + Cloud providers and reports their health.
 * AI providers come from the backend /settings/keys endpoint.
 * Cloud providers are detected from cluster distributions.
 * Auto-refreshes every 60 seconds.
 */
export function useProviderHealth() {
  const [providers, setProviders] = useState<ProviderHealthInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const { clusters } = useClusters()

  const fetchProviders = useCallback(async () => {
    if (getDemoMode()) {
      setProviders(getDemoProviders())
      setIsLoading(false)
      return
    }

    const result: ProviderHealthInfo[] = []

    // --- AI Providers from /settings/keys ---
    try {
      const response = await fetch(`${KC_AGENT_URL}/settings/keys`)
      if (response.ok) {
        const data: KeysStatusResponse = await response.json()
        const seen = new Set<string>()
        for (const key of data.keys) {
          const normalized = normalizeAIProvider(key.provider)
          if (seen.has(normalized)) continue
          seen.add(normalized)

          const name = AI_PROVIDER_NAMES[key.provider] || key.displayName || key.provider
          let status: ProviderHealthInfo['status'] = 'unknown'
          let detail: string | undefined

          if (key.configured) {
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
          } else {
            status = 'not_configured'
            detail = 'API key not configured'
          }

          result.push({
            id: normalized,
            name,
            category: 'ai',
            status,
            statusUrl: STATUS_PAGES[normalized],
            detail,
          })
        }
      }
    } catch {
      // Agent unreachable — no AI providers to show
    }

    // --- Cloud Providers from cluster distributions ---
    if (clusters.length > 0) {
      const providerCounts = new Map<CloudProvider, number>()
      for (const cluster of clusters) {
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
          statusUrl: STATUS_PAGES[provider],
          detail: `${count} cluster${count !== 1 ? 's' : ''} detected`,
        })
      }
    }

    setProviders(result)
    setIsLoading(false)
  }, [clusters])

  useEffect(() => {
    fetchProviders()
    intervalRef.current = setInterval(fetchProviders, REFRESH_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchProviders])

  const aiProviders = providers.filter(p => p.category === 'ai')
  const cloudProviders = providers.filter(p => p.category === 'cloud')

  return { providers, aiProviders, cloudProviders, isLoading, refetch: fetchProviders }
}
