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

  describe('Auth / Connection Failure Detection', () => {
    it('emitAgentTokenFailure delegates to throttled emitError with agent_token_failure category', () => {
      emitAgentTokenFailure('empty token from /api/agent/token')
      expect(mockEmitError).toHaveBeenCalledWith(
        'agent_token_failure',
        'empty token from /api/agent/token',
      )
    })

    it('emitAgentTokenFailure truncates reason to 100 characters', () => {
      const longReason = 'x'.repeat(150)
      emitAgentTokenFailure(longReason)
      expect(mockEmitError).toHaveBeenCalledWith(
        'agent_token_failure',
        'x'.repeat(100),
      )
    })

    it('emitWsAuthMissing delegates to throttled emitError with ws_auth_missing category and strips host', () => {
      emitWsAuthMissing('ws://127.0.0.1:8585/ws')
      expect(mockEmitError).toHaveBeenCalledWith(
        'ws_auth_missing',
        '/ws',
      )
    })

    it('emitSseAuthFailure delegates to throttled emitError with sse_auth_failure category and strips host', () => {
      emitSseAuthFailure('http://127.0.0.1:8585/pods/stream?cluster=test')
      expect(mockEmitError).toHaveBeenCalledWith(
        'sse_auth_failure',
        '/pods/stream?cluster=test',
      )
    })

    it('emitSessionRefreshFailure delegates to throttled emitError with session_refresh_failure category', () => {
      emitSessionRefreshFailure('network error')
      expect(mockEmitError).toHaveBeenCalledWith(
        'session_refresh_failure',
        'network error',
      )
    })

    it('emitSessionRefreshFailure truncates reason to 100 characters', () => {
      const longReason = 'a]'.repeat(75)
      emitSessionRefreshFailure(longReason)
      expect(mockEmitError).toHaveBeenCalledWith(
        'session_refresh_failure',
        longReason.slice(0, 100),
      )
    })
  })

  describe('kc-agent Connection', () => {
    it('emitAgentConnected sends version and cluster count', () => {
      emitAgentConnected('1.2.3', 5)
      expect(mockSend).toHaveBeenCalledWith('ksc_agent_connected', { agent_version: '1.2.3', cluster_count: 5 })
    })

    it('emitAgentDisconnected sends event', () => {
      emitAgentDisconnected()
      expect(mockSend).toHaveBeenCalledWith('ksc_agent_disconnected')
    })
  })

  describe('Cluster Inventory', () => {
    it('emitClusterInventory sends counts and distribution params', () => {
      emitClusterInventory({
        total: 10,
        healthy: 7,
        unhealthy: 2,
        unreachable: 1,
        distributions: { eks: 3, gke: 5, kind: 2 },
      })
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_inventory', {
        cluster_count: 10,
        healthy_count: 7,
        unhealthy_count: 2,
        unreachable_count: 1,
        dist_eks: 3,
        dist_gke: 5,
        dist_kind: 2,
      })
      expect(mockSetProps).toHaveBeenCalledWith({ cluster_count: '10' })
    })

    it('emitClusterInventory handles empty distributions', () => {
      emitClusterInventory({
        total: 0,
        healthy: 0,
        unhealthy: 0,
        unreachable: 0,
        distributions: {},
      })
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_inventory', {
        cluster_count: 0,
        healthy_count: 0,
        unhealthy_count: 0,
        unreachable_count: 0,
      })
    })
  })

  describe('Agent Provider Detection', () => {
    it('emitAgentProvidersDetected categorizes CLI and API providers', () => {
      emitAgentProvidersDetected([
        { name: 'claude', displayName: 'Claude', capabilities: CAPABILITY_TOOL_EXEC | CAPABILITY_CHAT },
        { name: 'openai', displayName: 'OpenAI', capabilities: CAPABILITY_CHAT },
        { name: 'copilot', displayName: 'Copilot', capabilities: CAPABILITY_TOOL_EXEC },
      ])
      expect(mockSend).toHaveBeenCalledWith('ksc_agent_providers_detected', {
        provider_count: 3,
        cli_providers: 'claude,copilot',
        api_providers: 'openai',
        cli_count: 2,
        api_count: 1,
      })
    })

    it('emitAgentProvidersDetected returns early for empty array', () => {
      emitAgentProvidersDetected([])
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('emitAgentProvidersDetected returns early for null/undefined', () => {
      emitAgentProvidersDetected(null as unknown as [])
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('emitAgentProvidersDetected shows none when no CLI providers', () => {
      emitAgentProvidersDetected([
        { name: 'openai', displayName: 'OpenAI', capabilities: CAPABILITY_CHAT },
      ])
      expect(mockSend).toHaveBeenCalledWith('ksc_agent_providers_detected', expect.objectContaining({
        cli_providers: 'none',
        api_providers: 'openai',
      }))
    })
  })

  describe('API Keys', () => {
    it('emitApiKeyConfigured sends provider', () => {
      emitApiKeyConfigured('anthropic')
      expect(mockSend).toHaveBeenCalledWith('ksc_api_key_configured', { provider: 'anthropic' })
    })

    it('emitApiKeyRemoved sends provider', () => {
      emitApiKeyRemoved('anthropic')
      expect(mockSend).toHaveBeenCalledWith('ksc_api_key_removed', { provider: 'anthropic' })
    })
  })

  describe('Install Command', () => {
    it('emitInstallCommandCopied sends source and command', () => {
      emitInstallCommandCopied('setup_quickstart', 'brew install kubestellar')
      expect(mockSend).toHaveBeenCalledWith('ksc_install_command_copied', {
        source: 'setup_quickstart',
        command: 'brew install kubestellar',
      })
    })
  })

  describe('Conversion Funnel', () => {
    it('emitConversionStep sends step number, name, and optional details', () => {
      emitConversionStep(3, 'agent', { method: 'binary' })
      expect(mockSend).toHaveBeenCalledWith('ksc_conversion_step', {
        step_number: 3,
        step_name: 'agent',
        method: 'binary',
      })
    })

    it('emitConversionStep works without details', () => {
      emitConversionStep(1, 'discovery')
      expect(mockSend).toHaveBeenCalledWith('ksc_conversion_step', {
        step_number: 1,
        step_name: 'discovery',
      })
    })
  })

  describe('Deploy', () => {
    it('emitDeployWorkload sends workload name and cluster group', () => {
      emitDeployWorkload('nginx', 'production')
      expect(mockSend).toHaveBeenCalledWith('ksc_deploy_workload', { workload_name: 'nginx', cluster_group: 'production' })
    })

    it('emitDeployTemplateApplied sends template name', () => {
      emitDeployTemplateApplied('standard-web')
      expect(mockSend).toHaveBeenCalledWith('ksc_deploy_template_applied', { template_name: 'standard-web' })
    })
  })

  describe('Compliance', () => {
    it('emitComplianceDrillDown sends stat type', () => {
      emitComplianceDrillDown('violations')
      expect(mockSend).toHaveBeenCalledWith('ksc_compliance_drill_down', { stat_type: 'violations' })
    })

    it('emitComplianceFilterChanged sends filter type', () => {
      emitComplianceFilterChanged('severity')
      expect(mockSend).toHaveBeenCalledWith('ksc_compliance_filter_changed', { filter_type: 'severity' })
    })
  })

  describe('Benchmarks', () => {
    it('emitBenchmarkViewed sends benchmark type', () => {
      emitBenchmarkViewed('latency')
      expect(mockSend).toHaveBeenCalledWith('ksc_benchmark_viewed', { benchmark_type: 'latency' })
    })
  })

  describe('Cluster Lifecycle', () => {
    it('emitClusterCreated sends cluster name and auth type', () => {
      emitClusterCreated('prod-us-east', 'kubeconfig')
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_created', { cluster_name: 'prod-us-east', auth_type: 'kubeconfig' })
    })

    it('emitGitHubConnected sends event', () => {
      emitGitHubConnected()
      expect(mockSend).toHaveBeenCalledWith('ksc_github_connected')
    })
  })

  describe('Cluster Admin', () => {
    it('emitClusterAction sends action and cluster name', () => {
      emitClusterAction('cordon', 'worker-1')
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_action', { action: 'cordon', cluster_name: 'worker-1' })
    })

    it('emitClusterStatsDrillDown sends stat type', () => {
      emitClusterStatsDrillDown('cpu_usage')
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_stats_drill_down', { stat_type: 'cpu_usage' })
    })
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
