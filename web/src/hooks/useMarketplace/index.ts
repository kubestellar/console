import { useEffect, useRef, useState } from 'react'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants/network'
import { MS_PER_DAY } from '../../lib/constants/time'
import { useMarketplaceActions, useInstalledMarketplaceItems, useReconcileInstalledDashboards } from './actions'
import { useCachedMarketplaceItems } from './demoData'
import { useMarketplaceFilters } from './filters'
import type { MarketplaceItemType } from './types'

export type {
  CNCFProjectInfo,
  CNCFStats,
  CommunityReview,
  HookActivity,
  HookEventType,
  HookStatus,
  InstallResult,
  LiveHook,
  MarketplaceDifficulty,
  MarketplaceItem,
  MarketplaceItemStatus,
  MarketplaceItemType,
  ReviewRating,
  ReviewSummary,
} from './types'

export function useMarketplace() {
  const { data: items, isLoading, error, refetch } = useCachedMarketplaceItems()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<MarketplaceItemType | null>(null)
  const [showHelpWanted, setShowHelpWanted] = useState(false)
  const installedItems = useInstalledMarketplaceItems()

  useReconcileInstalledDashboards(installedItems)

  const { allTags, cncfCategories, cncfStats, filteredItems, typeCounts } = useMarketplaceFilters({
    items,
    searchQuery,
    selectedTag,
    selectedType,
    showHelpWanted,
  })

  const { installItem, removeItem, isInstalled, getInstalledDashboardId } = useMarketplaceActions(installedItems)

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
    refresh: refetch,
  }
}

const AUTHOR_CACHE_PREFIX = 'kc-author-'
const AUTHOR_CACHE_TTL_MS = MS_PER_DAY
const COINS_PER_PR = 100

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

export function useAuthorProfile(handle?: string, enabled = false): AuthorProfile {
  const [profile, setProfile] = useState<AuthorProfile>({
    consolePRs: 0,
    marketplacePRs: 0,
    coins: 0,
    loading: false,
  })
  const fetchedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!handle || !enabled || fetchedRef.current === handle) return

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
            loading: false,
          })
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
        const response = await fetch(
          `https://api.github.com/search/issues?q=author:${encodeURIComponent(handle)}+repo:${repo}+type:pr+is:merged&per_page=1`,
          { signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) }
        )
        if (!response.ok) return 0
        const data = await response.json()
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
        loading: false,
      }
      setProfile(result)

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
