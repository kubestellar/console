import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const REGISTRY_URL = 'https://raw.githubusercontent.com/kubestellar/console-marketplace/main/registry.json'
const CACHE_KEY = 'kc-marketplace-registry'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

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
  type: 'dashboard' | 'card-preset' | 'theme'
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

export function useMarketplace() {
  const [items, setItems] = useState<MarketplaceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

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

  const installItem = useCallback(async (item: MarketplaceItem) => {
    const response = await fetch(item.downloadUrl)
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    const dashboardJson = await response.json()
    const { data } = await api.post('/api/dashboards/import', dashboardJson)
    return data
  }, [])

  // Collect all unique tags
  const allTags = Array.from(new Set(items.flatMap(i => i.tags))).sort()

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTag = !selectedTag || item.tags.includes(selectedTag)
    return matchesSearch && matchesTag
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
    installItem,
    refresh: fetchRegistry,
  }
}
