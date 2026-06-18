/**
 * Coverage for analytics-events sub-modules:
 *   cards.ts, engagement.ts, dashboard.ts, admin.ts,
 *   settings.ts, feedback.ts, agent.ts, marketplace.ts
 *
 * Each function is a thin `send()` wrapper — tests verify the event name and
 * payload shape. analytics-core is fully mocked so no network activity occurs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../analytics-core', () => ({
  send: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
}))

import { send, setAnalyticsUserProperties } from '../../analytics-core'

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
} from '../cards'

import {
  emitWidgetLoaded,
  emitWidgetNavigation,
  emitWidgetInstalled,
  emitWidgetDownloaded,
  emitNudgeShown,
  emitNudgeDismissed,
  emitNudgeActioned,
  emitSmartSuggestionsShown,
  emitSmartSuggestionAccepted,
  emitSmartSuggestionsAddAll,
  emitDashboardScrolled,
  emitPwaPromptShown,
  emitPwaPromptDismissed,
  emitFeatureHintShown,
  emitFeatureHintDismissed,
  emitFeatureHintActioned,
  emitGettingStartedShown,
  emitGettingStartedActioned,
  emitPostConnectShown,
  emitPostConnectActioned,
  emitDemoToLocalShown,
  emitDemoToLocalActioned,
  emitAdopterNudgeShown,
  emitAdopterNudgeActioned,
  emitInsightViewed,
  emitInsightAcknowledged,
  emitInsightDismissed,
  emitAISuggestionViewed,
  emitTipShown,
  emitStreakDay,
  emitBlogPostClicked,
} from '../engagement'

import {
  emitDrillDownOpened,
  emitDrillDownClosed,
  emitGlobalClusterFilterChanged,
  emitGlobalSeverityFilterChanged,
  emitGlobalStatusFilterChanged,
  emitDashboardCreated,
  emitDashboardDeleted,
  emitDashboardRenamed,
  emitDashboardImported,
  emitDashboardExported,
  emitDashboardViewed,
  emitDataExported,
  emitSnoozed,
  emitUnsnoozed,
} from '../dashboard'

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
} from '../admin'

import {
  emitTourStarted,
  emitTourCompleted,
  emitTourSkipped,
  emitThemeChanged,
  emitLanguageChanged,
  emitAIModeChanged,
  emitAIPredictionsToggled,
  emitConfidenceThresholdChanged,
  emitConsensusModeToggled,
  emitUpdateChecked,
  emitUpdateTriggered,
  emitUpdateCompleted,
  emitUpdateFailed,
  emitUpdateRefreshed,
  emitUpdateStalled,
  emitWhatsNewModalOpened,
  emitWhatsNewUpdateClicked,
  emitWhatsNewRemindLater,
} from '../settings'

import {
  emitFeedbackSubmitted,
  emitScreenshotAttached,
  emitScreenshotUploadFailed,
  emitScreenshotUploadSuccess,
  emitNPSSurveyShown,
  emitNPSResponse,
  emitNPSDismissed,
  emitLinkedInShare,
  emitPredictionFeedbackSubmitted,
} from '../feedback'

import {
  emitAgentConnected,
  emitAgentDisconnected,
  emitClusterInventory,
  emitAgentProvidersDetected,
  emitApiKeyConfigured,
  emitApiKeyRemoved,
  emitClusterCreated,
  emitClusterAction,
  emitClusterStatsDrillDown,
} from '../agent'

import {
  emitMarketplaceInstall,
  emitMarketplaceRemove,
  emitMarketplaceInstallFailed,
  emitMarketplaceItemViewed,
  emitInstallCommandCopied,
  emitConversionStep,
  emitLocalClusterCreated,
  emitWelcomeViewed,
  emitWelcomeActioned,
  emitFromLensViewed,
  emitFromLensActioned,
  emitFromLensTabSwitch,
  emitFromLensCommandCopy,
  emitFromHeadlampViewed,
  emitFromHeadlampActioned,
  emitFromHeadlampTabSwitch,
  emitFromHeadlampCommandCopy,
  emitWhiteLabelViewed,
  emitWhiteLabelActioned,
  emitWhiteLabelTabSwitch,
  emitWhiteLabelCommandCopy,
} from '../marketplace'

const mockSend = vi.mocked(send)
const mockSetUserProps = vi.mocked(setAnalyticsUserProperties)

beforeEach(() => {
  mockSend.mockClear()
  mockSetUserProps.mockClear()
})

// ─────────────────────────────────────────────────────────────────────────────
// cards.ts
// ─────────────────────────────────────────────────────────────────────────────


describe('analytics-events/cards', () => {
  it('emitCardAdded sends ksc_card_added with type and source', () => {
    emitCardAdded('pods', 'sidebar')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_added', { card_type: 'pods', source: 'sidebar' })
  })

  it('emitCardRemoved sends ksc_card_removed with card_type', () => {
    emitCardRemoved('events')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_removed', { card_type: 'events' })
  })

  it('emitCardExpanded sends ksc_card_expanded', () => {
    emitCardExpanded('deployments')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_expanded', { card_type: 'deployments' })
  })

  it('emitCardDragged sends ksc_card_dragged', () => {
    emitCardDragged('services')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_dragged', { card_type: 'services' })
  })

  it('emitCardConfigured sends ksc_card_configured', () => {
    emitCardConfigured('nodes')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_configured', { card_type: 'nodes' })
  })

  it('emitCardReplaced sends ksc_card_replaced with old and new types', () => {
    emitCardReplaced('pods', 'deployments')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_replaced', { old_type: 'pods', new_type: 'deployments' })
  })

  it('emitGlobalSearchOpened sends ksc_global_search_opened with method=keyboard', () => {
    emitGlobalSearchOpened('keyboard')
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_opened', { method: 'keyboard' })
  })

  it('emitGlobalSearchOpened sends method=click', () => {
    emitGlobalSearchOpened('click')
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_opened', { method: 'click' })
  })

  it('emitGlobalSearchQueried sends query_length and result_count', () => {
    emitGlobalSearchQueried(5, 12)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_queried', { query_length: 5, result_count: 12 })
  })

  it('emitGlobalSearchSelected sends category and result_index', () => {
    emitGlobalSearchSelected('pods', 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_selected', { category: 'pods', result_index: 2 })
  })

  it('emitGlobalSearchAskAI sends query_length', () => {
    emitGlobalSearchAskAI(8)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_search_ask_ai', { query_length: 8 })
  })

  it('emitCardSortChanged sends sort_field, card_type, page_path', () => {
    emitCardSortChanged('name', 'pods')
    const call = mockSend.mock.calls[0]
    expect(call[0]).toBe('ksc_card_sort_changed')
    expect(call[1]).toMatchObject({ sort_field: 'name', card_type: 'pods' })
    expect(typeof call[1].page_path).toBe('string')
  })

  it('emitCardSortDirectionChanged sends direction and card_type', () => {
    emitCardSortDirectionChanged('asc', 'events')
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_card_sort_direction_changed',
      expect.objectContaining({ direction: 'asc', card_type: 'events' })
    )
  })

  it('emitCardLimitChanged sends limit and card_type', () => {
    emitCardLimitChanged('50', 'nodes')
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_card_limit_changed',
      expect.objectContaining({ limit: '50', card_type: 'nodes' })
    )
  })

  it('emitCardSearchUsed sends query_length and card_type', () => {
    emitCardSearchUsed(3, 'deployments')
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_card_search_used',
      expect.objectContaining({ query_length: 3, card_type: 'deployments' })
    )
  })

  it('emitCardClusterFilterChanged sends selected/total counts and card_type', () => {
    emitCardClusterFilterChanged(2, 5, 'pods')
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_card_cluster_filter_changed',
      expect.objectContaining({ selected_count: 2, total_count: 5, card_type: 'pods' })
    )
  })

  it('emitCardPaginationUsed sends page, total_pages, card_type', () => {
    emitCardPaginationUsed(3, 10, 'events')
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_card_pagination_used',
      expect.objectContaining({ page: 3, total_pages: 10, card_type: 'events' })
    )
  })

  it('emitCardListItemClicked sends card_type', () => {
    emitCardListItemClicked('pods')
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_card_list_item_clicked',
      expect.objectContaining({ card_type: 'pods' })
    )
  })

  it('emitCardRecommendationsShown sends counts', () => {
    emitCardRecommendationsShown(5, 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_card_recommendations_shown', {
      card_count: 5,
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

  it('emitAddCardModalOpened sends ksc_add_card_modal_opened', () => {
    emitAddCardModalOpened()
    expect(mockSend).toHaveBeenCalledWith('ksc_add_card_modal_opened')
  })

  it('emitAddCardModalAbandoned sends ksc_add_card_modal_abandoned', () => {
    emitAddCardModalAbandoned()
    expect(mockSend).toHaveBeenCalledWith('ksc_add_card_modal_abandoned')
  })

  it('emitCardCategoryBrowsed sends category', () => {
    emitCardCategoryBrowsed('networking')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_category_browsed', { category: 'networking' })
  })

  it('emitRecommendedCardShown sends card_count and joined card_types', () => {
    emitRecommendedCardShown(['pods', 'events', 'deployments'])
    expect(mockSend).toHaveBeenCalledWith('ksc_recommended_cards_shown', {
      card_count: 3,
      card_types: 'pods,events,deployments',
    })
  })

  it('emitCardRefreshed sends ksc_card_refreshed with card_type', () => {
    emitCardRefreshed('nodes')
    expect(mockSend).toHaveBeenCalledWith('ksc_card_refreshed', { card_type: 'nodes' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// engagement.ts
// ─────────────────────────────────────────────────────────────────────────────

