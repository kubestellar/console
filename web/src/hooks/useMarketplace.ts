import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { addCustomTheme, removeCustomTheme } from '../lib/themes'

const REGISTRY_URL = 'https://raw.githubusercontent.com/kubestellar/console-marketplace/main/registry.json'
const CACHE_KEY = 'kc-marketplace-registry'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const INSTALLED_KEY = 'kc-marketplace-installed'

export type MarketplaceItemType = 'dashboard' | 'card-preset' | 'theme'

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
  themeColors?: string[] // Preview colors for theme items
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
  const [installedItems, setInstalledItems] = useState<InstalledMap>(loadInstalled)

  const fetchRegistry = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Check localStorage cache
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

  // Collect all unique tags
  const allTags = Array.from(new Set(items.flatMap(i => i.tags))).sort()

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTag = !selectedTag || item.tags.includes(selectedTag)
    const matchesType = !selectedType || item.type === selectedType
    return matchesSearch && matchesTag && matchesType
  })

  return {
    items: filteredItems,
    allItems: items,
    allTags,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    selectedType,
    setSelectedType,
    installItem,
    removeItem,
    isInstalled,
    refresh: fetchRegistry,
  }
}
