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

    it('emitMissionError sends mission type, error code, and trimmed detail', () => {
      emitMissionError('install', 'timeout', 'connection timed out after 30s')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
        mission_type: 'install',
        error_code: 'timeout',
        error_detail: 'connection timed out after 30s',
      })
    })

    it('emitMissionError truncates error detail to 100 characters', () => {
      const longDetail = 'x'.repeat(150)
      emitMissionError('install', 'timeout', longDetail)
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
        mission_type: 'install',
        error_code: 'timeout',
        error_detail: 'x'.repeat(100),
      })
    })

    it('emitMissionError sends empty string when detail is undefined', () => {
      emitMissionError('install', 'timeout')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
        mission_type: 'install',
        error_code: 'timeout',
        error_detail: '',
      })
    })

    it('emitMissionError trims whitespace from detail', () => {
      emitMissionError('install', 'timeout', '  some error  ')
      expect(mockSend).toHaveBeenCalledWith('ksc_mission_error', {
        mission_type: 'install',
        error_code: 'timeout',
        error_detail: 'some error',
      })
    })

    it('emitMissionRated sends with bypassOptOut', () => {
      emitMissionRated('install', 'positive')
      expect(mockSend).toHaveBeenCalledWith(
        'ksc_mission_rated',
        { mission_type: 'install', rating: 'positive' },
        { bypassOptOut: true },
      )
    })
  })

  describe('Mission Browser / Knowledge Base', () => {
    it('emitFixerSearchStarted sends cluster_connected', () => {
      emitFixerSearchStarted(true)
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_search', { cluster_connected: true })
    })

    it('emitFixerSearchCompleted sends found and scanned counts', () => {
      emitFixerSearchCompleted(5, 20)
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_search_done', { found: 5, scanned: 20 })
    })

    it('emitFixerBrowsed sends path', () => {
      emitFixerBrowsed('/missions/install-istio')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_browsed', { path: '/missions/install-istio' })
    })

    it('emitFixerViewed sends title and cncfProject', () => {
      emitFixerViewed('Install Istio', 'istio')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_viewed', { title: 'Install Istio', cncf_project: 'istio' })
    })

    it('emitFixerViewed defaults cncfProject to empty string', () => {
      emitFixerViewed('Custom Mission')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_viewed', { title: 'Custom Mission', cncf_project: '' })
    })

    it('emitFixerImported sends title and cncfProject', () => {
      emitFixerImported('Install Falco', 'falco')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_imported', { title: 'Install Falco', cncf_project: 'falco' })
    })

    it('emitFixerImported defaults cncfProject to empty string', () => {
      emitFixerImported('Custom')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_imported', { title: 'Custom', cncf_project: '' })
    })

    it('emitFixerImportError sends title, error count, and truncated first error', () => {
      emitFixerImportError('Mission', 3, 'a'.repeat(150))
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_import_error', {
        title: 'Mission',
        error_count: '3',
        first_error: 'a'.repeat(100),
      })
    })

    it('emitFixerLinkCopied sends title and cncfProject', () => {
      emitFixerLinkCopied('Install Cert Manager', 'cert-manager')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_link_copied', { title: 'Install Cert Manager', cncf_project: 'cert-manager' })
    })

    it('emitFixerLinkCopied defaults cncfProject to empty string', () => {
      emitFixerLinkCopied('Custom')
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_link_copied', { title: 'Custom', cncf_project: '' })
    })

    it('emitFixerGitHubLink sends event with no params', () => {
      emitFixerGitHubLink()
      expect(mockSend).toHaveBeenCalledWith('ksc_fixer_github_link')
    })
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
