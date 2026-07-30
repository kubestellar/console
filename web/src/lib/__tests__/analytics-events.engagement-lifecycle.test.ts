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

  describe('Dashboard CRUD', () => {
    it('emitDashboardCreated sends dashboard name', () => {
      emitDashboardCreated('Production')
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_created', { dashboard_name: 'Production' })
    })

    it('emitDashboardDeleted sends event', () => {
      emitDashboardDeleted()
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_deleted')
    })

    it('emitDashboardRenamed sends event', () => {
      emitDashboardRenamed()
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_renamed')
    })

    it('emitDashboardImported sends event', () => {
      emitDashboardImported()
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_imported')
    })

    it('emitDashboardExported sends event', () => {
      emitDashboardExported()
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_exported')
    })
  })

  describe('Data Export', () => {
    it('emitDataExported sends export type and resource type', () => {
      emitDataExported('csv', 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_data_exported', { export_type: 'csv', resource_type: 'pods' })
    })

    it('emitDataExported defaults resource type to empty string', () => {
      emitDataExported('json')
      expect(mockSend).toHaveBeenCalledWith('ksc_data_exported', { export_type: 'json', resource_type: '' })
    })
  })

  describe('User Management', () => {
    it('emitUserRoleChanged sends new role', () => {
      emitUserRoleChanged('admin')
      expect(mockSend).toHaveBeenCalledWith('ksc_user_role_changed', { new_role: 'admin' })
    })

    it('emitUserRemoved sends event', () => {
      emitUserRemoved()
      expect(mockSend).toHaveBeenCalledWith('ksc_user_removed')
    })
  })

  describe('Insights', () => {
    it('emitInsightViewed sends insight category', () => {
      emitInsightViewed('security')
      expect(mockSend).toHaveBeenCalledWith('ksc_insight_viewed', { insight_category: 'security' })
    })
  })

  describe('Arcade Games', () => {
    it('emitGameStarted sends game name', () => {
      emitGameStarted('space-invaders')
      expect(mockSend).toHaveBeenCalledWith('ksc_game_started', { game_name: 'space-invaders' })
    })

    it('emitGameEnded sends game name, outcome, and score', () => {
      emitGameEnded('space-invaders', 'win', 9500)
      expect(mockSend).toHaveBeenCalledWith('ksc_game_ended', { game_name: 'space-invaders', outcome: 'win', score: 9500 })
    })
  })

  describe('Sidebar Navigation', () => {
    it('emitSidebarNavigated sends destination', () => {
      emitSidebarNavigated('/settings')
      expect(mockSend).toHaveBeenCalledWith('ksc_sidebar_navigated', { destination: '/settings' })
    })
  })

  describe('Local Cluster', () => {
    it('emitLocalClusterCreated sends tool', () => {
      emitLocalClusterCreated('kind')
      expect(mockSend).toHaveBeenCalledWith('ksc_local_cluster_created', { tool: 'kind' })
    })
  })

  describe('Developer Session', () => {
    it('emitDeveloperSession fires event for localhost deployment', () => {
      mockGetDeploymentType.mockReturnValue('localhost')
      emitDeveloperSession()
      expect(mockSend).toHaveBeenCalledWith('ksc_developer_session', { deployment_type: 'localhost' })
    })

    it('emitDeveloperSession skips if already sent', () => {
      localStorage.setItem('ksc-dev-session-sent', '1')
      emitDeveloperSession()
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('emitDeveloperSession skips for non-localhost deployment', () => {
      mockGetDeploymentType.mockReturnValue('console.kubestellar.io')
      emitDeveloperSession()
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('emitDeveloperSession skips for demo mode without token', () => {
      mockIsDemoMode.mockReturnValue(true)
      emitDeveloperSession()
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('emitDeveloperSession fires for demo mode with token', () => {
      mockIsDemoMode.mockReturnValue(true)
      localStorage.setItem('ksc-token', 'test-token')
      emitDeveloperSession()
      expect(mockSend).toHaveBeenCalledWith('ksc_developer_session', { deployment_type: 'localhost' })
    })
  })

  describe('Card Modal Browsing', () => {
    it('emitCardCategoryBrowsed sends category', () => {
      emitCardCategoryBrowsed('monitoring')
      expect(mockSend).toHaveBeenCalledWith('ksc_card_category_browsed', { category: 'monitoring' })
    })

    it('emitRecommendedCardShown sends card count and types', () => {
      emitRecommendedCardShown(['pods', 'events', 'gpu'])
      expect(mockSend).toHaveBeenCalledWith('ksc_recommended_cards_shown', {
        card_count: 3,
        card_types: 'pods,events,gpu',
      })
    })
  })

  describe('Dashboard Duration', () => {
    it('emitDashboardViewed sends dashboard id and duration', () => {
      emitDashboardViewed('main', 30000)
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_viewed', { dashboard_id: 'main', duration_ms: 30000 })
    })
  })

  describe('Feature Hints', () => {
    it('emitFeatureHintShown sends hint type', () => {
      emitFeatureHintShown('drag-reorder')
      expect(mockSend).toHaveBeenCalledWith('ksc_feature_hint_shown', { hint_type: 'drag-reorder' })
    })

    it('emitFeatureHintDismissed sends hint type', () => {
      emitFeatureHintDismissed('drag-reorder')
      expect(mockSend).toHaveBeenCalledWith('ksc_feature_hint_dismissed', { hint_type: 'drag-reorder' })
    })

    it('emitFeatureHintActioned sends hint type', () => {
      emitFeatureHintActioned('drag-reorder')
      expect(mockSend).toHaveBeenCalledWith('ksc_feature_hint_actioned', { hint_type: 'drag-reorder' })
    })
  })

  describe('Getting Started', () => {
    it('emitGettingStartedShown sends event', () => {
      emitGettingStartedShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_getting_started_shown')
    })

    it('emitGettingStartedActioned sends action', () => {
      emitGettingStartedActioned('connect_agent')
      expect(mockSend).toHaveBeenCalledWith('ksc_getting_started_actioned', { action: 'connect_agent' })
    })
  })

  describe('Post-Connect Activation', () => {
    it('emitPostConnectShown sends event', () => {
      emitPostConnectShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_post_connect_shown')
    })

    it('emitPostConnectActioned sends action', () => {
      emitPostConnectActioned('add_dashboard')
      expect(mockSend).toHaveBeenCalledWith('ksc_post_connect_actioned', { action: 'add_dashboard' })
    })
  })

  describe('Demo-to-Local CTA', () => {
    it('emitDemoToLocalShown sends event', () => {
      emitDemoToLocalShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_demo_to_local_shown')
    })

    it('emitDemoToLocalActioned sends action', () => {
      emitDemoToLocalActioned('install')
      expect(mockSend).toHaveBeenCalledWith('ksc_demo_to_local_actioned', { action: 'install' })
    })
  })

  describe('Adopter Nudge', () => {
    it('emitAdopterNudgeShown sends event', () => {
      emitAdopterNudgeShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_adopter_nudge_shown')
    })

    it('emitAdopterNudgeActioned sends action', () => {
      emitAdopterNudgeActioned('edit_adopters')
      expect(mockSend).toHaveBeenCalledWith('ksc_adopter_nudge_actioned', { action: 'edit_adopters' })
    })
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
