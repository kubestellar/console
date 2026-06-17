import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../analytics-core', () => ({
  send: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
  emitError: vi.fn(),
}))

vi.mock('../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('../analytics-session', () => ({
  getDeploymentType: vi.fn(() => 'localhost'),
}))

import { send, setAnalyticsUserProperties, emitError } from '../analytics-core'
import { isDemoMode } from '../demoMode'
import { getDeploymentType } from '../analytics-session'
import { CAPABILITY_TOOL_EXEC, CAPABILITY_CHAT } from '../analytics-types'
import * as analytics from '../analytics-events'

const mockSend = vi.mocked(send)
const mockSetProps = vi.mocked(setAnalyticsUserProperties)
const mockEmitError = vi.mocked(emitError)
const mockIsDemoMode = vi.mocked(isDemoMode)
const mockGetDeploymentType = vi.mocked(getDeploymentType)

describe('analytics-events/cards', () => {
  beforeEach(() => {
    mockSend.mockClear()
    mockSetProps.mockClear()
    mockEmitError.mockClear()
    mockIsDemoMode.mockClear()
    mockGetDeploymentType.mockClear()
    mockIsDemoMode.mockReturnValue(false)
    mockGetDeploymentType.mockReturnValue('localhost')
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('Dashboard & Cards', () => {
    it('analytics.emitCardAdded sends card_type and source', () => {
      analytics.emitCardAdded('pods', 'customize')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_added', { card_type: 'pods', source: 'customize' })
    })

    it('analytics.emitCardRemoved sends card_type', () => {
      analytics.emitCardRemoved('pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_removed', { card_type: 'pods' })
    })

    it('analytics.emitCardExpanded sends card_type', () => {
      analytics.emitCardExpanded('events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_expanded', { card_type: 'events' })
    })

    it('analytics.emitCardDragged sends card_type', () => {
      analytics.emitCardDragged('pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_dragged', { card_type: 'pods' })
    })

    it('analytics.emitCardConfigured sends card_type', () => {
      analytics.emitCardConfigured('cluster-health')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_configured', { card_type: 'cluster-health' })
    })

    it('analytics.emitCardReplaced sends old and new types', () => {
      analytics.emitCardReplaced('old-card', 'new-card')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_replaced', { old_type: 'old-card', new_type: 'new-card' })
    })
  })

  describe('Global Search', () => {
    it('analytics.emitGlobalSearchOpened sends method', () => {
      analytics.emitGlobalSearchOpened('keyboard')
      expect(mockSend).toHaveBeenCalledWith('ksc_global_search_opened', { method: 'keyboard' })
    })

    it('analytics.emitGlobalSearchQueried sends query length and result count', () => {
      analytics.emitGlobalSearchQueried(5, 10)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_search_queried', { query_length: 5, result_count: 10 })
    })

    it('analytics.emitGlobalSearchSelected sends category and result index', () => {
      analytics.emitGlobalSearchSelected('cards', 2)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_search_selected', { category: 'cards', result_index: 2 })
    })

    it('analytics.emitGlobalSearchAskAI sends query length', () => {
      analytics.emitGlobalSearchAskAI(15)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_search_ask_ai', { query_length: 15 })
    })
  })

  describe('Card Interactions', () => {
    it('analytics.emitCardSortChanged sends sort field, card type, and page path', () => {
      analytics.emitCardSortChanged('name', 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_sort_changed', {
        sort_field: 'name',
        card_type: 'pods',
        page_path: expect.any(String),
      })
    })

    it('analytics.emitCardSortDirectionChanged sends direction and card type', () => {
      analytics.emitCardSortDirectionChanged('asc', 'events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_sort_direction_changed', {
        direction: 'asc',
        card_type: 'events',
        page_path: expect.any(String),
      })
    })

    it('analytics.emitCardLimitChanged sends limit and card type', () => {
      analytics.emitCardLimitChanged('50', 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_limit_changed', {
        limit: '50',
        card_type: 'pods',
        page_path: expect.any(String),
      })
    })

    it('analytics.emitCardSearchUsed sends query length and card type', () => {
      analytics.emitCardSearchUsed(10, 'events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_search_used', {
        query_length: 10,
        card_type: 'events',
        page_path: expect.any(String),
      })
    })

    it('analytics.emitCardClusterFilterChanged sends counts and card type', () => {
      analytics.emitCardClusterFilterChanged(2, 5, 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_cluster_filter_changed', {
        selected_count: 2,
        total_count: 5,
        card_type: 'pods',
        page_path: expect.any(String),
      })
    })

    it('analytics.emitCardPaginationUsed sends page and total pages', () => {
      analytics.emitCardPaginationUsed(3, 10, 'events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_pagination_used', {
        page: 3,
        total_pages: 10,
        card_type: 'events',
        page_path: expect.any(String),
      })
    })

    it('analytics.emitCardListItemClicked sends card type', () => {
      analytics.emitCardListItemClicked('deployments')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_list_item_clicked', {
        card_type: 'deployments',
        page_path: expect.any(String),
      })
    })
  })

  describe('Card Recommendations', () => {
    it('analytics.emitCardRecommendationsShown sends card and high priority counts', () => {
      analytics.emitCardRecommendationsShown(8, 3)
      expect(mockSend).toHaveBeenCalledWith('ksc_card_recommendations_shown', { card_count: 8, high_priority_count: 3 })
    })

    it('analytics.emitCardRecommendationActioned sends card type and priority', () => {
      analytics.emitCardRecommendationActioned('security', 'high')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_recommendation_actioned', { card_type: 'security', priority: 'high' })
    })
  })

  describe('Drill-Down', () => {
    it('analytics.emitDrillDownOpened sends view type', () => {
      analytics.emitDrillDownOpened('pod')
      expect(mockSend).toHaveBeenCalledWith('ksc_drill_down_opened', { view_type: 'pod' })
    })

    it('analytics.emitDrillDownClosed sends view type and depth', () => {
      analytics.emitDrillDownClosed('pod', 2)
      expect(mockSend).toHaveBeenCalledWith('ksc_drill_down_closed', { view_type: 'pod', depth: 2 })
    })
  })

  describe('Card Refresh', () => {
    it('analytics.emitCardRefreshed sends card type', () => {
      analytics.emitCardRefreshed('events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_refreshed', { card_type: 'events' })
    })
  })

  describe('Global Filters', () => {
    it('analytics.emitGlobalClusterFilterChanged sends counts', () => {
      analytics.emitGlobalClusterFilterChanged(3, 10)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_cluster_filter_changed', { selected_count: 3, total_count: 10 })
    })

    it('analytics.emitGlobalSeverityFilterChanged sends selected count', () => {
      analytics.emitGlobalSeverityFilterChanged(2)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_severity_filter_changed', { selected_count: 2 })
    })

    it('analytics.emitGlobalStatusFilterChanged sends selected count', () => {
      analytics.emitGlobalStatusFilterChanged(4)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_status_filter_changed', { selected_count: 4 })
    })
  })

  describe('Card Modal Browsing', () => {
    it('analytics.emitCardCategoryBrowsed sends category', () => {
      analytics.emitCardCategoryBrowsed('monitoring')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_category_browsed', { category: 'monitoring' })
    })

    it('analytics.emitRecommendedCardShown sends card count and types', () => {
      analytics.emitRecommendedCardShown(['pods', 'events', 'gpu'])
      expect(mockSend).toHaveBeenCalledWith('ksc_recommended_cards_shown', {
        card_count: 3,
        card_types: 'pods,events,gpu',
      })
    })
  })

})
