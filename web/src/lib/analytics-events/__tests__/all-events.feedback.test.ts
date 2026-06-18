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

