import { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from 'react'
import { api } from '../lib/api'
import { addCustomTheme, removeCustomTheme } from '../lib/themes'
import { emitMarketplaceInstall, emitMarketplaceRemove, emitMarketplaceInstallFailed } from '../lib/analytics'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../lib/constants/network'
import { isCardTypeRegistered } from '../components/cards/cardRegistry'
import { getDefaultCardSize } from '../components/dashboard/dashboardUtils'

// Minimal shape needed from GET /api/dashboards to locate the target
// dashboard for marketplace card-preset installs. The real DashboardData
// type is defined in components/dashboard; we only need id + is_default
// here so we keep the dependency narrow.
interface DashboardSummary {
  id: string
  is_default?: boolean
}

const REGISTRY_URL = 'https://raw.githubusercontent.com/kubestellar/console-marketplace/main/registry.json'
const CACHE_KEY = 'kc-marketplace-registry'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const INSTALLED_KEY = 'kc-marketplace-installed'

export type MarketplaceItemType = 'dashboard' | 'card-preset' | 'theme'
export type MarketplaceItemStatus = 'available' | 'help-wanted'
export type MarketplaceDifficulty = 'beginner' | 'intermediate' | 'advanced'

export interface CNCFProjectInfo {
  maturity: 'graduated' | 'incubating'
  category: string
  website?: string
}

export interface MarketplaceItem {
  id: string
  name: string
  description: string
  author: string
  authorGithub?: string
  version: string
  screenshot?: string
  downloadUrl: string
  tags: string[]
  cardCount: number
  type: MarketplaceItemType
  themeColors?: string[]
  status?: MarketplaceItemStatus
  issueUrl?: string
  difficulty?: MarketplaceDifficulty
  skills?: string[]
  cncfProject?: CNCFProjectInfo
}

export interface CNCFStats {
  total: number
  completed: number
  helpWanted: number
  graduatedTotal: number
  incubatingTotal: number
}

interface MarketplaceRegistry {
  version: string
  updatedAt: string
  items: MarketplaceItem[]
  /** Card presets, themes, and CNCF project presets — separate key in the registry */
  presets?: MarketplaceItem[]
}

interface CachedRegistry {
  data: MarketplaceRegistry
  fetchedAt: number
}

/**
 * Maps marketplace item IDs to their implemented card type in the card registry.
 * When the external marketplace registry still marks a card as "help-wanted" but
 * the card has since been implemented in this repo, we auto-correct the status
 * so the marketplace shows it as available instead of "not yet implemented."
 *
 * This avoids waiting for the external console-marketplace repo to catch up.
 */
const MARKETPLACE_TO_CARD_TYPE: Record<string, string> = {
  'cncf-karmada': 'karmada_status',
  'cncf-keda': 'keda_status',
  'cncf-etcd': 'etcd_status',
  'cncf-fluentd': 'fluentd_status',
  'cncf-crio': 'crio_status',
  'cncf-backstage': 'backstage_status',
  'cncf-containerd': 'containerd_status',
  'cncf-dragonfly': 'dragonfly_status',
  'cncf-cloudevents': 'cloudevents_status',
  'cncf-crossplane': 'crossplane_managed_resources',
  'cncf-buildpacks': 'buildpacks_status',
  'cncf-kubevirt': 'kubevirt_status',
  'cncf-kubevela': 'kubevela_status',
  'cncf-lima': 'lima_status',
  'cncf-flux': 'flux_status',
  'cncf-contour': 'contour_status',
  'cncf-dapr': 'dapr_status',
  'cncf-envoy': 'envoy_status',
  'cncf-grpc': 'grpc_status',
  'cncf-linkerd': 'linkerd_status',
  'cncf-openfeature': 'openfeature_status',
  'cncf-rook': 'rook_status',
  'cncf-spiffe': 'spiffe_status',
  'cncf-strimzi': 'strimzi_status',
  'cncf-thanos': 'thanos_status',
  'cncf-opentelemetry': 'otel_status',
  'cncf-tikv': 'tikv_status',
  'cncf-tuf': 'tuf_status',
  'cncf-vitess': 'vitess_status',
}

/**
 * Reconcile marketplace items against the local card registry.
 * Items marked "help-wanted" whose cards are already implemented get
 * promoted to "available" with the help-wanted tag removed.
 */
function reconcileImplementedCards(items: MarketplaceItem[]): MarketplaceItem[] {
  return items.map(item => {
    if (item.status !== 'help-wanted') return item
    const cardType = MARKETPLACE_TO_CARD_TYPE[item.id]
    if (!cardType || !isCardTypeRegistered(cardType)) return item
    return {
      ...item,
      status: 'available' as MarketplaceItemStatus,
      tags: item.tags.filter(t => t !== 'help-wanted') }
  })
}

/** Merge items + presets from the registry into a single array */
function mergeRegistryItems(registry: MarketplaceRegistry): MarketplaceItem[] {
  return reconcileImplementedCards([...(registry.items || []), ...(registry.presets || [])])
}

interface InstalledEntry {
  dashboardId?: string
  installedAt: string
  type: MarketplaceItemType
}

type InstalledMap = Record<string, InstalledEntry>

function loadInstalled(): InstalledMap {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(INSTALLED_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveInstalled(map: InstalledMap): void {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(map))
  } catch {
    // Non-critical
  }
}

// ── Cross-tab sync (#7542) ────────────────────────────────────────────
// Listeners are notified whenever the installed-items map changes so that
// other browser tabs (or multiple useMarketplace mounts) stay in sync.
let installedSnapshot = loadInstalled()
const installedListeners = new Set<() => void>()

function subscribeInstalled(cb: () => void) {
  installedListeners.add(cb)
  return () => { installedListeners.delete(cb) }
}

function getInstalledSnapshot(): InstalledMap { return installedSnapshot }
const emptyInstalledMap: InstalledMap = {}

function notifyInstalledChange() {
  installedSnapshot = loadInstalled()
  installedListeners.forEach(cb => cb())
}

// Listen for cross-tab localStorage changes (#7542)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === INSTALLED_KEY) notifyInstalledChange()
  })
}

export interface InstallResult {
  type: MarketplaceItemType
  data?: unknown
}

export function useMarketplace() {
  const [items, setItems] = useState<MarketplaceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<MarketplaceItemType | null>(null)
  const [showHelpWanted, setShowHelpWanted] = useState(false)
  // Use cross-tab-aware external store for installed items (#7542)
  const installedItems: InstalledMap = useSyncExternalStore(subscribeInstalled, getInstalledSnapshot, () => emptyInstalledMap)

  const fetchRegistry = useCallback(async (skipCache = false) => {
    setIsLoading(true)
    setError(null)

    // On manual refresh, clear the localStorage cache so stale data never persists
    if (skipCache) {
      try { localStorage.removeItem(CACHE_KEY) } catch { /* non-critical */ }
    }

    // Check localStorage cache (skip on manual refresh)
    if (!skipCache) {
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed: CachedRegistry = JSON.parse(cached)
          if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
            setItems(mergeRegistryItems(parsed.data))
            setIsLoading(false)
            return
          }
        }
      } catch {
        // Cache read failed — continue to fetch
      }
    }

    try {
      const response = await fetch(REGISTRY_URL, {
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
      if (!response.ok) throw new Error(`Registry fetch failed: ${response.status}`)
      const data: MarketplaceRegistry = await response.json()
      setItems(mergeRegistryItems(data))

      // Cache the result
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data,
          fetchedAt: Date.now() }))
      } catch {
        // Cache write failed — non-critical
      }
    } catch (err) {
      // #7543: On fetch failure, keep cached/current items with a stale indicator
      // instead of clearing to empty which falsely implies no items exist.
      const staleMsg = err instanceof Error ? err.message : 'Failed to load marketplace'
      setError(staleMsg)
      // Only fall back to empty if we truly have nothing to show
      if (items.length === 0) {
        try {
          const cached = localStorage.getItem(CACHE_KEY)
          if (cached) {
            const parsed: CachedRegistry = JSON.parse(cached)
            setItems(mergeRegistryItems(parsed.data))
          }
        } catch { /* no cached fallback available */ }
      }
    } finally {
      setIsLoading(false)
    }
  }, [items.length])

  useEffect(() => {
    fetchRegistry()
  }, [fetchRegistry])

  // #7539: Reconcile installed-dashboard state against the backend so items
  // deleted outside the marketplace are no longer shown as "installed".
  const reconcileRef = useRef(false)
  useEffect(() => {
    if (reconcileRef.current) return
    reconcileRef.current = true

    const dashboardEntries = (Object.entries(installedItems) as [string, InstalledEntry][]).filter(
      ([, entry]) => entry.type === 'dashboard' && entry.dashboardId
    )
    if (dashboardEntries.length === 0) return

    api.get<{ id: string }[]>('/api/dashboards').then(({ data: dashboards }) => {
      const ids = new Set((dashboards || []).map(d => d.id))
      let changed = false
      for (const [itemId, entry] of dashboardEntries) {
        if (entry.dashboardId && !ids.has(entry.dashboardId)) {
          markUninstalled(itemId)
          changed = true
        }
      }
      if (changed) notifyInstalledChange()
    }).catch(() => { /* reconciliation is best-effort */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const markInstalled = (itemId: string, entry: InstalledEntry) => {
    const next = { ...installedSnapshot, [itemId]: entry }
    saveInstalled(next)
    notifyInstalledChange()
  }

  const markUninstalled = (itemId: string) => {
    const next = { ...installedSnapshot }
    delete next[itemId]
    saveInstalled(next)
    notifyInstalledChange()
  }

  const isInstalled = (itemId: string): boolean => {
    return itemId in installedItems
  }

  const getInstalledDashboardId = (itemId: string): string | undefined => {
    return installedItems[itemId]?.dashboardId
  }

  const installItem = async (item: MarketplaceItem): Promise<InstallResult> => {
    let response: Response
    try {
      response = await fetch(item.downloadUrl, {
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'network error'
      emitMarketplaceInstallFailed(item.type, item.name, msg)
      throw e
    }
    if (!response.ok) {
      emitMarketplaceInstallFailed(item.type, item.name, `HTTP ${response.status}`)
      throw new Error(`Download failed: ${response.status}`)
    }
    const json = await response.json()

    if (item.type === 'card-preset') {
      // Persist the card to the backend so it survives a hard refresh.
      // Previously this mutated localStorage directly, which worked only
      // until the Dashboard rehydrated from GET /api/dashboards — at that
      // point the installed card disappeared because the backend never
      // heard about it (#6620, reported by @AAdIprog; supersedes the
      // localStorage workaround from #4780).
      const { card_type, config, title } = json as {
        card_type?: string
        config?: Record<string, unknown>
        title?: string
      }
      if (!card_type) {
        const msg = 'card-preset payload missing card_type'
        emitMarketplaceInstallFailed(item.type, item.name, msg)
        throw new Error(msg)
      }

      const size = getDefaultCardSize(card_type)
      const newCard = {
        id: `mp-${Date.now()}`,
        card_type,
        config: config || {},
        title,
        position: { x: 0, y: 0, ...size } }

      // Resolve the target dashboard the same way Dashboard.tsx does in
      // loadDashboard(): prefer the default dashboard, fall back to the
      // first one returned. Matching Dashboard's canonical path here is
      // important so that installed cards land on the same surface the
      // user sees on the home page.
      try {
        const { data: dashboards } = await api.get<DashboardSummary[]>('/api/dashboards')
        const target = (dashboards || []).find(d => d.is_default) || (dashboards || [])[0]
        if (!target?.id) {
          throw new Error('no dashboard available to install card-preset into')
        }
        await api.post(`/api/dashboards/${target.id}/cards`, newCard)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'backend persist failed'
        emitMarketplaceInstallFailed(item.type, item.name, msg)
        throw e
      }

      // Notify a mounted Dashboard so it can append the card to its
      // in-memory state without waiting for the next loadDashboard().
      // This is fired AFTER the POST succeeds so the dispatched event
      // always reflects a durable write.
      window.dispatchEvent(new CustomEvent('kc-add-card-from-marketplace', { detail: json }))
      markInstalled(item.id, { installedAt: new Date().toISOString(), type: 'card-preset' })
      emitMarketplaceInstall(item.type, item.name)
      return { type: 'card-preset', data: json }
    }

    if (item.type === 'theme') {
      addCustomTheme(json)
      window.dispatchEvent(new Event('kc-custom-themes-changed'))
      markInstalled(item.id, { installedAt: new Date().toISOString(), type: 'theme' })
      emitMarketplaceInstall(item.type, item.name)
      return { type: 'theme', data: json }
    }

    // Dashboard — import via API
    const { data } = await api.post<{ id: string }>('/api/dashboards/import', json)
    markInstalled(item.id, {
      dashboardId: data?.id,
      installedAt: new Date().toISOString(),
      type: 'dashboard' })
    emitMarketplaceInstall(item.type, item.name)
    return { type: 'dashboard', data }
  }

  const removeItem = async (item: MarketplaceItem) => {
    const entry = installedItems[item.id]
    if (!entry) return

    if (entry.type === 'dashboard' && entry.dashboardId) {
      // #7540: Gracefully handle already-deleted resources — treat 404 as success
      try {
        await api.delete(`/api/dashboards/${entry.dashboardId}`)
      } catch (e: unknown) {
        const is404 = e instanceof Error && e.message.includes('404')
        if (!is404) throw e
        // Resource already gone — proceed with local cleanup
      }
    }

    if (entry.type === 'theme') {
      removeCustomTheme(item.id)
      window.dispatchEvent(new Event('kc-custom-themes-changed'))
    }

    // #7541: Always clear local state regardless of dashboardId presence
    markUninstalled(item.id)
    emitMarketplaceRemove(item.type)
  }

  // Collect all unique tags (exclude internal tags when not in help-wanted mode)
  const allTags = useMemo(() =>
    Array.from(new Set(items.flatMap(i => i.tags))).sort(),
    [items])

  // CNCF items derived from the full item list
  const cncfItems = useMemo(() => items.filter(i => i.cncfProject), [items])

  // CNCF stats
  const cncfStats: CNCFStats = useMemo(() => ({
    total: cncfItems.length,
    completed: cncfItems.filter((i: MarketplaceItem) => (i.status || 'available') === 'available').length,
    helpWanted: cncfItems.filter((i: MarketplaceItem) => i.status === 'help-wanted').length,
    graduatedTotal: cncfItems.filter((i: MarketplaceItem) => i.cncfProject?.maturity === 'graduated').length,
    incubatingTotal: cncfItems.filter((i: MarketplaceItem) => i.cncfProject?.maturity === 'incubating').length }),
    [cncfItems])

  // CNCF categories (for grouping in help-wanted view)
  const cncfCategories = useMemo(() => Array.from(new Set(
    cncfItems.map((i: MarketplaceItem) => i.cncfProject!.category)
  )).sort(), [cncfItems])

  // Type counts (for filter badges)
  const typeCounts: Record<string, number> = useMemo(() => ({
    all: items.length,
    dashboard: items.filter(i => i.type === 'dashboard').length,
    'card-preset': items.filter(i => i.type === 'card-preset').length,
    theme: items.filter(i => i.type === 'theme').length }),
    [items])

  // Filter items
  const filteredItems = useMemo(() => items.filter(item => {
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTag = !selectedTag || (item.tags || []).includes(selectedTag)
    const matchesType = !selectedType || item.type === selectedType
    const matchesStatus = !showHelpWanted || item.status === 'help-wanted'
    return matchesSearch && matchesTag && matchesType && matchesStatus
  }), [items, searchQuery, selectedTag, selectedType, showHelpWanted])

  return {
    items: filteredItems,
    allItems: items,
    allTags,
    typeCounts,
    cncfStats,
    cncfCategories,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    selectedType,
    setSelectedType,
    showHelpWanted,
    setShowHelpWanted,
    installItem,
    removeItem,
    isInstalled,
    getInstalledDashboardId,
    refresh: () => fetchRegistry(true) }
}

// --- Author Profile Hook ---

const AUTHOR_CACHE_PREFIX = 'kc-author-'
const AUTHOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface AuthorProfile {
  consolePRs: number
  marketplacePRs: number
  coins: number
  loading: boolean
}

interface CachedAuthorProfile {
  consolePRs: number
  marketplacePRs: number
  fetchedAt: number
}

const COINS_PER_PR = 100

export function useAuthorProfile(handle?: string, enabled = false): AuthorProfile {
  const [profile, setProfile] = useState<AuthorProfile>({
    consolePRs: 0,
    marketplacePRs: 0,
    coins: 0,
    loading: false })
  const fetchedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!handle || !enabled || fetchedRef.current === handle) return

    // Check cache first
    try {
      const cached = localStorage.getItem(`${AUTHOR_CACHE_PREFIX}${handle}`)
      if (cached) {
        const parsed: CachedAuthorProfile = JSON.parse(cached)
        if (Date.now() - parsed.fetchedAt < AUTHOR_CACHE_TTL_MS) {
          const total = parsed.consolePRs + parsed.marketplacePRs
          setProfile({
            consolePRs: parsed.consolePRs,
            marketplacePRs: parsed.marketplacePRs,
            coins: total * COINS_PER_PR,
            loading: false })
          fetchedRef.current = handle
          return
        }
      }
    } catch {
      // Cache read failed
    }

    let cancelled = false
    fetchedRef.current = handle
    setProfile(prev => ({ ...prev, loading: true }))

    const fetchPRCount = async (repo: string): Promise<number> => {
      try {
        const res = await fetch(
          `https://api.github.com/search/issues?q=author:${encodeURIComponent(handle)}+repo:${repo}+type:pr+is:merged&per_page=1`,
          { signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) }
        )
        if (!res.ok) return 0
        const data = await res.json()
        return data.total_count ?? 0
      } catch {
        return 0
      }
    }

    Promise.all([
      fetchPRCount('kubestellar/console'),
      fetchPRCount('kubestellar/console-marketplace'),
    ]).then(([consolePRs, marketplacePRs]) => {
      if (cancelled) return
      const total = consolePRs + marketplacePRs
      const result = {
        consolePRs,
        marketplacePRs,
        coins: total * COINS_PER_PR,
        loading: false }
      setProfile(result)

      // Cache the result
      try {
        localStorage.setItem(
          `${AUTHOR_CACHE_PREFIX}${handle}`,
          JSON.stringify({ consolePRs, marketplacePRs, fetchedAt: Date.now() })
        )
      } catch {
        // Non-critical
      }
    }).catch(() => { /* fetchPRCount always resolves — defensive catch */ })

    return () => { cancelled = true }
  }, [handle, enabled])

  return profile
}
