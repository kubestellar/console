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


})
