import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMarketplaceFilters } from '../filters'
import type { MarketplaceItem } from '../types'

const createMockItem = (overrides: Partial<MarketplaceItem> = {}): MarketplaceItem => ({
  id: 'test-item',
  name: 'Test Item',
  description: 'Test description',
  type: 'dashboard',
  tags: ['kubernetes', 'monitoring'],
  status: 'available',
  ...overrides,
})

describe('useMarketplaceFilters', () => {
  describe('allTags', () => {
    it('extracts and sorts all unique tags from items', () => {
      const items: MarketplaceItem[] = [
        createMockItem({ tags: ['kubernetes', 'monitoring'] }),
        createMockItem({ tags: ['security', 'kubernetes'] }),
        createMockItem({ tags: ['monitoring'] }),
      ]

      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: '',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.allTags).toEqual(['kubernetes', 'monitoring', 'security'])
    })

    it('returns empty array when no items', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items: [],
          searchQuery: '',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.allTags).toEqual([])
    })
  })

  describe('cncfStats', () => {
    it('calculates CNCF statistics correctly', () => {
      const items: MarketplaceItem[] = [
        createMockItem({
          cncfProject: {
            name: 'Kubernetes',
            maturity: 'graduated',
            category: 'Orchestration',
          },
          status: 'available',
        }),
        createMockItem({
          cncfProject: {
            name: 'Prometheus',
            maturity: 'graduated',
            category: 'Monitoring',
          },
          status: 'available',
        }),
        createMockItem({
          cncfProject: {
            name: 'ArgoCD',
            maturity: 'incubating',
            category: 'CI/CD',
          },
          status: 'help-wanted',
        }),
        createMockItem({ cncfProject: undefined }), // Non-CNCF item
      ]

      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: '',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.cncfStats).toEqual({
        total: 3,
        completed: 2,
        helpWanted: 1,
        graduatedTotal: 2,
        incubatingTotal: 1,
      })
    })

    it('returns zero stats when no CNCF items', () => {
      const items: MarketplaceItem[] = [
        createMockItem({ cncfProject: undefined }),
      ]

      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: '',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.cncfStats).toEqual({
        total: 0,
        completed: 0,
        helpWanted: 0,
        graduatedTotal: 0,
        incubatingTotal: 0,
      })
    })
  })

  describe('typeCounts', () => {
    it('counts items by type', () => {
      const items: MarketplaceItem[] = [
        createMockItem({ type: 'dashboard' }),
        createMockItem({ type: 'dashboard' }),
        createMockItem({ type: 'card-preset' }),
        createMockItem({ type: 'theme' }),
      ]

      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: '',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.typeCounts).toEqual({
        all: 4,
        dashboard: 2,
        'card-preset': 1,
        theme: 1,
      })
    })
  })

  describe('filteredItems', () => {
    const items: MarketplaceItem[] = [
      createMockItem({
        id: '1',
        name: 'Kubernetes Dashboard',
        description: 'Monitor your clusters',
        type: 'dashboard',
        tags: ['kubernetes', 'monitoring'],
        status: 'available',
      }),
      createMockItem({
        id: '2',
        name: 'Security Dashboard',
        description: 'Security monitoring',
        type: 'dashboard',
        tags: ['security', 'monitoring'],
        status: 'help-wanted',
      }),
      createMockItem({
        id: '3',
        name: 'Dark Theme',
        description: 'A dark color scheme',
        type: 'theme',
        tags: ['ui', 'theme'],
        status: 'available',
      }),
    ]

    it('filters by search query (name)', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: 'kubernetes',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.filteredItems).toHaveLength(1)
      expect(result.current.filteredItems[0].id).toBe('1')
    })

    it('filters by search query (description)', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: 'security',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.filteredItems).toHaveLength(1)
      expect(result.current.filteredItems[0].id).toBe('2')
    })

    it('filters by tag', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: '',
          selectedTag: 'monitoring',
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.filteredItems).toHaveLength(2)
      expect(result.current.filteredItems.map(i => i.id)).toEqual(['1', '2'])
    })

    it('filters by type', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: '',
          selectedTag: null,
          selectedType: 'theme',
          showHelpWanted: false,
        })
      )

      expect(result.current.filteredItems).toHaveLength(1)
      expect(result.current.filteredItems[0].id).toBe('3')
    })

    it('filters by help wanted status', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: '',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: true,
        })
      )

      expect(result.current.filteredItems).toHaveLength(1)
      expect(result.current.filteredItems[0].id).toBe('2')
    })

    it('combines multiple filters', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: 'dashboard',
          selectedTag: 'security',
          selectedType: 'dashboard',
          showHelpWanted: false,
        })
      )

      expect(result.current.filteredItems).toHaveLength(1)
      expect(result.current.filteredItems[0].id).toBe('2')
    })

    it('returns all items when no filters applied', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: '',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.filteredItems).toHaveLength(3)
    })

    it('returns empty array when no items match filters', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: 'nonexistent',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.filteredItems).toEqual([])
    })

    it('is case-insensitive for search', () => {
      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: 'KUBERNETES',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.filteredItems).toHaveLength(1)
      expect(result.current.filteredItems[0].id).toBe('1')
    })
  })

  describe('cncfCategories', () => {
    it('extracts and sorts unique CNCF categories', () => {
      const items: MarketplaceItem[] = [
        createMockItem({
          cncfProject: {
            name: 'Kubernetes',
            maturity: 'graduated',
            category: 'Orchestration',
          },
        }),
        createMockItem({
          cncfProject: {
            name: 'Prometheus',
            maturity: 'graduated',
            category: 'Monitoring',
          },
        }),
        createMockItem({
          cncfProject: {
            name: 'Grafana',
            maturity: 'incubating',
            category: 'Monitoring',
          },
        }),
      ]

      const { result } = renderHook(() =>
        useMarketplaceFilters({
          items,
          searchQuery: '',
          selectedTag: null,
          selectedType: null,
          showHelpWanted: false,
        })
      )

      expect(result.current.cncfCategories).toEqual(['Monitoring', 'Orchestration'])
    })
  })
})
