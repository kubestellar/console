// The marketplace registry is a public GitHub raw URL — no auth needed — so
// the fetcher must run in demo mode too.  Use useCache directly with
// liveInDemoMode: true (same pattern as useGitHubPipelines) rather than
// createCachedHook, which does not expose that flag.
import { useCache } from '@/lib/cache'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants/network'
import { mergeRegistryItems } from './actions'
import type { MarketplaceItem, MarketplaceRegistry } from './types'

const REGISTRY_URL = 'https://raw.githubusercontent.com/kubestellar/console-marketplace/main/registry.json'
const MARKETPLACE_CACHE_KEY = 'marketplace-registry'
const INITIAL_MARKETPLACE_ITEMS: MarketplaceItem[] = []

async function fetchMarketplaceItems(): Promise<MarketplaceItem[]> {
  const response = await fetch(REGISTRY_URL, {
    signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`Registry fetch failed: ${response.status}`)
  const data: MarketplaceRegistry = await response.json()
  return mergeRegistryItems(data)
}

export function useCachedMarketplaceItems() {
  return useCache<MarketplaceItem[]>({
    key: MARKETPLACE_CACHE_KEY,
    category: 'costs',
    initialData: INITIAL_MARKETPLACE_ITEMS,
    fetcher: fetchMarketplaceItems,
    liveInDemoMode: true, // registry is public; no auth required
  })
}
