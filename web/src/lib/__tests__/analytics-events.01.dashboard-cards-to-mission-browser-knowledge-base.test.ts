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


})
