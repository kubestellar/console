/* eslint-disable @typescript-eslint/no-unused-vars */
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
  emitMissionError,
  emitMissionRated,
  emitFixerSearchStarted,
  emitFixerSearchCompleted,
  emitFixerBrowsed,
  emitFixerViewed,
  emitFixerImported,
  emitFixerImportError,
  emitFixerLinkCopied,
  emitFixerGitHubLink,
  emitLogin,
  emitLogout,
  emitFeedbackSubmitted,
  emitScreenshotAttached,
  emitScreenshotUploadFailed,
  emitScreenshotUploadSuccess,
  emitNPSSurveyShown,
  emitNPSResponse,
  emitNPSDismissed,
  emitOrbitMissionCreated,
  emitOrbitMissionRun,
  emitGroundControlDashboardCreated,
  emitGroundControlCardRequestOpened,
  emitSessionExpired,
  emitTourStarted,
  emitTourCompleted,
  emitTourSkipped,
  emitMarketplaceInstall,
  emitMarketplaceRemove,
  emitMarketplaceInstallFailed,
  emitThemeChanged,
  emitLanguageChanged,
  emitAIModeChanged,
  emitAIPredictionsToggled,
  emitConfidenceThresholdChanged,
  emitConsensusModeToggled,
  emitGitHubTokenConfigured,
  emitGitHubTokenRemoved,
  emitApiProviderConnected,
  emitDemoModeToggled,
  emitAgentTokenFailure,
  emitWsAuthMissing,
  emitSseAuthFailure,
  emitSessionRefreshFailure,
  emitAgentConnected,
  emitAgentDisconnected,
  emitClusterInventory,
  emitAgentProvidersDetected,
  emitApiKeyConfigured,
  emitApiKeyRemoved,
  emitInstallCommandCopied,
  emitConversionStep,
  emitDeployWorkload,
  emitDeployTemplateApplied,
  emitComplianceDrillDown,
  emitComplianceFilterChanged,
  emitBenchmarkViewed,
  emitClusterCreated,
  emitGitHubConnected,
  emitClusterAction,
  emitClusterStatsDrillDown,
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
  emitCardRecommendationsShown,
  emitCardRecommendationActioned,
  emitMissionSuggestionsShown,
  emitMissionSuggestionActioned,
  emitAddCardModalOpened,
  emitAddCardModalAbandoned,
  emitDashboardScrolled,
  emitPwaPromptShown,
  emitPwaPromptDismissed,
  emitLinkedInShare,
  emitSessionContext,
  emitUpdateChecked,
  emitUpdateTriggered,
  emitUpdateCompleted,
  emitUpdateFailed,
  emitUpdateRefreshed,
  emitUpdateStalled,
  emitDrillDownOpened,
  emitDrillDownClosed,
  emitCardRefreshed,
  emitGlobalClusterFilterChanged,
  emitGlobalSeverityFilterChanged,
  emitGlobalStatusFilterChanged,
  emitPredictionFeedbackSubmitted,
  emitSnoozed,
  emitUnsnoozed,
  emitDashboardCreated,
  emitDashboardDeleted,
  emitDashboardRenamed,
  emitDashboardImported,
  emitDashboardExported,
  emitDataExported,
  emitUserRoleChanged,
  emitUserRemoved,
  emitMarketplaceItemViewed,
  emitInsightViewed,
  emitGameStarted,
  emitGameEnded,
  emitSidebarNavigated,
  emitLocalClusterCreated,
  emitDeveloperSession,
  emitCardCategoryBrowsed,
  emitRecommendedCardShown,
  emitDashboardViewed,
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
  emitModalOpened,
  emitModalTabViewed,
  emitModalClosed,
  emitInsightAcknowledged,
  emitInsightDismissed,
  emitActionClicked,
  emitAISuggestionViewed,
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
  emitTipShown,
  emitStreakDay,
  emitBlogPostClicked,
  emitWhatsNewModalOpened,
  emitWhatsNewUpdateClicked,
  emitWhatsNewRemindLater,
  emitACMMScanned,
  emitACMMMissionLaunched,
  emitACMMLevelMissionLaunched,
} from '../analytics-events'

const mockSend = vi.mocked(send)
const mockSetProps = vi.mocked(setAnalyticsUserProperties)
const mockEmitError = vi.mocked(emitError)
const mockIsDemoMode = vi.mocked(isDemoMode)
const mockGetDeploymentType = vi.mocked(getDeploymentType)

describe('analytics-events', () => {
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


  describe('Widget Tracking', () => {
    it('emitWidgetLoaded sends mode', () => {
      emitWidgetLoaded('standalone')
      expect(mockSend).toHaveBeenCalledWith('ksc_widget_loaded', { mode: 'standalone' })
    })

    it('emitWidgetNavigation sends target path', () => {
      emitWidgetNavigation('/dashboard')
      expect(mockSend).toHaveBeenCalledWith('ksc_widget_navigation', { target_path: '/dashboard' })
    })

    it('emitWidgetInstalled sends method', () => {
      emitWidgetInstalled('pwa-prompt')
      expect(mockSend).toHaveBeenCalledWith('ksc_widget_installed', { method: 'pwa-prompt' })
    })

    it('emitWidgetDownloaded sends widget type', () => {
      emitWidgetDownloaded('uebersicht')
      expect(mockSend).toHaveBeenCalledWith('ksc_widget_downloaded', { widget_type: 'uebersicht' })
    })
  })


  describe('Engagement Nudges', () => {
    it('emitNudgeShown sends nudge type', () => {
      emitNudgeShown('add-card')
      expect(mockSend).toHaveBeenCalledWith('ksc_nudge_shown', { nudge_type: 'add-card' })
    })

    it('emitNudgeDismissed sends nudge type', () => {
      emitNudgeDismissed('add-card')
      expect(mockSend).toHaveBeenCalledWith('ksc_nudge_dismissed', { nudge_type: 'add-card' })
    })

    it('emitNudgeActioned sends nudge type', () => {
      emitNudgeActioned('add-card')
      expect(mockSend).toHaveBeenCalledWith('ksc_nudge_actioned', { nudge_type: 'add-card' })
    })

    it('emitSmartSuggestionsShown sends card count', () => {
      emitSmartSuggestionsShown(4)
      expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestions_shown', { card_count: 4 })
    })

    it('emitSmartSuggestionAccepted sends card type', () => {
      emitSmartSuggestionAccepted('gpu-monitor')
      expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestion_accepted', { card_type: 'gpu-monitor' })
    })

    it('emitSmartSuggestionsAddAll sends card count', () => {
      emitSmartSuggestionsAddAll(6)
      expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestions_add_all', { card_count: 6 })
    })
  })


  describe('Card Recommendations', () => {
    it('emitCardRecommendationsShown sends card and high priority counts', () => {
      emitCardRecommendationsShown(8, 3)
      expect(mockSend).toHaveBeenCalledWith('ksc_card_recommendations_shown', { card_count: 8, high_priority_count: 3 })
    })

    it('emitCardRecommendationActioned sends card type and priority', () => {
      emitCardRecommendationActioned('security', 'high')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_recommendation_actioned', { card_type: 'security', priority: 'high' })
    })
  })


  describe('Mission Suggestions', () => {
    it('emitMissionSuggestionsShown sends suggestion and critical counts', () => {
      emitMissionSuggestionsShown(5, 2)
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_suggestions_shown', { suggestion_count: 5, critical_count: 2 })
    })

    it('emitMissionSuggestionActioned sends mission type, priority, and action', () => {
      emitMissionSuggestionActioned('security-scan', 'critical', 'start')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_suggestion_actioned', {
        mission_type: 'security-scan',
        priority: 'critical',
        action: 'start',
      })
    })
  })


  describe('"Almost" Action Tracking', () => {
    it('emitAddCardModalOpened sends event', () => {
      emitAddCardModalOpened()
      expect(mockSend).toHaveBeenCalledWith('ksc_add_card_modal_opened')
    })

    it('emitAddCardModalAbandoned sends event', () => {
      emitAddCardModalAbandoned()
      expect(mockSend).toHaveBeenCalledWith('ksc_add_card_modal_abandoned')
    })

    it('emitDashboardScrolled sends depth', () => {
      emitDashboardScrolled('deep')
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_scrolled', { depth: 'deep' })
    })

    it('emitPwaPromptShown sends event', () => {
      emitPwaPromptShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_pwa_prompt_shown')
    })

    it('emitPwaPromptDismissed sends event', () => {
      emitPwaPromptDismissed()
      expect(mockSend).toHaveBeenCalledWith('ksc_pwa_prompt_dismissed')
    })
  })


  describe('LinkedIn Share', () => {
    it('emitLinkedInShare sends source', () => {
      emitLinkedInShare('dashboard')
      expect(mockSend).toHaveBeenCalledWith('ksc_linkedin_share', { source: 'dashboard' })
    })
  })


  describe('Session Context', () => {
    it('emitSessionContext sets user properties and fires session start event', () => {
      emitSessionContext('homebrew', 'stable')
      expect(mockSetProps).toHaveBeenCalledWith({
        install_method: 'homebrew',
        update_channel: 'stable',
      })
      expect(mockSend).toHaveBeenCalledWith('ksc_session_start', {
        install_method: 'homebrew',
        update_channel: 'stable',
      })
    })

    it('emitSessionContext only fires session start once per session', () => {
      emitSessionContext('homebrew', 'stable')
      emitSessionContext('homebrew', 'stable')
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSetProps).toHaveBeenCalledTimes(2)
    })
  })


  describe('Settings: Update', () => {
    it('emitUpdateChecked sends event', () => {
      emitUpdateChecked()
      expect(mockSend).toHaveBeenCalledWith('ksc_update_checked')
    })

    it('emitUpdateTriggered sends event', () => {
      emitUpdateTriggered()
      expect(mockSend).toHaveBeenCalledWith('ksc_update_triggered')
    })

    it('emitUpdateCompleted sends duration', () => {
      emitUpdateCompleted(5000)
      expect(mockSend).toHaveBeenCalledWith('ksc_update_completed', { duration_ms: 5000 })
    })

    it('emitUpdateFailed truncates error to 100 chars', () => {
      emitUpdateFailed('z'.repeat(150))
      expect(mockSend).toHaveBeenCalledWith('ksc_update_failed', { error_detail: 'z'.repeat(100) })
    })

    it('emitUpdateRefreshed sends event', () => {
      emitUpdateRefreshed()
      expect(mockSend).toHaveBeenCalledWith('ksc_update_refreshed')
    })

    it('emitUpdateStalled sends event', () => {
      emitUpdateStalled()
      expect(mockSend).toHaveBeenCalledWith('ksc_update_stalled')
    })
  })


  describe('Drill-Down', () => {
    it('emitDrillDownOpened sends view type', () => {
      emitDrillDownOpened('pod')
      expect(mockSend).toHaveBeenCalledWith('ksc_drill_down_opened', { view_type: 'pod' })
    })

    it('emitDrillDownClosed sends view type and depth', () => {
      emitDrillDownClosed('pod', 2)
      expect(mockSend).toHaveBeenCalledWith('ksc_drill_down_closed', { view_type: 'pod', depth: 2 })
    })
  })


  describe('Card Refresh', () => {
    it('emitCardRefreshed sends card type', () => {
      emitCardRefreshed('events')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_refreshed', { card_type: 'events' })
    })
  })


  describe('Global Filters', () => {
    it('emitGlobalClusterFilterChanged sends counts', () => {
      emitGlobalClusterFilterChanged(3, 10)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_cluster_filter_changed', { selected_count: 3, total_count: 10 })
    })

    it('emitGlobalSeverityFilterChanged sends selected count', () => {
      emitGlobalSeverityFilterChanged(2)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_severity_filter_changed', { selected_count: 2 })
    })

    it('emitGlobalStatusFilterChanged sends selected count', () => {
      emitGlobalStatusFilterChanged(4)
      expect(mockSend).toHaveBeenCalledWith('ksc_global_status_filter_changed', { selected_count: 4 })
    })
  })


  describe('Prediction Feedback', () => {
    it('emitPredictionFeedbackSubmitted sends feedback, type, and provider', () => {
      emitPredictionFeedbackSubmitted('thumbs_up', 'anomaly', 'claude')
      expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
        feedback: 'thumbs_up',
        prediction_type: 'anomaly',
        provider: 'claude',
      })
    })

    it('emitPredictionFeedbackSubmitted defaults provider to unknown', () => {
      emitPredictionFeedbackSubmitted('thumbs_down', 'trend')
      expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
        feedback: 'thumbs_down',
        prediction_type: 'trend',
        provider: 'unknown',
      })
    })
  })


  describe('Snooze', () => {
    it('emitSnoozed sends target type and duration', () => {
      emitSnoozed('alert', '1h')
      expect(mockSend).toHaveBeenCalledWith('ksc_snoozed', { target_type: 'alert', duration: '1h' })
    })

    it('emitSnoozed defaults duration to default', () => {
      emitSnoozed('card')
      expect(mockSend).toHaveBeenCalledWith('ksc_snoozed', { target_type: 'card', duration: 'default' })
    })

    it('emitUnsnoozed sends target type', () => {
      emitUnsnoozed('alert')
      expect(mockSend).toHaveBeenCalledWith('ksc_unsnoozed', { target_type: 'alert' })
    })
  })


})
