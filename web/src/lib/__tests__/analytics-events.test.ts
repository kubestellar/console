/**
 * Tests for analytics-events.ts emit functions.
 *
 * We mock the `send` function from analytics-core and verify that each
 * emitter calls it with the correct event name and parameters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../analytics-core', () => ({
  send: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
}))

vi.mock('../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('../analytics-session', () => ({
  getDeploymentType: vi.fn(() => 'localhost'),
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
  emitMissionStarted,
  emitMissionCompleted,
  emitAgentTokenFailure,
  emitWsAuthMissing,
  emitSseAuthFailure,
  emitSessionRefreshFailure,
} from '../analytics-events'

const mockSend = vi.mocked(send)

describe('analytics-events', () => {
  beforeEach(() => {
    mockSend.mockClear()
  })

  describe('Dashboard & Cards', () => {
    it('emitCardAdded sends card_type and source', () => {
      emitCardAdded('pods', 'customize')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_added', { card_type: 'pods', source: 'customize' })
    })

    it('emitCardRemoved sends card_type', () => {
      emitCardRemoved('pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_removed', { card_type: 'pods' })
    })

    it('emitCardExpanded sends card_type', () => {
      emitCardExpanded('events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_expanded', { card_type: 'events' })
    })

    it('emitCardDragged sends card_type', () => {
      emitCardDragged('pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_dragged', { card_type: 'pods' })
    })

    it('emitCardConfigured sends card_type', () => {
      emitCardConfigured('cluster-health')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_configured', { card_type: 'cluster-health' })
    })

    it('emitCardReplaced sends old and new types', () => {
      emitCardReplaced('old-card', 'new-card')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_replaced', { old_type: 'old-card', new_type: 'new-card' })
    })
  })

  describe('Global Search', () => {
    it('emitGlobalSearchOpened sends method', () => {
      emitGlobalSearchOpened('keyboard')
      expect(mockSend).toHaveBeenCalledWith('ksc_global_search_opened', { method: 'keyboard' })
    })

    it('emitGlobalSearchQueried sends query length and result count', () => {
      emitGlobalSearchQueried(5, 10)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_search_queried', { query_length: 5, result_count: 10 })
    })

    it('emitGlobalSearchSelected sends category and result index', () => {
      emitGlobalSearchSelected('cards', 2)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_search_selected', { category: 'cards', result_index: 2 })
    })

    it('emitGlobalSearchAskAI sends query length', () => {
      emitGlobalSearchAskAI(15)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_search_ask_ai', { query_length: 15 })
    })
  })

  describe('Card Interactions', () => {
    it('emitCardSortChanged sends sort field, card type, and page path', () => {
      emitCardSortChanged('name', 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_sort_changed', {
        sort_field: 'name',
        card_type: 'pods',
        page_path: expect.any(String),
      })
    })

    it('emitCardSortDirectionChanged sends direction and card type', () => {
      emitCardSortDirectionChanged('asc', 'events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_sort_direction_changed', {
        direction: 'asc',
        card_type: 'events',
        page_path: expect.any(String),
      })
    })

    it('emitCardLimitChanged sends limit and card type', () => {
      emitCardLimitChanged('50', 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_limit_changed', {
        limit: '50',
        card_type: 'pods',
        page_path: expect.any(String),
      })
    })

    it('emitCardSearchUsed sends query length and card type', () => {
      emitCardSearchUsed(10, 'events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_search_used', {
        query_length: 10,
        card_type: 'events',
        page_path: expect.any(String),
      })
    })

    it('emitCardClusterFilterChanged sends counts and card type', () => {
      emitCardClusterFilterChanged(2, 5, 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_cluster_filter_changed', {
        selected_count: 2,
        total_count: 5,
        card_type: 'pods',
        page_path: expect.any(String),
      })
    })

    it('emitCardPaginationUsed sends page and total pages', () => {
      emitCardPaginationUsed(3, 10, 'events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_pagination_used', {
        page: 3,
        total_pages: 10,
        card_type: 'events',
        page_path: expect.any(String),
      })
    })

    it('emitCardListItemClicked sends card type', () => {
      emitCardListItemClicked('deployments')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_list_item_clicked', {
        card_type: 'deployments',
        page_path: expect.any(String),
      })
    })
  })

  describe('Missions', () => {
    it('emitMissionStarted sends mission type and provider', () => {
      emitMissionStarted('install', 'claude')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_started', {
        mission_type: 'install',
        agent_provider: 'claude',
      })
    })

    it('emitMissionCompleted sends mission type and duration', () => {
      emitMissionCompleted('install', 120)
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_completed', {
        mission_type: 'install',
        duration_sec: 120,
      })
    })
  })

  describe('Auth / Connection Failure Detection', () => {
    it('emitAgentTokenFailure sends ksc_error with agent_token_failure category', () => {
      emitAgentTokenFailure('empty token from /api/agent/token')
      expect(mockSend).toHaveBeenCalledWith('ksc_error', expect.objectContaining({
        error_category: 'agent_token_failure',
        error_detail: 'empty token from /api/agent/token',
      }))
    })

    it('emitAgentTokenFailure truncates reason to 100 characters', () => {
      const longReason = 'x'.repeat(150)
      emitAgentTokenFailure(longReason)
      expect(mockSend).toHaveBeenCalledWith('ksc_error', expect.objectContaining({
        error_category: 'agent_token_failure',
        error_detail: 'x'.repeat(100),
      }))
    })

    it('emitWsAuthMissing sends ksc_error with ws_auth_missing category and strips host', () => {
      emitWsAuthMissing('ws://127.0.0.1:8585/ws')
      expect(mockSend).toHaveBeenCalledWith('ksc_error', expect.objectContaining({
        error_category: 'ws_auth_missing',
        error_detail: '/ws',
      }))
    })

    it('emitSseAuthFailure sends ksc_error with sse_auth_failure category and strips host', () => {
      emitSseAuthFailure('http://127.0.0.1:8585/pods/stream?cluster=test')
      expect(mockSend).toHaveBeenCalledWith('ksc_error', expect.objectContaining({
        error_category: 'sse_auth_failure',
        error_detail: '/pods/stream?cluster=test',
      }))
    })

    it('emitSessionRefreshFailure sends ksc_error with session_refresh_failure category', () => {
      emitSessionRefreshFailure('network error')
      expect(mockSend).toHaveBeenCalledWith('ksc_error', expect.objectContaining({
        error_category: 'session_refresh_failure',
        error_detail: 'network error',
      }))
    })

    it('emitSessionRefreshFailure truncates reason to 100 characters', () => {
      const longReason = 'a]'.repeat(75)
      emitSessionRefreshFailure(longReason)
      expect(mockSend).toHaveBeenCalledWith('ksc_error', expect.objectContaining({
        error_category: 'session_refresh_failure',
        error_detail: longReason.slice(0, 100),
      }))
    })
  })
})
