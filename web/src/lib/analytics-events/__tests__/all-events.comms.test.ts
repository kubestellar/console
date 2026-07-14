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

describe('analytics-events/feedback', () => {
  it('emitFeedbackSubmitted sends feedback_type', () => {
    emitFeedbackSubmitted('bug')
    expect(mockSend).toHaveBeenCalledWith('ksc_feedback_submitted', { feedback_type: 'bug' })
  })

  it('emitScreenshotAttached sends method and count', () => {
    emitScreenshotAttached('paste', 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_attached', { method: 'paste', count: 2 })
  })

  it('emitScreenshotUploadFailed truncates error and sends screenshot_count', () => {
    const longErr = 'x'.repeat(150)
    emitScreenshotUploadFailed(longErr, 1)
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect((payload.error as string).length).toBeLessThanOrEqual(100)
    expect(payload.screenshot_count).toBe(1)
  })

  it('emitScreenshotUploadSuccess sends screenshot_count', () => {
    emitScreenshotUploadSuccess(3)
    expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_upload_success', { screenshot_count: 3 })
  })

  it('emitNPSSurveyShown passes bypassOptOut: true', () => {
    emitNPSSurveyShown()
    expect(mockSend).toHaveBeenCalledWith('ksc_nps_survey_shown', undefined, { bypassOptOut: true })
  })

  it('emitNPSResponse sends score, category, and feedback_length', () => {
    emitNPSResponse(9, 'promoter', 50)
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_nps_response',
      expect.objectContaining({ nps_score: 9, nps_category: 'promoter', nps_feedback_length: 50 }),
      { bypassOptOut: true }
    )
  })

  it('emitNPSResponse omits feedback_length when undefined', () => {
    emitNPSResponse(5, 'passive')
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('nps_feedback_length')
  })

  it('emitNPSDismissed sends dismiss_count', () => {
    emitNPSDismissed(2)
    expect(mockSend).toHaveBeenCalledWith('ksc_nps_dismissed', { dismiss_count: 2 }, { bypassOptOut: true })
  })

  it('emitLinkedInShare sends source', () => {
    emitLinkedInShare('dashboard')
    expect(mockSend).toHaveBeenCalledWith('ksc_linkedin_share', { source: 'dashboard' })
  })

  it('emitPredictionFeedbackSubmitted sends feedback, prediction_type, provider', () => {
    emitPredictionFeedbackSubmitted('thumbs-up', 'anomaly', 'openai')
    expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
      feedback: 'thumbs-up',
      prediction_type: 'anomaly',
      provider: 'openai',
    })
  })

  it('emitPredictionFeedbackSubmitted defaults provider to "unknown"', () => {
    emitPredictionFeedbackSubmitted('thumbs-down', 'anomaly')
    expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
      feedback: 'thumbs-down',
      prediction_type: 'anomaly',
      provider: 'unknown',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// agent.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('analytics-events/agent', () => {
  it('emitAgentConnected sends agent_version and cluster_count', () => {
    emitAgentConnected('1.2.3', 5)
    expect(mockSend).toHaveBeenCalledWith('ksc_agent_connected', {
      agent_version: '1.2.3',
      cluster_count: 5,
    })
  })

  it('emitAgentDisconnected sends ksc_agent_disconnected', () => {
    emitAgentDisconnected()
    expect(mockSend).toHaveBeenCalledWith('ksc_agent_disconnected')
  })

  it('emitClusterInventory sends counts and calls setAnalyticsUserProperties', () => {
    emitClusterInventory({
      total: 3,
      healthy: 2,
      unhealthy: 1,
      unreachable: 0,
      distributions: { eks: 2, kind: 1 },
    })
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_cluster_inventory',
      expect.objectContaining({
        cluster_count: 3,
        healthy_count: 2,
        unhealthy_count: 1,
        unreachable_count: 0,
        dist_eks: 2,
        dist_kind: 1,
      })
    )
    expect(mockSetUserProps).toHaveBeenCalledWith({ cluster_count: '3' })
  })

  it('emitAgentProvidersDetected skips when providers empty', () => {
    emitAgentProvidersDetected([])
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('emitAgentProvidersDetected classifies CLI vs API providers', () => {
    // CAPABILITY_CHAT=1, CAPABILITY_TOOL_EXEC=2
    emitAgentProvidersDetected([
      { name: 'kubectl', capabilities: 2 },   // CLI (tool exec)
      { name: 'gpt-4', capabilities: 1 },     // API (chat only)
    ])
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_agent_providers_detected',
      expect.objectContaining({
        provider_count: 2,
        cli_providers: 'kubectl',
        api_providers: 'gpt-4',
        cli_count: 1,
        api_count: 1,
      })
    )
  })

  it('emitApiKeyConfigured sends provider', () => {
    emitApiKeyConfigured('openai')
    expect(mockSend).toHaveBeenCalledWith('ksc_api_key_configured', { provider: 'openai' })
  })

  it('emitApiKeyRemoved sends provider', () => {
    emitApiKeyRemoved('anthropic')
    expect(mockSend).toHaveBeenCalledWith('ksc_api_key_removed', { provider: 'anthropic' })
  })

  it('emitClusterCreated sends cluster_name and auth_type', () => {
    emitClusterCreated('my-cluster', 'kubeconfig')
    expect(mockSend).toHaveBeenCalledWith('ksc_cluster_created', {
      cluster_name: 'my-cluster',
      auth_type: 'kubeconfig',
    })
  })

  it('emitClusterAction sends action and cluster_name', () => {
    emitClusterAction('delete', 'my-cluster')
    expect(mockSend).toHaveBeenCalledWith('ksc_cluster_action', {
      action: 'delete',
      cluster_name: 'my-cluster',
    })
  })

  it('emitClusterStatsDrillDown sends stat_type', () => {
    emitClusterStatsDrillDown('nodes')
    expect(mockSend).toHaveBeenCalledWith('ksc_cluster_stats_drill_down', { stat_type: 'nodes' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// marketplace.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('analytics-events/marketplace', () => {
  it('emitMarketplaceInstall sends item_type and item_name', () => {
    emitMarketplaceInstall('extension', 'trivy')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install', {
      item_type: 'extension',
      item_name: 'trivy',
    })
  })

  it('emitMarketplaceRemove sends item_type', () => {
    emitMarketplaceRemove('extension')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_remove', { item_type: 'extension' })
  })

  it('emitMarketplaceInstallFailed truncates error to 100 chars', () => {
    const longErr = 'z'.repeat(150)
    emitMarketplaceInstallFailed('extension', 'trivy', longErr, 'download')
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect((payload.error_detail as string).length).toBeLessThanOrEqual(100)
    expect(payload.failure_stage).toBe('download')
  })

  it('emitMarketplaceInstallFailed sends all fields on short error', () => {
    emitMarketplaceInstallFailed('extension', 'kyverno', 'timeout', 'http_error')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install_failed', {
      item_type: 'extension',
      item_name: 'kyverno',
      error_detail: 'timeout',
      failure_stage: 'http_error',
    })
  })

  it('emitMarketplaceItemViewed sends item_type and item_name', () => {
    emitMarketplaceItemViewed('dashboard', 'security-overview')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_item_viewed', {
      item_type: 'dashboard',
      item_name: 'security-overview',
    })
  })

  it('emitInstallCommandCopied sends source and command', () => {
    emitInstallCommandCopied('from_lens', 'helm install ks ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_install_command_copied', {
      source: 'from_lens',
      command: 'helm install ks ...',
    })
  })

  it('emitConversionStep sends step_number, step_name, and extra details', () => {
    emitConversionStep(2, 'connect-cluster', { method: 'kubeconfig' })
    expect(mockSend).toHaveBeenCalledWith('ksc_conversion_step', {
      step_number: 2,
      step_name: 'connect-cluster',
      method: 'kubeconfig',
    })
  })

  it('emitLocalClusterCreated sends tool', () => {
    emitLocalClusterCreated('kind')
    expect(mockSend).toHaveBeenCalledWith('ksc_local_cluster_created', { tool: 'kind' })
  })

  it('emitWelcomeViewed sends ref', () => {
    emitWelcomeViewed('docs')
    expect(mockSend).toHaveBeenCalledWith('ksc_welcome_viewed', { ref: 'docs' })
  })

  it('emitWelcomeActioned sends action and ref', () => {
    emitWelcomeActioned('start', 'homepage')
    expect(mockSend).toHaveBeenCalledWith('ksc_welcome_actioned', { action: 'start', ref: 'homepage' })
  })

  it('emitFromLensViewed sends ksc_from_lens_viewed', () => {
    emitFromLensViewed()
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_viewed')
  })

  it('emitFromLensActioned sends action', () => {
    emitFromLensActioned('install')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_actioned', { action: 'install' })
  })

  it('emitFromLensTabSwitch sends tab', () => {
    emitFromLensTabSwitch('quickstart')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_tab_switch', { tab: 'quickstart' })
  })

  it('emitFromLensCommandCopy sends tab, step, command', () => {
    emitFromLensCommandCopy('quickstart', 1, 'helm install ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_command_copy', {
      tab: 'quickstart',
      step: 1,
      command: 'helm install ...',
    })
  })

  it('emitFromHeadlampViewed sends ksc_from_headlamp_viewed', () => {
    emitFromHeadlampViewed()
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_viewed')
  })

  it('emitFromHeadlampActioned sends action', () => {
    emitFromHeadlampActioned('install')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_actioned', { action: 'install' })
  })

  it('emitFromHeadlampTabSwitch sends tab', () => {
    emitFromHeadlampTabSwitch('k8s')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_tab_switch', { tab: 'k8s' })
  })

  it('emitFromHeadlampCommandCopy sends tab, step, command', () => {
    emitFromHeadlampCommandCopy('k8s', 2, 'kubectl apply ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_command_copy', {
      tab: 'k8s',
      step: 2,
      command: 'kubectl apply ...',
    })
  })

  it('emitWhiteLabelViewed sends ksc_white_label_viewed', () => {
    emitWhiteLabelViewed()
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_viewed')
  })

  it('emitWhiteLabelActioned sends action', () => {
    emitWhiteLabelActioned('contact')
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_actioned', { action: 'contact' })
  })

  it('emitWhiteLabelTabSwitch sends tab', () => {
    emitWhiteLabelTabSwitch('pricing')
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_tab_switch', { tab: 'pricing' })
  })

  it('emitWhiteLabelCommandCopy sends tab, step, command', () => {
    emitWhiteLabelCommandCopy('pricing', 3, 'curl ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_command_copy', {
      tab: 'pricing',
      step: 3,
      command: 'curl ...',
    })
  })
})
