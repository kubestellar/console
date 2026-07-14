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
describe('analytics-events/engagement', () => {
  it('emitWidgetLoaded sends mode', () => {
    emitWidgetLoaded('standalone')
    expect(mockSend).toHaveBeenCalledWith('ksc_widget_loaded', { mode: 'standalone' })
  })

  it('emitWidgetNavigation sends target_path', () => {
    emitWidgetNavigation('/clusters')
    expect(mockSend).toHaveBeenCalledWith('ksc_widget_navigation', { target_path: '/clusters' })
  })

  it('emitWidgetInstalled sends method', () => {
    emitWidgetInstalled('pwa-prompt')
    expect(mockSend).toHaveBeenCalledWith('ksc_widget_installed', { method: 'pwa-prompt' })
  })

  it('emitWidgetDownloaded sends widget_type', () => {
    emitWidgetDownloaded('browser')
    expect(mockSend).toHaveBeenCalledWith('ksc_widget_downloaded', { widget_type: 'browser' })
  })

  it('emitNudgeShown sends nudge_type', () => {
    emitNudgeShown('install-agent')
    expect(mockSend).toHaveBeenCalledWith('ksc_nudge_shown', { nudge_type: 'install-agent' })
  })

  it('emitNudgeDismissed sends nudge_type', () => {
    emitNudgeDismissed('install-agent')
    expect(mockSend).toHaveBeenCalledWith('ksc_nudge_dismissed', { nudge_type: 'install-agent' })
  })

  it('emitNudgeActioned sends nudge_type', () => {
    emitNudgeActioned('upgrade-plan')
    expect(mockSend).toHaveBeenCalledWith('ksc_nudge_actioned', { nudge_type: 'upgrade-plan' })
  })

  it('emitSmartSuggestionsShown sends card_count', () => {
    emitSmartSuggestionsShown(4)
    expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestions_shown', { card_count: 4 })
  })

  it('emitSmartSuggestionAccepted sends card_type', () => {
    emitSmartSuggestionAccepted('pods')
    expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestion_accepted', { card_type: 'pods' })
  })

  it('emitSmartSuggestionsAddAll sends card_count', () => {
    emitSmartSuggestionsAddAll(3)
    expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestions_add_all', { card_count: 3 })
  })

  it('emitDashboardScrolled sends depth', () => {
    emitDashboardScrolled('deep')
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_scrolled', { depth: 'deep' })
  })

  it('emitPwaPromptShown sends ksc_pwa_prompt_shown', () => {
    emitPwaPromptShown()
    expect(mockSend).toHaveBeenCalledWith('ksc_pwa_prompt_shown')
  })

  it('emitPwaPromptDismissed sends ksc_pwa_prompt_dismissed', () => {
    emitPwaPromptDismissed()
    expect(mockSend).toHaveBeenCalledWith('ksc_pwa_prompt_dismissed')
  })

  it('emitFeatureHintShown sends hint_type', () => {
    emitFeatureHintShown('add-card')
    expect(mockSend).toHaveBeenCalledWith('ksc_feature_hint_shown', { hint_type: 'add-card' })
  })

  it('emitFeatureHintDismissed sends hint_type', () => {
    emitFeatureHintDismissed('add-card')
    expect(mockSend).toHaveBeenCalledWith('ksc_feature_hint_dismissed', { hint_type: 'add-card' })
  })

  it('emitFeatureHintActioned sends hint_type', () => {
    emitFeatureHintActioned('add-card')
    expect(mockSend).toHaveBeenCalledWith('ksc_feature_hint_actioned', { hint_type: 'add-card' })
  })

  it('emitGettingStartedShown sends ksc_getting_started_shown', () => {
    emitGettingStartedShown()
    expect(mockSend).toHaveBeenCalledWith('ksc_getting_started_shown')
  })

  it('emitGettingStartedActioned sends action', () => {
    emitGettingStartedActioned('connect-cluster')
    expect(mockSend).toHaveBeenCalledWith('ksc_getting_started_actioned', { action: 'connect-cluster' })
  })

  it('emitPostConnectShown sends ksc_post_connect_shown', () => {
    emitPostConnectShown()
    expect(mockSend).toHaveBeenCalledWith('ksc_post_connect_shown')
  })

  it('emitPostConnectActioned sends action', () => {
    emitPostConnectActioned('add-card')
    expect(mockSend).toHaveBeenCalledWith('ksc_post_connect_actioned', { action: 'add-card' })
  })

  it('emitDemoToLocalShown sends ksc_demo_to_local_shown', () => {
    emitDemoToLocalShown()
    expect(mockSend).toHaveBeenCalledWith('ksc_demo_to_local_shown')
  })

  it('emitDemoToLocalActioned sends action', () => {
    emitDemoToLocalActioned('install')
    expect(mockSend).toHaveBeenCalledWith('ksc_demo_to_local_actioned', { action: 'install' })
  })

  it('emitAdopterNudgeShown sends ksc_adopter_nudge_shown', () => {
    emitAdopterNudgeShown()
    expect(mockSend).toHaveBeenCalledWith('ksc_adopter_nudge_shown')
  })

  it('emitAdopterNudgeActioned sends action', () => {
    emitAdopterNudgeActioned('share')
    expect(mockSend).toHaveBeenCalledWith('ksc_adopter_nudge_actioned', { action: 'share' })
  })

  it('emitInsightViewed sends insight_category', () => {
    emitInsightViewed('security')
    expect(mockSend).toHaveBeenCalledWith('ksc_insight_viewed', { insight_category: 'security' })
  })

  it('emitInsightAcknowledged sends category and severity', () => {
    emitInsightAcknowledged('compliance', 'high')
    expect(mockSend).toHaveBeenCalledWith('ksc_insight_acknowledged', {
      insight_category: 'compliance',
      insight_severity: 'high',
    })
  })

  it('emitInsightDismissed sends category and severity', () => {
    emitInsightDismissed('networking', 'medium')
    expect(mockSend).toHaveBeenCalledWith('ksc_insight_dismissed', {
      insight_category: 'networking',
      insight_severity: 'medium',
    })
  })

  it('emitAISuggestionViewed sends category and enrichment flag', () => {
    emitAISuggestionViewed('performance', true)
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_suggestion_viewed', {
      insight_category: 'performance',
      has_ai_enrichment: true,
    })
  })

  it('emitTipShown sends page and tip', () => {
    emitTipShown('dashboard', 'drag-cards')
    expect(mockSend).toHaveBeenCalledWith('ksc_tip_shown', { page: 'dashboard', tip: 'drag-cards' })
  })

  it('emitStreakDay sends streak_count', () => {
    emitStreakDay(7)
    expect(mockSend).toHaveBeenCalledWith('ksc_streak_day', { streak_count: 7 })
  })

  it('emitBlogPostClicked sends blog_title', () => {
    emitBlogPostClicked('KubeStellar 0.25 Release')
    expect(mockSend).toHaveBeenCalledWith('ksc_blog_post_clicked', { blog_title: 'KubeStellar 0.25 Release' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// dashboard.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('analytics-events/dashboard', () => {
  it('emitDrillDownOpened sends view_type', () => {
    emitDrillDownOpened('pod-detail')
    expect(mockSend).toHaveBeenCalledWith('ksc_drill_down_opened', { view_type: 'pod-detail' })
  })

  it('emitDrillDownClosed sends view_type and depth', () => {
    emitDrillDownClosed('pod-detail', 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_drill_down_closed', { view_type: 'pod-detail', depth: 2 })
  })

  it('emitGlobalClusterFilterChanged sends selected and total counts', () => {
    emitGlobalClusterFilterChanged(3, 10)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_cluster_filter_changed', {
      selected_count: 3,
      total_count: 10,
    })
  })

  it('emitGlobalSeverityFilterChanged sends selected_count', () => {
    emitGlobalSeverityFilterChanged(2)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_severity_filter_changed', { selected_count: 2 })
  })

  it('emitGlobalStatusFilterChanged sends selected_count', () => {
    emitGlobalStatusFilterChanged(1)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_status_filter_changed', { selected_count: 1 })
  })

  it('emitDashboardCreated sends dashboard_name', () => {
    emitDashboardCreated('My Dashboard')
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_created', { dashboard_name: 'My Dashboard' })
  })

  it('emitDashboardDeleted sends ksc_dashboard_deleted', () => {
    emitDashboardDeleted()
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_deleted')
  })

  it('emitDashboardRenamed sends ksc_dashboard_renamed', () => {
    emitDashboardRenamed()
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_renamed')
  })

  it('emitDashboardImported sends ksc_dashboard_imported', () => {
    emitDashboardImported()
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_imported')
  })

  it('emitDashboardExported sends ksc_dashboard_exported', () => {
    emitDashboardExported()
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_exported')
  })

  it('emitDashboardViewed sends dashboard_id and duration_ms', () => {
    emitDashboardViewed('dash-1', 5000)
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_viewed', {
      dashboard_id: 'dash-1',
      duration_ms: 5000,
    })
  })

  it('emitDataExported sends export_type and resource_type', () => {
    emitDataExported('csv', 'pods')
    expect(mockSend).toHaveBeenCalledWith('ksc_data_exported', {
      export_type: 'csv',
      resource_type: 'pods',
    })
  })

  it('emitDataExported uses empty string when resource_type omitted', () => {
    emitDataExported('json')
    expect(mockSend).toHaveBeenCalledWith('ksc_data_exported', {
      export_type: 'json',
      resource_type: '',
    })
  })

  it('emitSnoozed sends target_type and duration', () => {
    emitSnoozed('alert', '1h')
    expect(mockSend).toHaveBeenCalledWith('ksc_snoozed', { target_type: 'alert', duration: '1h' })
  })

  it('emitSnoozed uses "default" when duration omitted', () => {
    emitSnoozed('card')
    expect(mockSend).toHaveBeenCalledWith('ksc_snoozed', { target_type: 'card', duration: 'default' })
  })

  it('emitUnsnoozed sends target_type', () => {
    emitUnsnoozed('alert')
    expect(mockSend).toHaveBeenCalledWith('ksc_unsnoozed', { target_type: 'alert' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// admin.ts
// ─────────────────────────────────────────────────────────────────────────────
