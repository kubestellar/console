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

describe('analytics-events/admin', () => {
  it('emitModalOpened sends modal_type and source_card', () => {
    emitModalOpened('pod-detail', 'pods-card')
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_opened', {
      modal_type: 'pod-detail',
      source_card: 'pods-card',
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
    emitModalClosed('pod-detail', 3000)
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_closed', {
      modal_type: 'pod-detail',
      duration_ms: 3000,
    })
  })

  it('emitActionClicked sends action_type, source_card, dashboard', () => {
    emitActionClicked('restart', 'pods-card', 'main')
    expect(mockSend).toHaveBeenCalledWith('ksc_action_clicked', {
      action_type: 'restart',
      source_card: 'pods-card',
      dashboard: 'main',
    })
  })

  it('emitUserRoleChanged sends new_role', () => {
    emitUserRoleChanged('admin')
    expect(mockSend).toHaveBeenCalledWith('ksc_user_role_changed', { new_role: 'admin' })
  })

  it('emitUserRemoved sends ksc_user_removed', () => {
    emitUserRemoved()
    expect(mockSend).toHaveBeenCalledWith('ksc_user_removed')
  })

  it('emitSidebarNavigated sends destination', () => {
    emitSidebarNavigated('/clusters')
    expect(mockSend).toHaveBeenCalledWith('ksc_sidebar_navigated', { destination: '/clusters' })
  })

  it('emitGameStarted sends game_name', () => {
    emitGameStarted('snake')
    expect(mockSend).toHaveBeenCalledWith('ksc_game_started', { game_name: 'snake' })
  })

  it('emitGameEnded sends game_name, outcome, score', () => {
    emitGameEnded('snake', 'win', 42)
    expect(mockSend).toHaveBeenCalledWith('ksc_game_ended', {
      game_name: 'snake',
      outcome: 'win',
      score: 42,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// settings.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('analytics-events/settings', () => {
  it('emitTourStarted sends ksc_tour_started', () => {
    emitTourStarted()
    expect(mockSend).toHaveBeenCalledWith('ksc_tour_started')
  })

  it('emitTourCompleted sends step_count', () => {
    emitTourCompleted(5)
    expect(mockSend).toHaveBeenCalledWith('ksc_tour_completed', { step_count: 5 })
  })

  it('emitTourSkipped sends at_step', () => {
    emitTourSkipped(3)
    expect(mockSend).toHaveBeenCalledWith('ksc_tour_skipped', { at_step: 3 })
  })

  it('emitThemeChanged sends theme_id and source', () => {
    emitThemeChanged('dracula', 'settings')
    expect(mockSend).toHaveBeenCalledWith('ksc_theme_changed', { theme_id: 'dracula', source: 'settings' })
  })

  it('emitLanguageChanged sends language', () => {
    emitLanguageChanged('en')
    expect(mockSend).toHaveBeenCalledWith('ksc_language_changed', { language: 'en' })
  })

  it('emitAIModeChanged sends mode', () => {
    emitAIModeChanged('auto')
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_mode_changed', { mode: 'auto' })
  })

  it('emitAIPredictionsToggled sends enabled as string', () => {
    emitAIPredictionsToggled(true)
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_predictions_toggled', { enabled: 'true' })
  })

  it('emitAIPredictionsToggled sends false as string', () => {
    emitAIPredictionsToggled(false)
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_predictions_toggled', { enabled: 'false' })
  })

  it('emitConfidenceThresholdChanged sends threshold', () => {
    emitConfidenceThresholdChanged(0.75)
    expect(mockSend).toHaveBeenCalledWith('ksc_confidence_threshold_changed', { threshold: 0.75 })
  })

  it('emitConsensusModeToggled sends enabled as string', () => {
    emitConsensusModeToggled(true)
    expect(mockSend).toHaveBeenCalledWith('ksc_consensus_mode_toggled', { enabled: 'true' })
  })

  it('emitUpdateChecked sends ksc_update_checked', () => {
    emitUpdateChecked()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_checked')
  })

  it('emitUpdateTriggered sends ksc_update_triggered', () => {
    emitUpdateTriggered()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_triggered')
  })

  it('emitUpdateCompleted sends duration_ms', () => {
    emitUpdateCompleted(2500)
    expect(mockSend).toHaveBeenCalledWith('ksc_update_completed', { duration_ms: 2500 })
  })

  it('emitUpdateFailed truncates error to 100 chars', () => {
    const longError = 'e'.repeat(150)
    emitUpdateFailed(longError)
    expect(mockSend).toHaveBeenCalledWith('ksc_update_failed', { error_detail: 'e'.repeat(100) })
  })

  it('emitUpdateFailed preserves short errors', () => {
    emitUpdateFailed('network timeout')
    expect(mockSend).toHaveBeenCalledWith('ksc_update_failed', { error_detail: 'network timeout' })
  })

  it('emitUpdateRefreshed sends ksc_update_refreshed', () => {
    emitUpdateRefreshed()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_refreshed')
  })

  it('emitUpdateStalled sends ksc_update_stalled', () => {
    emitUpdateStalled()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_stalled')
  })

  it('emitWhatsNewModalOpened sends release_tag', () => {
    emitWhatsNewModalOpened('v0.25.0')
    expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_modal_opened', { release_tag: 'v0.25.0' })
  })

  it('emitWhatsNewUpdateClicked sends release_tag and install_method', () => {
    emitWhatsNewUpdateClicked('v0.25.0', 'homebrew')
    expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_update_clicked', {
      release_tag: 'v0.25.0',
      install_method: 'homebrew',
    })
  })

  it('emitWhatsNewRemindLater sends release_tag and snooze_duration', () => {
    emitWhatsNewRemindLater('v0.25.0', '1d')
    expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_remind_later', {
      release_tag: 'v0.25.0',
      snooze_duration: '1d',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// feedback.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('analytics-events/feedback', () => {
  it('emitFeedbackSubmitted sends feedback_type', () => {
    emitFeedbackSubmitted('bug')
    expect(mockSend).toHaveBeenCalledWith('ksc_feedback_submitted', { feedback_type: 'bug' })
  })

  it('emitScreenshotAttached sends method and count', () => {
    emitScreenshotAttached('paste', 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_attached', { method: 'paste', count: 2 })
  })

  it('emitScreenshotUploadFailed truncates error and sends screenshot_count', () => {
    const longErr = 'x'.repeat(150)
    emitScreenshotUploadFailed(longErr, 1)
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect((payload.error as string).length).toBeLessThanOrEqual(100)
    expect(payload.screenshot_count).toBe(1)
  })

  it('emitScreenshotUploadSuccess sends screenshot_count', () => {
    emitScreenshotUploadSuccess(3)
    expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_upload_success', { screenshot_count: 3 })
  })

  it('emitNPSSurveyShown passes bypassOptOut: true', () => {
    emitNPSSurveyShown()
    expect(mockSend).toHaveBeenCalledWith('ksc_nps_survey_shown', undefined, { bypassOptOut: true })
  })

  it('emitNPSResponse sends score, category, and feedback_length', () => {
    emitNPSResponse(9, 'promoter', 50)
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_nps_response',
      expect.objectContaining({ nps_score: 9, nps_category: 'promoter', nps_feedback_length: 50 }),
      { bypassOptOut: true }
    )
  })

  it('emitNPSResponse omits feedback_length when undefined', () => {
    emitNPSResponse(5, 'passive')
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('nps_feedback_length')
  })

  it('emitNPSDismissed sends dismiss_count', () => {
    emitNPSDismissed(2)
    expect(mockSend).toHaveBeenCalledWith('ksc_nps_dismissed', { dismiss_count: 2 }, { bypassOptOut: true })
  })

  it('emitLinkedInShare sends source', () => {
    emitLinkedInShare('dashboard')
    expect(mockSend).toHaveBeenCalledWith('ksc_linkedin_share', { source: 'dashboard' })
  })

  it('emitPredictionFeedbackSubmitted sends feedback, prediction_type, provider', () => {
    emitPredictionFeedbackSubmitted('thumbs-up', 'anomaly', 'openai')
    expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
      feedback: 'thumbs-up',
      prediction_type: 'anomaly',
      provider: 'openai',
    })
  })

  it('emitPredictionFeedbackSubmitted defaults provider to "unknown"', () => {
    emitPredictionFeedbackSubmitted('thumbs-down', 'anomaly')
    expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
      feedback: 'thumbs-down',
      prediction_type: 'anomaly',
      provider: 'unknown',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// agent.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('analytics-events/agent', () => {
  it('emitAgentConnected sends agent_version and cluster_count', () => {
    emitAgentConnected('1.2.3', 5)
    expect(mockSend).toHaveBeenCalledWith('ksc_agent_connected', {
      agent_version: '1.2.3',
      cluster_count: 5,
    })
  })

  it('emitAgentDisconnected sends ksc_agent_disconnected', () => {
    emitAgentDisconnected()
    expect(mockSend).toHaveBeenCalledWith('ksc_agent_disconnected')
  })

  it('emitClusterInventory sends counts and calls setAnalyticsUserProperties', () => {
    emitClusterInventory({
      total: 3,
      healthy: 2,
      unhealthy: 1,
      unreachable: 0,
      distributions: { eks: 2, kind: 1 },
    })
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_cluster_inventory',
      expect.objectContaining({
        cluster_count: 3,
        healthy_count: 2,
        unhealthy_count: 1,
        unreachable_count: 0,
        dist_eks: 2,
        dist_kind: 1,
      })
    )
    expect(mockSetUserProps).toHaveBeenCalledWith({ cluster_count: '3' })
  })

  it('emitAgentProvidersDetected skips when providers empty', () => {
    emitAgentProvidersDetected([])
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('emitAgentProvidersDetected classifies CLI vs API providers', () => {
    // CAPABILITY_CHAT=1, CAPABILITY_TOOL_EXEC=2
    emitAgentProvidersDetected([
      { name: 'kubectl', capabilities: 2 },   // CLI (tool exec)
      { name: 'gpt-4', capabilities: 1 },     // API (chat only)
    ])
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_agent_providers_detected',
      expect.objectContaining({
        provider_count: 2,
        cli_providers: 'kubectl',
        api_providers: 'gpt-4',
        cli_count: 1,
        api_count: 1,
      })
    )
  })

  it('emitApiKeyConfigured sends provider', () => {
    emitApiKeyConfigured('openai')
    expect(mockSend).toHaveBeenCalledWith('ksc_api_key_configured', { provider: 'openai' })
  })

  it('emitApiKeyRemoved sends provider', () => {
    emitApiKeyRemoved('anthropic')
    expect(mockSend).toHaveBeenCalledWith('ksc_api_key_removed', { provider: 'anthropic' })
  })

  it('emitClusterCreated sends cluster_name and auth_type', () => {
    emitClusterCreated('my-cluster', 'kubeconfig')
    expect(mockSend).toHaveBeenCalledWith('ksc_cluster_created', {
      cluster_name: 'my-cluster',
      auth_type: 'kubeconfig',
    })
  })

  it('emitClusterAction sends action and cluster_name', () => {
    emitClusterAction('delete', 'my-cluster')
    expect(mockSend).toHaveBeenCalledWith('ksc_cluster_action', {
      action: 'delete',
      cluster_name: 'my-cluster',
    })
  })

  it('emitClusterStatsDrillDown sends stat_type', () => {
    emitClusterStatsDrillDown('nodes')
    expect(mockSend).toHaveBeenCalledWith('ksc_cluster_stats_drill_down', { stat_type: 'nodes' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// marketplace.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('analytics-events/marketplace', () => {
  it('emitMarketplaceInstall sends item_type and item_name', () => {
    emitMarketplaceInstall('extension', 'trivy')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install', {
      item_type: 'extension',
      item_name: 'trivy',
    })
  })

  it('emitMarketplaceRemove sends item_type', () => {
    emitMarketplaceRemove('extension')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_remove', { item_type: 'extension' })
  })

  it('emitMarketplaceInstallFailed truncates error to 100 chars', () => {
    const longErr = 'z'.repeat(150)
    emitMarketplaceInstallFailed('extension', 'trivy', longErr, 'download')
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect((payload.error_detail as string).length).toBeLessThanOrEqual(100)
    expect(payload.failure_stage).toBe('download')
  })

  it('emitMarketplaceInstallFailed sends all fields on short error', () => {
    emitMarketplaceInstallFailed('extension', 'kyverno', 'timeout', 'http_error')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install_failed', {
      item_type: 'extension',
      item_name: 'kyverno',
      error_detail: 'timeout',
      failure_stage: 'http_error',
    })
  })

  it('emitMarketplaceItemViewed sends item_type and item_name', () => {
    emitMarketplaceItemViewed('dashboard', 'security-overview')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_item_viewed', {
      item_type: 'dashboard',
      item_name: 'security-overview',
    })
  })

  it('emitInstallCommandCopied sends source and command', () => {
    emitInstallCommandCopied('from_lens', 'helm install ks ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_install_command_copied', {
      source: 'from_lens',
      command: 'helm install ks ...',
    })
  })

  it('emitConversionStep sends step_number, step_name, and extra details', () => {
    emitConversionStep(2, 'connect-cluster', { method: 'kubeconfig' })
    expect(mockSend).toHaveBeenCalledWith('ksc_conversion_step', {
      step_number: 2,
      step_name: 'connect-cluster',
      method: 'kubeconfig',
    })
  })

  it('emitLocalClusterCreated sends tool', () => {
    emitLocalClusterCreated('kind')
    expect(mockSend).toHaveBeenCalledWith('ksc_local_cluster_created', { tool: 'kind' })
  })

  it('emitWelcomeViewed sends ref', () => {
    emitWelcomeViewed('docs')
    expect(mockSend).toHaveBeenCalledWith('ksc_welcome_viewed', { ref: 'docs' })
  })

  it('emitWelcomeActioned sends action and ref', () => {
    emitWelcomeActioned('start', 'homepage')
    expect(mockSend).toHaveBeenCalledWith('ksc_welcome_actioned', { action: 'start', ref: 'homepage' })
  })

  it('emitFromLensViewed sends ksc_from_lens_viewed', () => {
    emitFromLensViewed()
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_viewed')
  })

  it('emitFromLensActioned sends action', () => {
    emitFromLensActioned('install')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_actioned', { action: 'install' })
  })

  it('emitFromLensTabSwitch sends tab', () => {
    emitFromLensTabSwitch('quickstart')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_tab_switch', { tab: 'quickstart' })
  })

  it('emitFromLensCommandCopy sends tab, step, command', () => {
    emitFromLensCommandCopy('quickstart', 1, 'helm install ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_command_copy', {
      tab: 'quickstart',
      step: 1,
      command: 'helm install ...',
    })
  })

  it('emitFromHeadlampViewed sends ksc_from_headlamp_viewed', () => {
    emitFromHeadlampViewed()
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_viewed')
  })

  it('emitFromHeadlampActioned sends action', () => {
    emitFromHeadlampActioned('install')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_actioned', { action: 'install' })
  })

  it('emitFromHeadlampTabSwitch sends tab', () => {
    emitFromHeadlampTabSwitch('k8s')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_tab_switch', { tab: 'k8s' })
  })

  it('emitFromHeadlampCommandCopy sends tab, step, command', () => {
    emitFromHeadlampCommandCopy('k8s', 2, 'kubectl apply ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_command_copy', {
      tab: 'k8s',
      step: 2,
      command: 'kubectl apply ...',
    })
  })

  it('emitWhiteLabelViewed sends ksc_white_label_viewed', () => {
    emitWhiteLabelViewed()
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_viewed')
  })

  it('emitWhiteLabelActioned sends action', () => {
    emitWhiteLabelActioned('contact')
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_actioned', { action: 'contact' })
  })

  it('emitWhiteLabelTabSwitch sends tab', () => {
    emitWhiteLabelTabSwitch('pricing')
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_tab_switch', { tab: 'pricing' })
  })

  it('emitWhiteLabelCommandCopy sends tab, step, command', () => {
    emitWhiteLabelCommandCopy('pricing', 3, 'curl ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_command_copy', {
      tab: 'pricing',
      step: 3,
      command: 'curl ...',
    })
  })
})
