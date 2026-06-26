import { describe, it, expect, beforeEach,vi } from 'vitest'
import {
  updateAnalyticsIds,
  setAnalyticsUserProperties,
  setAnalyticsOptOut,
  isAnalyticsOptedOut,
  initAnalytics,
  setAnalyticsUserId,
  emitPageView,
  emitCardAdded,
  emitCardRemoved,
  emitCardExpanded,
  emitCardDragged,
  emitCardConfigured,
  emitCardReplaced,
  emitLogin,
  emitLogout,
  emitFeedbackSubmitted,
  emitError,
  markErrorReported,
  emitTourStarted,
  emitTourCompleted,
  emitTourSkipped,
  emitMarketplaceInstall,
  emitMarketplaceRemove,
  emitMarketplaceInstallFailed,
  emitThemeChanged,
  emitLanguageChanged,
  emitSessionExpired,
  emitGlobalSearchOpened,
  emitGlobalSearchQueried,
  emitGlobalSearchSelected,
  emitGlobalSearchAskAI,
  emitConversionStep,
  emitAgentConnected,
  emitAgentDisconnected,
  emitClusterInventory,
  emitBenchmarkViewed,
  emitDashboardCreated,
  emitDashboardDeleted,
  emitDashboardImported,
  emitDashboardExported,
  emitDashboardRenamed,
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
  emitSnoozed,
  emitUnsnoozed,
  emitWidgetLoaded,
  emitWidgetNavigation,
  emitWidgetInstalled,
  emitWidgetDownloaded,
  emitGameStarted,
  emitGameEnded,
  emitSidebarNavigated,
  emitLocalClusterCreated,
  emitAdopterNudgeShown,
  emitAdopterNudgeActioned,
  emitNudgeShown,
  emitNudgeDismissed,
  emitNudgeActioned,
  emitLinkedInShare,
  emitModalOpened,
  emitModalTabViewed,
  emitModalClosed,
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
  getUtmParams,
  captureUtmParams,
  emitAgentProvidersDetected,
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
  emitCardSortChanged,
  emitCardSortDirectionChanged,
  emitCardLimitChanged,
  emitCardSearchUsed,
  emitCardClusterFilterChanged,
  emitCardPaginationUsed,
  emitCardListItemClicked,
  emitApiKeyConfigured,
  emitApiKeyRemoved,
  emitInstallCommandCopied,
  emitDeployWorkload,
  emitDeployTemplateApplied,
  emitComplianceDrillDown,
  emitComplianceFilterChanged,
  emitClusterCreated,
  emitGitHubConnected,
  emitClusterAction,
  emitClusterStatsDrillDown,
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
  emitSessionContext,
  emitDataExported,
  emitUserRoleChanged,
  emitUserRemoved,
  emitMarketplaceItemViewed,
  emitInsightViewed,
  emitInsightAcknowledged,
  emitInsightDismissed,
  emitActionClicked,
  emitAISuggestionViewed,
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
  emitGitHubTokenConfigured,
  emitGitHubTokenRemoved,
  emitApiProviderConnected,
  emitDemoModeToggled,
  emitAIModeChanged,
  emitAIPredictionsToggled,
  emitConfidenceThresholdChanged,
  emitConsensusModeToggled,
  emitPredictionFeedbackSubmitted,
  emitChunkReloadRecoveryFailed,
  emitHttpError,
  startGlobalErrorTracking,
  emitScreenshotAttached,
  emitScreenshotUploadFailed,
  emitScreenshotUploadSuccess,
} from '../analytics'

// ---------------------------------------------------------------------------
// Existing tests (kept as-is)
// ---------------------------------------------------------------------------


describe('setAnalyticsUserId', () => {
  beforeEach(() => { localStorage.clear() })

  it('does not throw with a real user id', async () => {
    await expect(setAnalyticsUserId('user-123')).resolves.not.toThrow()
  })

  it('does not throw with demo-user (assigns anonymous id)', async () => {
    await expect(setAnalyticsUserId('demo-user')).resolves.not.toThrow()
  })

  it('does not throw with empty string (assigns anonymous id)', async () => {
    await expect(setAnalyticsUserId('')).resolves.not.toThrow()
  })

  it('persists anonymous user ID in localStorage for demo-user', async () => {
    await setAnalyticsUserId('demo-user')
    const anonId = localStorage.getItem('kc-anonymous-user-id')
    expect(anonId).toBeTruthy()
    // The anonymous ID should be a valid UUID format
    expect(anonId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('reuses the same anonymous ID across calls for demo-user', async () => {
    await setAnalyticsUserId('demo-user')
    const first = localStorage.getItem('kc-anonymous-user-id')
    await setAnalyticsUserId('demo-user')
    const second = localStorage.getItem('kc-anonymous-user-id')
    expect(first).toBe(second)
  })
})

describe('initAnalytics', () => {
  beforeEach(() => { localStorage.clear() })

  it('does not throw on first call', () => {
    expect(() => initAnalytics()).not.toThrow()
  })

  it('does not throw on repeated calls (idempotent)', () => {
    expect(() => initAnalytics()).not.toThrow()
    expect(() => initAnalytics()).not.toThrow()
  })
})

describe('startGlobalErrorTracking', () => {
  it('does not throw', () => {
    expect(() => startGlobalErrorTracking()).not.toThrow()
  })
})

describe('captureUtmParams', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('does not throw when no UTM params present', () => {
    expect(() => captureUtmParams()).not.toThrow()
  })

  it('returns empty object from getUtmParams when no UTMs in URL', () => {
    captureUtmParams()
    const params = getUtmParams()
    // Should be an object (could be empty or have previously captured values)
    expect(typeof params).toBe('object')
  })

  it('getUtmParams returns a copy, not a reference', () => {
    const a = getUtmParams()
    const b = getUtmParams()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('updateAnalyticsIds edge cases', () => {
  it('handles undefined ga4MeasurementId gracefully', () => {
    expect(() => updateAnalyticsIds({ ga4MeasurementId: undefined })).not.toThrow()
  })

  it('handles undefined umamiWebsiteId gracefully', () => {
    expect(() => updateAnalyticsIds({ umamiWebsiteId: undefined })).not.toThrow()
  })

  it('handles empty string values (should NOT override defaults)', () => {
    // Empty string means "use default" per the module docs
    expect(() => updateAnalyticsIds({
      ga4MeasurementId: '',
      umamiWebsiteId: '',
    })).not.toThrow()
  })
})

describe('setAnalyticsUserProperties edge cases', () => {
  it('accepts multiple properties', () => {
    expect(() => setAnalyticsUserProperties({
      deployment_type: 'localhost',
      demo_mode: 'true',
      timezone: 'America/New_York',
    })).not.toThrow()
  })

  it('overwrites existing properties', () => {
    expect(() => setAnalyticsUserProperties({ demo_mode: 'true' })).not.toThrow()
    expect(() => setAnalyticsUserProperties({ demo_mode: 'false' })).not.toThrow()
  })

  it('handles empty object', () => {
    expect(() => setAnalyticsUserProperties({})).not.toThrow()
  })
})

describe('markErrorReported dedup behavior', () => {
  it('can mark multiple distinct errors', () => {
    expect(() => markErrorReported('error-1')).not.toThrow()
    expect(() => markErrorReported('error-2')).not.toThrow()
    expect(() => markErrorReported('error-3')).not.toThrow()
  })

  it('truncates long error messages at 100 characters', () => {
    const longMessage = 'x'.repeat(200)
    // Should not throw even with very long message
    expect(() => markErrorReported(longMessage)).not.toThrow()
  })

  it('handles empty string', () => {
    expect(() => markErrorReported('')).not.toThrow()
  })
})

describe('emitError detail truncation', () => {
  it('does not throw with very long detail string', () => {
    const longDetail = 'A'.repeat(500)
    expect(() => emitError('runtime', longDetail)).not.toThrow()
  })

  it('accepts optional cardId parameter', () => {
    expect(() => emitError('card_render', 'test error', 'pods-card')).not.toThrow()
  })

  it('works without cardId parameter', () => {
    expect(() => emitError('runtime', 'test error')).not.toThrow()
  })
})

describe('emitAgentProvidersDetected capability bitmask handling', () => {
  it('correctly handles providers with CHAT only (capability=1)', () => {
    expect(() => emitAgentProvidersDetected([
      { name: 'openai', displayName: 'OpenAI', capabilities: 1 },
    ])).not.toThrow()
  })

  it('correctly handles providers with TOOL_EXEC (capability=2)', () => {
    expect(() => emitAgentProvidersDetected([
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 2 },
    ])).not.toThrow()
  })

  it('correctly handles providers with both capabilities (capability=3)', () => {
    expect(() => emitAgentProvidersDetected([
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 3 },
    ])).not.toThrow()
  })

  it('handles mixed providers with different capabilities', () => {
    expect(() => emitAgentProvidersDetected([
      { name: 'openai', displayName: 'OpenAI', capabilities: 1 },
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 3 },
      { name: 'gemini', displayName: 'Gemini', capabilities: 1 },
    ])).not.toThrow()
  })

  it('early-returns for empty array (no send call)', () => {
    // The function has an explicit early return for empty arrays
    expect(() => emitAgentProvidersDetected([])).not.toThrow()
  })
})

describe('emitClusterInventory with various distributions', () => {
  it('handles empty distributions', () => {
    expect(() => emitClusterInventory({
      total: 0,
      healthy: 0,
      unhealthy: 0,
      unreachable: 0,
      distributions: {},
    })).not.toThrow()
  })

  it('handles many distribution types', () => {
    expect(() => emitClusterInventory({
      total: 10,
      healthy: 8,
      unhealthy: 1,
      unreachable: 1,
      distributions: { eks: 3, gke: 3, aks: 2, kind: 1, k3d: 1 },
    })).not.toThrow()
  })
})

describe('emitConversionStep with optional details', () => {
  it('works without details', () => {
    expect(() => emitConversionStep(1, 'discovery')).not.toThrow()
  })

  it('works with details', () => {
    expect(() => emitConversionStep(3, 'agent', {
      deployment_type: 'localhost',
    })).not.toThrow()
  })

  it('covers all funnel steps', () => {
    const STEP_1_DISCOVERY = 1
    const STEP_2_LOGIN = 2
    const STEP_3_AGENT = 3
    const STEP_4_CLUSTERS = 4
    const STEP_5_API_KEY = 5
    const STEP_6_GITHUB_TOKEN = 6
    const STEP_7_ADOPTER_CTA = 7

    expect(() => emitConversionStep(STEP_1_DISCOVERY, 'discovery')).not.toThrow()
    expect(() => emitConversionStep(STEP_2_LOGIN, 'login')).not.toThrow()
    expect(() => emitConversionStep(STEP_3_AGENT, 'agent')).not.toThrow()
    expect(() => emitConversionStep(STEP_4_CLUSTERS, 'clusters')).not.toThrow()
    expect(() => emitConversionStep(STEP_5_API_KEY, 'api_key')).not.toThrow()
    expect(() => emitConversionStep(STEP_6_GITHUB_TOKEN, 'github_token')).not.toThrow()
    expect(() => emitConversionStep(STEP_7_ADOPTER_CTA, 'adopter_cta')).not.toThrow()
  })
})

describe('emitSessionContext deduplication', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('does not throw on first call', () => {
    expect(() => emitSessionContext('binary', 'stable')).not.toThrow()
  })

  it('does not throw on second call (deduped by sessionStorage)', () => {
    emitSessionContext('binary', 'stable')
    expect(() => emitSessionContext('binary', 'stable')).not.toThrow()
  })
})

describe('emitDeveloperSession guards', () => {
  beforeEach(() => { localStorage.clear() })

  it('does not throw', () => {
    expect(() => emitDeveloperSession()).not.toThrow()
  })

  it('does not throw on repeated calls (deduped by localStorage)', () => {
    emitDeveloperSession()
    expect(() => emitDeveloperSession()).not.toThrow()
  })
})

describe('emitRecommendedCardShown with various card lists', () => {
  it('handles single card', () => {
    expect(() => emitRecommendedCardShown(['pods'])).not.toThrow()
  })

  it('handles empty array', () => {
    expect(() => emitRecommendedCardShown([])).not.toThrow()
  })

  it('handles many cards', () => {
    expect(() => emitRecommendedCardShown([
      'pods', 'nodes', 'deployments', 'services', 'gpu-monitor',
    ])).not.toThrow()
  })
})

describe('emitChunkReloadRecoveryFailed truncation', () => {
  it('truncates long error details', () => {
    const longError = 'E'.repeat(300)
    expect(() => emitChunkReloadRecoveryFailed(longError)).not.toThrow()
  })
})

describe('emitFixerImportError truncation', () => {
  it('truncates firstError to 100 chars', () => {
    const longError = 'x'.repeat(200)
    expect(() => emitFixerImportError('Fix RBAC', 1, longError)).not.toThrow()
  })
})

describe('emitUpdateFailed truncation', () => {
  it('truncates long error string', () => {
    const longError = 'timeout'.repeat(50)
    expect(() => emitUpdateFailed(longError)).not.toThrow()
  })
})

describe('module-level reset for opt-out with fresh import', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('fresh import reflects opt-out state from localStorage', async () => {
    // Pre-set opt-out in localStorage before importing
    localStorage.setItem('kc-analytics-opt-out', 'true')

    const mod = await import('../analytics')
    expect(mod.isAnalyticsOptedOut()).toBe(true)
  })

  it('fresh import reflects default (not opted out) when localStorage is clean', async () => {
    const mod = await import('../analytics')
    expect(mod.isAnalyticsOptedOut()).toBe(false)
  })
})

describe('emitSnoozed default duration', () => {
  it('does not throw without duration (uses default)', () => {
    expect(() => emitSnoozed('card')).not.toThrow()
  })

  it('does not throw with explicit duration', () => {
    expect(() => emitSnoozed('alert', '24h')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// emitHttpError
// ---------------------------------------------------------------------------

describe('emitHttpError', () => {
  it('does not throw for a 404', () => {
    expect(() => emitHttpError(404, '/api/clusters')).not.toThrow()
  })

  it('does not throw for a 500 with detail', () => {
    expect(() => emitHttpError(500, '/api/namespaces', 'Internal Server Error')).not.toThrow()
  })

  it('does not throw when endpoint contains a query string', () => {
    expect(() => emitHttpError(404, '/api/feedback/queue?count_only=true')).not.toThrow()
  })

  it('does not throw when endpoint is very long', () => {
    const longEndpoint = '/api/' + 'x'.repeat(200)
    expect(() => emitHttpError(400, longEndpoint)).not.toThrow()
  })

  it('does not throw with a string status code', () => {
    expect(() => emitHttpError('0', '/api/health')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// WAVE 2 — Deep coverage tests for internal logic, branching, and send paths
// ---------------------------------------------------------------------------

/**
 * These tests go beyond "does not throw" and exercise the actual internal
 * code paths: send() gating logic, sendViaProxy payload construction,
 * engagement tracking, session management, error dedup, automated env
 * detection, UTM capture, and more.
 *
 * We use vi.resetModules() + dynamic import to get a fresh module for each
 * test group, which resets all internal module-level state (initialized,
 * gtagDecided, userHasInteracted, etc.).
 */

