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


  describe('Auth', () => {
    it('emitLogin sends method', () => {
      emitLogin('github')
      expect(mockSend).toHaveBeenCalledWith('login', { method: 'github' })
    })

    it('emitLogout sends event', () => {
      emitLogout()
      expect(mockSend).toHaveBeenCalledWith('ksc_logout')
    })
  })


  describe('Feedback', () => {
    it('emitFeedbackSubmitted sends feedback type', () => {
      emitFeedbackSubmitted('bug')
      expect(mockSend).toHaveBeenCalledWith('ksc_feedback_submitted', { feedback_type: 'bug' })
    })

    it('emitScreenshotAttached sends method and count', () => {
      emitScreenshotAttached('paste', 2)
      expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_attached', { method: 'paste', count: 2 })
    })

    it('emitScreenshotUploadFailed truncates error to 100 chars', () => {
      const longError = 'e'.repeat(150)
      emitScreenshotUploadFailed(longError, 3)
      expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_upload_failed', {
        error: 'e'.repeat(100),
        screenshot_count: 3,
      })
    })

    it('emitScreenshotUploadSuccess sends screenshot count', () => {
      emitScreenshotUploadSuccess(2)
      expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_upload_success', { screenshot_count: 2 })
    })
  })


  describe('NPS Survey', () => {
    it('emitNPSSurveyShown bypasses opt-out', () => {
      emitNPSSurveyShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_nps_survey_shown', undefined, { bypassOptOut: true })
    })

    it('emitNPSResponse sends score and category with bypassOptOut', () => {
      emitNPSResponse(9, 'promoter')
      expect(mockSend).toHaveBeenCalledWith(
        'ksc_nps_response',
        { nps_score: 9, nps_category: 'promoter' },
        { bypassOptOut: true },
      )
    })

    it('emitNPSResponse includes feedback length when provided', () => {
      emitNPSResponse(7, 'passive', 42)
      expect(mockSend).toHaveBeenCalledWith(
        'ksc_nps_response',
        { nps_score: 7, nps_category: 'passive', nps_feedback_length: 42 },
        { bypassOptOut: true },
      )
    })

    it('emitNPSResponse omits feedback length when undefined', () => {
      emitNPSResponse(3, 'detractor')
      const params = mockSend.mock.calls[0][1] as Record<string, unknown>
      expect(params).not.toHaveProperty('nps_feedback_length')
    })

    it('emitNPSDismissed sends dismiss count with bypassOptOut', () => {
      emitNPSDismissed(2)
      expect(mockSend).toHaveBeenCalledWith(
        'ksc_nps_dismissed',
        { dismiss_count: 2 },
        { bypassOptOut: true },
      )
    })
  })


  describe('Orbit', () => {
    it('emitOrbitMissionCreated sends orbit type and cadence', () => {
      emitOrbitMissionCreated('cert-renewal', 'weekly')
      expect(mockSend).toHaveBeenCalledWith('ksc_orbit_mission_created', { orbit_type: 'cert-renewal', cadence: 'weekly' })
    })

    it('emitOrbitMissionRun sends orbit type and result', () => {
      emitOrbitMissionRun('cert-renewal', 'success')
      expect(mockSend).toHaveBeenCalledWith('ksc_orbit_mission_run', { orbit_type: 'cert-renewal', result: 'success' })
    })

    it('emitGroundControlDashboardCreated sends card count', () => {
      emitGroundControlDashboardCreated(5)
      expect(mockSend).toHaveBeenCalledWith('ksc_ground_control_dashboard_created', { card_count: 5 })
    })

    it('emitGroundControlCardRequestOpened sends project', () => {
      emitGroundControlCardRequestOpened('istio')
      expect(mockSend).toHaveBeenCalledWith('ksc_ground_control_card_request', { project: 'istio' })
    })
  })


  describe('Errors', () => {
    it('emitSessionExpired sends event', () => {
      emitSessionExpired()
      expect(mockSend).toHaveBeenCalledWith('ksc_session_expired')
    })
  })


  describe('Tour', () => {
    it('emitTourStarted sends event', () => {
      emitTourStarted()
      expect(mockSend).toHaveBeenCalledWith('ksc_tour_started')
    })

    it('emitTourCompleted sends step count', () => {
      emitTourCompleted(8)
      expect(mockSend).toHaveBeenCalledWith('ksc_tour_completed', { step_count: 8 })
    })

    it('emitTourSkipped sends at_step', () => {
      emitTourSkipped(3)
      expect(mockSend).toHaveBeenCalledWith('ksc_tour_skipped', { at_step: 3 })
    })
  })


  describe('Marketplace', () => {
    it('emitMarketplaceInstall sends item type and name', () => {
      emitMarketplaceInstall('card', 'gpu-monitor')
      expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install', { item_type: 'card', item_name: 'gpu-monitor' })
    })

    it('emitMarketplaceRemove sends item type', () => {
      emitMarketplaceRemove('card')
      expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_remove', { item_type: 'card' })
    })

    it('emitMarketplaceInstallFailed truncates error to 100 chars', () => {
      emitMarketplaceInstallFailed('card', 'gpu-monitor', 'f'.repeat(150))
      expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install_failed', {
        item_type: 'card',
        item_name: 'gpu-monitor',
        error_detail: 'f'.repeat(100),
      })
    })

    it('emitMarketplaceItemViewed sends item type and name', () => {
      emitMarketplaceItemViewed('mission', 'install-istio')
      expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_item_viewed', { item_type: 'mission', item_name: 'install-istio' })
    })
  })


  describe('Theme & Language', () => {
    it('emitThemeChanged sends theme id and source', () => {
      emitThemeChanged('dark-plus', 'settings')
      expect(mockSend).toHaveBeenCalledWith('ksc_theme_changed', { theme_id: 'dark-plus', source: 'settings' })
    })

    it('emitLanguageChanged sends language code', () => {
      emitLanguageChanged('ja')
      expect(mockSend).toHaveBeenCalledWith('ksc_language_changed', { language: 'ja' })
    })
  })


  describe('AI Settings', () => {
    it('emitAIModeChanged sends mode', () => {
      emitAIModeChanged('high')
      expect(mockSend).toHaveBeenCalledWith('ksc_ai_mode_changed', { mode: 'high' })
    })

    it('emitAIPredictionsToggled sends enabled as string', () => {
      emitAIPredictionsToggled(true)
      expect(mockSend).toHaveBeenCalledWith('ksc_ai_predictions_toggled', { enabled: 'true' })
    })

    it('emitConfidenceThresholdChanged sends threshold value', () => {
      emitConfidenceThresholdChanged(0.85)
      expect(mockSend).toHaveBeenCalledWith('ksc_confidence_threshold_changed', { threshold: 0.85 })
    })

    it('emitConsensusModeToggled sends enabled as string', () => {
      emitConsensusModeToggled(false)
      expect(mockSend).toHaveBeenCalledWith('ksc_consensus_mode_toggled', { enabled: 'false' })
    })
  })


  describe('GitHub Token', () => {
    it('emitGitHubTokenConfigured sends event', () => {
      emitGitHubTokenConfigured()
      expect(mockSend).toHaveBeenCalledWith('ksc_github_token_configured')
    })

    it('emitGitHubTokenRemoved sends event', () => {
      emitGitHubTokenRemoved()
      expect(mockSend).toHaveBeenCalledWith('ksc_github_token_removed')
    })
  })


  describe('API Provider', () => {
    it('emitApiProviderConnected sends provider', () => {
      emitApiProviderConnected('openai')
      expect(mockSend).toHaveBeenCalledWith('ksc_api_provider_connected', { provider: 'openai' })
    })
  })


  describe('Demo Mode', () => {
    it('emitDemoModeToggled sends enabled and sets user property', () => {
      emitDemoModeToggled(true)
      expect(mockSend).toHaveBeenCalledWith('ksc_demo_mode_toggled', { enabled: 'true' })
      expect(mockSetProps).toHaveBeenCalledWith({ demo_mode: 'true' })
    })

    it('emitDemoModeToggled sends false and updates user property', () => {
      emitDemoModeToggled(false)
      expect(mockSend).toHaveBeenCalledWith('ksc_demo_mode_toggled', { enabled: 'false' })
      expect(mockSetProps).toHaveBeenCalledWith({ demo_mode: 'false' })
    })
  })


})
