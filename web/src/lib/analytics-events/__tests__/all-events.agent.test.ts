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

