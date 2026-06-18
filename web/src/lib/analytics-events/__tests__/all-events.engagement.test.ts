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

