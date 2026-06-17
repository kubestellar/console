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


  describe('Dashboard Excellence: Modal & Action Events', () => {
    it('emitModalOpened sends modal type and source card', () => {
      emitModalOpened('pod-detail', 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_modal_opened', { modal_type: 'pod-detail', source_card: 'pods' })
    })

    it('emitModalTabViewed sends modal type and tab name', () => {
      emitModalTabViewed('pod-detail', 'logs')
      expect(mockSend).toHaveBeenCalledWith('ksc_modal_tab_viewed', { modal_type: 'pod-detail', tab_name: 'logs' })
    })

    it('emitModalClosed sends modal type and duration', () => {
      emitModalClosed('pod-detail', 15000)
      expect(mockSend).toHaveBeenCalledWith('ksc_modal_closed', { modal_type: 'pod-detail', duration_ms: 15000 })
    })

    it('emitInsightAcknowledged sends category and severity', () => {
      emitInsightAcknowledged('security', 'critical')
      expect(mockSend).toHaveBeenCalledWith('ksc_insight_acknowledged', { insight_category: 'security', insight_severity: 'critical' })
    })

    it('emitInsightDismissed sends category and severity', () => {
      emitInsightDismissed('performance', 'warning')
      expect(mockSend).toHaveBeenCalledWith('ksc_insight_dismissed', { insight_category: 'performance', insight_severity: 'warning' })
    })

    it('emitActionClicked sends action type, source card, and dashboard', () => {
      emitActionClicked('restart', 'pods', 'main')
      expect(mockSend).toHaveBeenCalledWith('ksc_action_clicked', { action_type: 'restart', source_card: 'pods', dashboard: 'main' })
    })

    it('emitAISuggestionViewed sends insight category and AI enrichment flag', () => {
      emitAISuggestionViewed('resource-optimization', true)
      expect(mockSend).toHaveBeenCalledWith('ksc_ai_suggestion_viewed', { insight_category: 'resource-optimization', has_ai_enrichment: true })
    })
  })


  describe('Welcome / Conference Landing Page', () => {
    it('emitWelcomeViewed sends ref', () => {
      emitWelcomeViewed('kubecon-2026')
      expect(mockSend).toHaveBeenCalledWith('ksc_welcome_viewed', { ref: 'kubecon-2026' })
    })

    it('emitWelcomeActioned sends action and ref', () => {
      emitWelcomeActioned('hero_explore_demo', 'kubecon-2026')
      expect(mockSend).toHaveBeenCalledWith('ksc_welcome_actioned', { action: 'hero_explore_demo', ref: 'kubecon-2026' })
    })
  })


  describe('From Lens Landing Page', () => {
    it('emitFromLensViewed sends event', () => {
      emitFromLensViewed()
      expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_viewed')
    })

    it('emitFromLensActioned sends action', () => {
      emitFromLensActioned('hero_try_demo')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_actioned', { action: 'hero_try_demo' })
    })

    it('emitFromLensTabSwitch sends tab', () => {
      emitFromLensTabSwitch('cluster-portforward')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_tab_switch', { tab: 'cluster-portforward' })
    })

    it('emitFromLensCommandCopy sends tab, step, and command', () => {
      emitFromLensCommandCopy('localhost', 1, 'brew install kc')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_command_copy', { tab: 'localhost', step: 1, command: 'brew install kc' })
    })
  })


  describe('From Headlamp Landing Page', () => {
    it('emitFromHeadlampViewed sends event', () => {
      emitFromHeadlampViewed()
      expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_viewed')
    })

    it('emitFromHeadlampActioned sends action', () => {
      emitFromHeadlampActioned('hero_try_demo')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_actioned', { action: 'hero_try_demo' })
    })

    it('emitFromHeadlampTabSwitch sends tab', () => {
      emitFromHeadlampTabSwitch('cluster-ingress')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_tab_switch', { tab: 'cluster-ingress' })
    })

    it('emitFromHeadlampCommandCopy sends tab, step, and command', () => {
      emitFromHeadlampCommandCopy('localhost', 2, 'kubectl apply -f')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_command_copy', { tab: 'localhost', step: 2, command: 'kubectl apply -f' })
    })
  })


  describe('White Label Landing Page', () => {
    it('emitWhiteLabelViewed sends event', () => {
      emitWhiteLabelViewed()
      expect(mockSend).toHaveBeenCalledWith('ksc_white_label_viewed')
    })

    it('emitWhiteLabelActioned sends action', () => {
      emitWhiteLabelActioned('hero_view_github')
      expect(mockSend).toHaveBeenCalledWith('ksc_white_label_actioned', { action: 'hero_view_github' })
    })

    it('emitWhiteLabelTabSwitch sends tab', () => {
      emitWhiteLabelTabSwitch('helm')
      expect(mockSend).toHaveBeenCalledWith('ksc_white_label_tab_switch', { tab: 'helm' })
    })

    it('emitWhiteLabelCommandCopy sends tab, step, and command', () => {
      emitWhiteLabelCommandCopy('docker', 1, 'docker pull')
      expect(mockSend).toHaveBeenCalledWith('ksc_white_label_command_copy', { tab: 'docker', step: 1, command: 'docker pull' })
    })
  })


  describe('Rotating Tips & Streaks', () => {
    it('emitTipShown sends page and tip', () => {
      emitTipShown('/dashboard', 'Did you know: Drag cards to reorder')
      expect(mockSend).toHaveBeenCalledWith('ksc_tip_shown', { page: '/dashboard', tip: 'Did you know: Drag cards to reorder' })
    })

    it('emitStreakDay sends streak count', () => {
      emitStreakDay(7)
      expect(mockSend).toHaveBeenCalledWith('ksc_streak_day', { streak_count: 7 })
    })

    it('emitBlogPostClicked sends blog title', () => {
      emitBlogPostClicked('New Features in v2.0')
      expect(mockSend).toHaveBeenCalledWith('ksc_blog_post_clicked', { blog_title: 'New Features in v2.0' })
    })
  })


  describe("What's New Modal", () => {
    it('emitWhatsNewModalOpened sends release tag', () => {
      emitWhatsNewModalOpened('v2.0.0')
      expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_modal_opened', { release_tag: 'v2.0.0' })
    })

    it('emitWhatsNewUpdateClicked sends tag and install method', () => {
      emitWhatsNewUpdateClicked('v2.0.0', 'homebrew')
      expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_update_clicked', { release_tag: 'v2.0.0', install_method: 'homebrew' })
    })

    it('emitWhatsNewRemindLater sends tag and snooze duration', () => {
      emitWhatsNewRemindLater('v2.0.0', '24h')
      expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_remind_later', { release_tag: 'v2.0.0', snooze_duration: '24h' })
    })
  })


  describe('ACMM Dashboard', () => {
    it('emitACMMScanned sends repo, level, detected, and total', () => {
      emitACMMScanned('kubestellar/console', 3, 15, 20)
      expect(mockSend).toHaveBeenCalledWith('ksc_acmm_scanned', {
        repo: 'kubestellar/console',
        acmm_level: 3,
        detected: 15,
        total: 20,
      })
    })

    it('emitACMMMissionLaunched sends repo, criterion details, and target level', () => {
      emitACMMMissionLaunched('kubestellar/console', 'crit-123', 'acmm', 4)
      expect(mockSend).toHaveBeenCalledWith('ksc_acmm_mission_launched', {
        repo: 'kubestellar/console',
        criterion_id: 'crit-123',
        criterion_source: 'acmm',
        target_level: 4,
      })
    })

    it('emitACMMLevelMissionLaunched sends repo, target level, and criteria count', () => {
      emitACMMLevelMissionLaunched('kubestellar/console', 2, 5)
      expect(mockSend).toHaveBeenCalledWith('ksc_acmm_level_mission_launched', {
        repo: 'kubestellar/console',
        target_level: 2,
        criteria_count: 5,
      })
    })
  })

})
