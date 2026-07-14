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

describe('analytics-events/admin', () => {
  it('emitModalOpened sends modal_type and source_card', () => {
    emitModalOpened('pod-detail', 'pods-card')
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_opened', {
      modal_type: 'pod-detail',
      source_card: 'pods-card',
    })
  })

  it('emitModalTabViewed sends modal_type and tab_name', () => {
    emitModalTabViewed('pod-detail', 'logs')
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_tab_viewed', {
      modal_type: 'pod-detail',
      tab_name: 'logs',
    })
  })

  it('emitModalClosed sends modal_type and duration_ms', () => {
    emitModalClosed('pod-detail', 3000)
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_closed', {
      modal_type: 'pod-detail',
      duration_ms: 3000,
    })
  })

  it('emitActionClicked sends action_type, source_card, dashboard', () => {
    emitActionClicked('restart', 'pods-card', 'main')
    expect(mockSend).toHaveBeenCalledWith('ksc_action_clicked', {
      action_type: 'restart',
      source_card: 'pods-card',
      dashboard: 'main',
    })
  })

  it('emitUserRoleChanged sends new_role', () => {
    emitUserRoleChanged('admin')
    expect(mockSend).toHaveBeenCalledWith('ksc_user_role_changed', { new_role: 'admin' })
  })

  it('emitUserRemoved sends ksc_user_removed', () => {
    emitUserRemoved()
    expect(mockSend).toHaveBeenCalledWith('ksc_user_removed')
  })

  it('emitSidebarNavigated sends destination', () => {
    emitSidebarNavigated('/clusters')
    expect(mockSend).toHaveBeenCalledWith('ksc_sidebar_navigated', { destination: '/clusters' })
  })

  it('emitGameStarted sends game_name', () => {
    emitGameStarted('snake')
    expect(mockSend).toHaveBeenCalledWith('ksc_game_started', { game_name: 'snake' })
  })

  it('emitGameEnded sends game_name, outcome, score', () => {
    emitGameEnded('snake', 'win', 42)
    expect(mockSend).toHaveBeenCalledWith('ksc_game_ended', {
      game_name: 'snake',
      outcome: 'win',
      score: 42,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// settings.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('analytics-events/settings', () => {
  it('emitTourStarted sends ksc_tour_started', () => {
    emitTourStarted()
    expect(mockSend).toHaveBeenCalledWith('ksc_tour_started')
  })

  it('emitTourCompleted sends step_count', () => {
    emitTourCompleted(5)
    expect(mockSend).toHaveBeenCalledWith('ksc_tour_completed', { step_count: 5 })
  })

  it('emitTourSkipped sends at_step', () => {
    emitTourSkipped(3)
    expect(mockSend).toHaveBeenCalledWith('ksc_tour_skipped', { at_step: 3 })
  })

  it('emitThemeChanged sends theme_id and source', () => {
    emitThemeChanged('dracula', 'settings')
    expect(mockSend).toHaveBeenCalledWith('ksc_theme_changed', { theme_id: 'dracula', source: 'settings' })
  })

  it('emitLanguageChanged sends language', () => {
    emitLanguageChanged('en')
    expect(mockSend).toHaveBeenCalledWith('ksc_language_changed', { language: 'en' })
  })

  it('emitAIModeChanged sends mode', () => {
    emitAIModeChanged('auto')
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_mode_changed', { mode: 'auto' })
  })

  it('emitAIPredictionsToggled sends enabled as string', () => {
    emitAIPredictionsToggled(true)
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_predictions_toggled', { enabled: 'true' })
  })

  it('emitAIPredictionsToggled sends false as string', () => {
    emitAIPredictionsToggled(false)
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_predictions_toggled', { enabled: 'false' })
  })

  it('emitConfidenceThresholdChanged sends threshold', () => {
    emitConfidenceThresholdChanged(0.75)
    expect(mockSend).toHaveBeenCalledWith('ksc_confidence_threshold_changed', { threshold: 0.75 })
  })

  it('emitConsensusModeToggled sends enabled as string', () => {
    emitConsensusModeToggled(true)
    expect(mockSend).toHaveBeenCalledWith('ksc_consensus_mode_toggled', { enabled: 'true' })
  })

  it('emitUpdateChecked sends ksc_update_checked', () => {
    emitUpdateChecked()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_checked')
  })

  it('emitUpdateTriggered sends ksc_update_triggered', () => {
    emitUpdateTriggered()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_triggered')
  })

  it('emitUpdateCompleted sends duration_ms', () => {
    emitUpdateCompleted(2500)
    expect(mockSend).toHaveBeenCalledWith('ksc_update_completed', { duration_ms: 2500 })
  })

  it('emitUpdateFailed truncates error to 100 chars', () => {
    const longError = 'e'.repeat(150)
    emitUpdateFailed(longError)
    expect(mockSend).toHaveBeenCalledWith('ksc_update_failed', { error_detail: 'e'.repeat(100) })
  })

  it('emitUpdateFailed preserves short errors', () => {
    emitUpdateFailed('network timeout')
    expect(mockSend).toHaveBeenCalledWith('ksc_update_failed', { error_detail: 'network timeout' })
  })

  it('emitUpdateRefreshed sends ksc_update_refreshed', () => {
    emitUpdateRefreshed()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_refreshed')
  })

  it('emitUpdateStalled sends ksc_update_stalled', () => {
    emitUpdateStalled()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_stalled')
  })

  it('emitWhatsNewModalOpened sends release_tag', () => {
    emitWhatsNewModalOpened('v0.25.0')
    expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_modal_opened', { release_tag: 'v0.25.0' })
  })

  it('emitWhatsNewUpdateClicked sends release_tag and install_method', () => {
    emitWhatsNewUpdateClicked('v0.25.0', 'homebrew')
    expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_update_clicked', {
      release_tag: 'v0.25.0',
      install_method: 'homebrew',
    })
  })

  it('emitWhatsNewRemindLater sends release_tag and snooze_duration', () => {
    emitWhatsNewRemindLater('v0.25.0', '1d')
    expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_remind_later', {
      release_tag: 'v0.25.0',
      snooze_duration: '1d',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// feedback.ts
// ─────────────────────────────────────────────────────────────────────────────
