import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { addCustomTheme, removeCustomTheme } from '../lib/themes'

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
}

interface CachedRegistry {
  data: MarketplaceRegistry
  fetchedAt: number
}

interface InstalledEntry {
  dashboardId?: string
  installedAt: string
  type: MarketplaceItemType
}

type InstalledMap = Record<string, InstalledEntry>

function loadInstalled(): InstalledMap {
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

export interface InstallResult {
  type: MarketplaceItemType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
}

export function useMarketplace() {
  const [items, setItems] = useState<MarketplaceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<MarketplaceItemType | null>(null)
  const [showHelpWanted, setShowHelpWanted] = useState(false)
  const [installedItems, setInstalledItems] = useState<InstalledMap>(loadInstalled)

  const fetchRegistry = useCallback(async (skipCache = false) => {
    setIsLoading(true)
    setError(null)

    // Check localStorage cache (skip on manual refresh)
    if (!skipCache) {
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed: CachedRegistry = JSON.parse(cached)
          if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
            setItems(parsed.data.items)
            setIsLoading(false)
            return
          }
        }
      } catch {
        // Cache read failed — continue to fetch
      }
    }

    try {
      const response = await fetch(REGISTRY_URL)
      if (!response.ok) throw new Error(`Registry fetch failed: ${response.status}`)
      const data: MarketplaceRegistry = await response.json()
      setItems(data.items || [])

      // Cache the result
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data,
          fetchedAt: Date.now(),
        }))
      } catch {
        // Cache write failed — non-critical
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace')
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRegistry()
  }, [fetchRegistry])

  const markInstalled = useCallback((itemId: string, entry: InstalledEntry) => {
    setInstalledItems(prev => {
      const next = { ...prev, [itemId]: entry }
      saveInstalled(next)
      return next
    })
  }, [])

  const markUninstalled = useCallback((itemId: string) => {
    setInstalledItems(prev => {
      const next = { ...prev }
      delete next[itemId]
      saveInstalled(next)
      return next
    })
  }, [])

  const isInstalled = useCallback((itemId: string): boolean => {
    return itemId in installedItems
  }, [installedItems])

  const getInstalledDashboardId = useCallback((itemId: string): string | undefined => {
    return installedItems[itemId]?.dashboardId
  }, [installedItems])

  const installItem = useCallback(async (item: MarketplaceItem): Promise<InstallResult> => {
    const response = await fetch(item.downloadUrl)
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    const json = await response.json()

    if (item.type === 'card-preset') {
      // Dispatch event for the active dashboard to pick up
      window.dispatchEvent(new CustomEvent('kc-add-card-from-marketplace', { detail: json }))
      markInstalled(item.id, { installedAt: new Date().toISOString(), type: 'card-preset' })
      return { type: 'card-preset', data: json }
    }

    if (item.type === 'theme') {
      addCustomTheme(json)
      window.dispatchEvent(new Event('kc-custom-themes-changed'))
      markInstalled(item.id, { installedAt: new Date().toISOString(), type: 'theme' })
      return { type: 'theme', data: json }
    }

    // Dashboard — import via API
    const { data } = await api.post('/api/dashboards/import', json)
    markInstalled(item.id, {
      dashboardId: data?.id,
      installedAt: new Date().toISOString(),
      type: 'dashboard',
    })
    return { type: 'dashboard', data }
  }, [markInstalled])

  const removeItem = useCallback(async (item: MarketplaceItem) => {
    const entry = installedItems[item.id]
    if (!entry) return

    if (entry.type === 'dashboard' && entry.dashboardId) {
      await api.delete(`/api/dashboards/${entry.dashboardId}`)
    }

    if (entry.type === 'theme') {
      removeCustomTheme(item.id)
      window.dispatchEvent(new Event('kc-custom-themes-changed'))
    }

    markUninstalled(item.id)
  }, [installedItems, markUninstalled])

  // Collect all unique tags (exclude internal tags when not in help-wanted mode)
  const allTags = Array.from(new Set(items.flatMap(i => i.tags))).sort()

  // CNCF stats
  const cncfItems = items.filter(i => i.cncfProject)
  const cncfStats: CNCFStats = {
    total: cncfItems.length,
    completed: cncfItems.filter(i => (i.status || 'available') === 'available').length,
    helpWanted: cncfItems.filter(i => i.status === 'help-wanted').length,
    graduatedTotal: cncfItems.filter(i => i.cncfProject?.maturity === 'graduated').length,
    incubatingTotal: cncfItems.filter(i => i.cncfProject?.maturity === 'incubating').length,
  }

  // CNCF categories (for grouping in help-wanted view)
  const cncfCategories = Array.from(new Set(
    cncfItems.map(i => i.cncfProject!.category)
  )).sort()

  // Type counts (for filter badges)
  const typeCounts: Record<string, number> = {
    all: items.length,
    dashboard: items.filter(i => i.type === 'dashboard').length,
    'card-preset': items.filter(i => i.type === 'card-preset').length,
    theme: items.filter(i => i.type === 'theme').length,
  }

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTag = !selectedTag || item.tags.includes(selectedTag)
    const matchesType = !selectedType || item.type === selectedType
    const matchesStatus = !showHelpWanted || item.status === 'help-wanted'
    return matchesSearch && matchesTag && matchesType && matchesStatus
  })

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
    refresh: () => fetchRegistry(true),
  }
}
