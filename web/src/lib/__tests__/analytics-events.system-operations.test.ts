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
})
