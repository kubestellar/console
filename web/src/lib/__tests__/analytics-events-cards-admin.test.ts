/**
 * Direct tests for lib/analytics-events/cards.ts and lib/analytics-events/admin.ts.
 *
 * Strategy: mock `lib/analytics-core` `send`, assert event names and params.
 * Several card fns read `window.location.pathname` — jsdom provides this.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../analytics-core', () => ({
  send: vi.fn(),
}))

import { send } from '../analytics-core'

import {
  emitCardAdded,
  emitCardRemoved,
  emitCardExpanded,
  emitCardDragged,
  emitCardConfigured,
  emitCardReplaced,
  emitGlobalSearchOpened,
  emitGlobalSearchQueried,
  emitGlobalSearchSelected,
  emitGlobalSearchAskAI,
  emitCardSortChanged,
  emitCardSortDirectionChanged,
  emitCardLimitChanged,
  emitCardSearchUsed,
  emitCardClusterFilterChanged,
  emitCardPaginationUsed,
  emitCardListItemClicked,
  emitCardRecommendationsShown,
  emitCardRecommendationActioned,
  emitAddCardModalOpened,
  emitAddCardModalAbandoned,
  emitCardCategoryBrowsed,
  emitRecommendedCardShown,
  emitCardRefreshed,
} from '../analytics-events/cards'

import {
  emitModalOpened,
  emitModalTabViewed,
  emitModalClosed,
  emitActionClicked,
  emitUserRoleChanged,
  emitUserRemoved,
  emitSidebarNavigated,
  emitGameStarted,
  emitGameEnded,
} from '../analytics-events/admin'

const mockSend = vi.mocked(send)

beforeEach(() => {
  mockSend.mockClear()
})

// ── analytics-events/cards.ts ─────────────────────────────────────────────────

describe('analytics-events/cards', () => {
  // Basic card CRUD
  it('emitCardAdded sends card_type and source', () => {
    emitCardAdded('pods', 'catalog')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_added', { card_type: 'pods', source: 'catalog' })
  })

  it('emitCardRemoved sends card_type', () => {
    emitCardRemoved('pods')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_removed', { card_type: 'pods' })
  })

  it('emitCardExpanded sends card_type', () => {
    emitCardExpanded('deployments')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_expanded', { card_type: 'deployments' })
  })

  it('emitCardDragged sends card_type', () => {
    emitCardDragged('nodes')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_dragged', { card_type: 'nodes' })
  })

  it('emitCardConfigured sends card_type', () => {
    emitCardConfigured('metrics')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_configured', { card_type: 'metrics' })
  })

  it('emitCardReplaced sends old_type and new_type', () => {
    emitCardReplaced('pods', 'deployments')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_replaced', { old_type: 'pods', new_type: 'deployments' })
  })

  // Global search
  it('emitGlobalSearchOpened sends method keyboard', () => {
    emitGlobalSearchOpened('keyboard')
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_opened', { method: 'keyboard' })
  })

  it('emitGlobalSearchOpened sends method click', () => {
    emitGlobalSearchOpened('click')
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_opened', { method: 'click' })
  })

  it('emitGlobalSearchQueried sends query_length and result_count', () => {
    emitGlobalSearchQueried(5, 10)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_queried', {
      query_length: 5,
      result_count: 10,
    })
  })

  it('emitGlobalSearchSelected sends category and result_index', () => {
    emitGlobalSearchSelected('clusters', 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_selected', {
      category: 'clusters',
      result_index: 2,
    })
  })

  it('emitGlobalSearchAskAI sends query_length', () => {
    emitGlobalSearchAskAI(7)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_ask_ai', { query_length: 7 })
  })

  // Card interaction events (include window.location.pathname)
  it('emitCardSortChanged sends sort_field, card_type, page_path', () => {
    emitCardSortChanged('name', 'pods')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.sort_field).toBe('name')
    expect(params.card_type).toBe('pods')
    expect(typeof params.page_path).toBe('string')
  })

  it('emitCardSortDirectionChanged sends direction, card_type, page_path', () => {
    emitCardSortDirectionChanged('desc', 'deployments')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.direction).toBe('desc')
    expect(params.card_type).toBe('deployments')
    expect(typeof params.page_path).toBe('string')
  })

  it('emitCardLimitChanged sends limit, card_type, page_path', () => {
    emitCardLimitChanged('50', 'pods')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.limit).toBe('50')
    expect(params.card_type).toBe('pods')
  })

  it('emitCardSearchUsed sends query_length, card_type, page_path', () => {
    emitCardSearchUsed(3, 'namespaces')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.query_length).toBe(3)
    expect(params.card_type).toBe('namespaces')
  })

  it('emitCardClusterFilterChanged sends selected_count, total_count, card_type, page_path', () => {
    emitCardClusterFilterChanged(2, 5, 'pods')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.selected_count).toBe(2)
    expect(params.total_count).toBe(5)
    expect(params.card_type).toBe('pods')
  })

  it('emitCardPaginationUsed sends page, total_pages, card_type, page_path', () => {
    emitCardPaginationUsed(2, 5, 'pods')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.page).toBe(2)
    expect(params.total_pages).toBe(5)
    expect(params.card_type).toBe('pods')
  })

  it('emitCardListItemClicked sends card_type and page_path', () => {
    emitCardListItemClicked('namespaces')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.card_type).toBe('namespaces')
    expect(typeof params.page_path).toBe('string')
  })

  // Recommendations
  it('emitCardRecommendationsShown sends card_count and high_priority_count', () => {
    emitCardRecommendationsShown(4, 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_card_recommendations_shown', {
      card_count: 4,
      high_priority_count: 2,
    })
  })

  it('emitCardRecommendationActioned sends card_type and priority', () => {
    emitCardRecommendationActioned('pods', 'high')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_recommendation_actioned', {
      card_type: 'pods',
      priority: 'high',
    })
  })

  // Add Card Modal
  it('emitAddCardModalOpened fires event with no params', () => {
    emitAddCardModalOpened()
    expect(mockSend).toHaveBeenCalledWith('ksc_add_card_modal_opened')
  })

  it('emitAddCardModalAbandoned fires event with no params', () => {
    emitAddCardModalAbandoned()
    expect(mockSend).toHaveBeenCalledWith('ksc_add_card_modal_abandoned')
  })

  it('emitCardCategoryBrowsed sends category', () => {
    emitCardCategoryBrowsed('cluster-health')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_category_browsed', { category: 'cluster-health' })
  })

  it('emitRecommendedCardShown sends card_count and joined card_types', () => {
    emitRecommendedCardShown(['pods', 'deployments', 'nodes'])
    expect(mockSend).toHaveBeenCalledWith('ksc_recommended_cards_shown', {
      card_count: 3,
      card_types: 'pods,deployments,nodes',
    })
  })

  it('emitRecommendedCardShown handles empty array', () => {
    emitRecommendedCardShown([])
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.card_count).toBe(0)
    expect(params.card_types).toBe('')
  })

  it('emitCardRefreshed sends card_type', () => {
    emitCardRefreshed('metrics')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_refreshed', { card_type: 'metrics' })
  })
})

// ── analytics-events/admin.ts ─────────────────────────────────────────────────

describe('analytics-events/admin', () => {
  it('emitModalOpened sends modal_type and source_card', () => {
    emitModalOpened('pod-detail', 'pods')
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_opened', {
      modal_type: 'pod-detail',
      source_card: 'pods',
    })
  })

  it('emitModalTabViewed sends modal_type and tab_name', () => {
    emitModalTabViewed('pod-detail', 'logs')
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_tab_viewed', {
      modal_type: 'pod-detail',
      tab_name: 'logs',
    })
  })

  it('emitModalClosed sends modal_type and duration_ms', () => {
    emitModalClosed('pod-detail', 4200)
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_closed', {
      modal_type: 'pod-detail',
      duration_ms: 4200,
    })
  })

  it('emitActionClicked sends action_type, source_card, dashboard', () => {
    emitActionClicked('delete', 'pods', 'main')
    expect(mockSend).toHaveBeenCalledWith('ksc_action_clicked', {
      action_type: 'delete',
      source_card: 'pods',
      dashboard: 'main',
    })
  })

  it('emitUserRoleChanged sends new_role', () => {
    emitUserRoleChanged('admin')
    expect(mockSend).toHaveBeenCalledWith('ksc_user_role_changed', { new_role: 'admin' })
  })

  it('emitUserRemoved fires event with no params', () => {
    emitUserRemoved()
    expect(mockSend).toHaveBeenCalledWith('ksc_user_removed')
  })

  it('emitSidebarNavigated sends destination', () => {
    emitSidebarNavigated('/clusters')
    expect(mockSend).toHaveBeenCalledWith('ksc_sidebar_navigated', { destination: '/clusters' })
  })

  it('emitGameStarted sends game_name', () => {
    emitGameStarted('kubequiz')
    expect(mockSend).toHaveBeenCalledWith('ksc_game_started', { game_name: 'kubequiz' })
  })

  it('emitGameEnded sends game_name, outcome, score', () => {
    emitGameEnded('kubequiz', 'win', 100)
    expect(mockSend).toHaveBeenCalledWith('ksc_game_ended', {
      game_name: 'kubequiz',
      outcome: 'win',
      score: 100,
    })
  })
})
