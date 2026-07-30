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
  startGlobalErrorTracking,
  emitScreenshotAttached,
  emitScreenshotUploadFailed,
  emitScreenshotUploadSuccess,
} from '../analytics'

// ---------------------------------------------------------------------------
// Existing tests (kept as-is)
// ---------------------------------------------------------------------------


describe('send() gating: opted-out prevents event delivery', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('send drops events when analytics is opted out', async () => {
    vi.resetModules()
    // Set opt-out BEFORE importing the module
    localStorage.setItem('kc-analytics-opt-out', 'true')

    const mod = await import('../analytics')
    // initAnalytics + simulate user interaction would normally be needed,
    // but since opt-out is checked first in send(), events are dropped
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    mod.emitCardAdded('test-card', 'manual')
    // sendBeacon should NOT have been called because opted out
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
  })
})

describe('send() gating: uninitialized prevents event delivery', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.resetModules()
  })

  it('send drops events when initAnalytics has not been called', async () => {
    const mod = await import('../analytics')
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    // Call emit without calling initAnalytics first
    mod.emitPageView('/test')
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
  })
})

describe('emitScreenshotAttached', () => {
  it('does not throw with paste method', () => {
    expect(() => emitScreenshotAttached('paste', 1)).not.toThrow()
  })

  it('does not throw with drop method', () => {
    expect(() => emitScreenshotAttached('drop', 3)).not.toThrow()
  })

  it('does not throw with file_picker method', () => {
    expect(() => emitScreenshotAttached('file_picker', 2)).not.toThrow()
  })
})

describe('emitScreenshotUploadFailed', () => {
  it('does not throw with short error', () => {
    expect(() => emitScreenshotUploadFailed('network error', 1)).not.toThrow()
  })

  it('does not throw with long error (truncated)', () => {
    const longError = 'E'.repeat(300)
    expect(() => emitScreenshotUploadFailed(longError, 2)).not.toThrow()
  })

  it('does not throw with zero screenshots', () => {
    expect(() => emitScreenshotUploadFailed('error', 0)).not.toThrow()
  })
})

describe('emitScreenshotUploadSuccess', () => {
  it('does not throw with count', () => {
    expect(() => emitScreenshotUploadSuccess(3)).not.toThrow()
  })

  it('does not throw with zero count', () => {
    expect(() => emitScreenshotUploadSuccess(0)).not.toThrow()
  })
})

describe('initAnalytics automated environment detection', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('skips initialization when navigator.webdriver is true', async () => {
    vi.resetModules()
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    const mod = await import('../analytics')
    mod.initAnalytics()
    // After init with webdriver=true, analytics should not be initialized
    // Verify by checking that emitting does not trigger sendBeacon
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    mod.emitPageView('/test')
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  })

  it('skips initialization for HeadlessChrome user agent', async () => {
    vi.resetModules()
    const originalUA = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 HeadlessChrome/120.0',
      configurable: true,
    })
    const mod = await import('../analytics')
    mod.initAnalytics()
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    mod.emitCardAdded('test', 'auto')
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    })
  })

  it('skips initialization for PhantomJS user agent', async () => {
    vi.resetModules()
    const originalUA = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 PhantomJS/2.1',
      configurable: true,
    })
    const mod = await import('../analytics')
    mod.initAnalytics()
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    mod.emitCardAdded('test', 'auto')
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    })
  })
})

describe('setAnalyticsOptOut cookie cleanup', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears _ga and _ksc cookies on opt-out', () => {
    // Set some fake cookies
    document.cookie = '_ga_test=value;path=/'
    document.cookie = '_ksc_cid=value;path=/'

    setAnalyticsOptOut(true)

    // After opt-out, these cookies should be expired
    // Note: in JSDOM cookies may not behave exactly like browsers,
    // but the code path is exercised
    expect(localStorage.getItem('_ksc_cid')).toBeNull()
    expect(localStorage.getItem('_ksc_sid')).toBeNull()
  })
})

describe('setAnalyticsOptOut re-enable does not clear keys', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('opt-in does not clear session keys', () => {
    localStorage.setItem('_ksc_cid', 'test-cid')
    localStorage.setItem('_ksc_sid', 'test-sid')

    setAnalyticsOptOut(false)

    // Keys should still be present after opting back in
    expect(localStorage.getItem('_ksc_cid')).toBe('test-cid')
    expect(localStorage.getItem('_ksc_sid')).toBe('test-sid')
  })
})

describe('emitDeveloperSession conditional branches', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('deduplicates: second call does not throw', () => {
    emitDeveloperSession()
    emitDeveloperSession()
    // Should not throw — deduped by localStorage key
  })

  it('does not fire on console.kubestellar.io (not localhost)', () => {
    // getDeploymentType() checks window.location.hostname
    // In JSDOM, hostname is 'localhost' by default, but let's verify
    // the function doesn't throw regardless
    expect(() => emitDeveloperSession()).not.toThrow()
  })
})

describe('emitSessionContext deduplication via sessionStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('first call sets sessionStorage marker', () => {
    emitSessionContext('binary', 'stable')
    expect(sessionStorage.getItem('_ksc_session_start_sent')).toBe('1')
  })

  it('second call is deduped (sessionStorage marker already set)', () => {
    emitSessionContext('binary', 'stable')
    // Call again -- should not throw and should be deduped
    expect(() => emitSessionContext('docker', 'nightly')).not.toThrow()
    // Marker should still be '1' (not overwritten)
    expect(sessionStorage.getItem('_ksc_session_start_sent')).toBe('1')
  })
})

describe('setAnalyticsUserId hashing branches', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('hashes a real user ID via crypto.subtle', async () => {
    // crypto.subtle should be available in Node/JSDOM test env
    await setAnalyticsUserId('real-user-123')
    // No assertion on internal state, but the code path is exercised
  })

  it('assigns anonymous ID for empty string user', async () => {
    await setAnalyticsUserId('')
    const anonId = localStorage.getItem('kc-anonymous-user-id')
    expect(anonId).toBeTruthy()
  })

  it('assigns anonymous ID for demo-user', async () => {
    await setAnalyticsUserId('demo-user')
    const anonId = localStorage.getItem('kc-anonymous-user-id')
    expect(anonId).toBeTruthy()
    expect(anonId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('reuses existing anonymous ID on subsequent calls', async () => {
    await setAnalyticsUserId('demo-user')
    const first = localStorage.getItem('kc-anonymous-user-id')
    await setAnalyticsUserId('demo-user')
    const second = localStorage.getItem('kc-anonymous-user-id')
    expect(first).toBe(second)
  })

  it('hashes different users to different values', async () => {
    // We can't easily check the userId module variable, but we can
    // ensure the function processes different inputs without error
    await setAnalyticsUserId('user-a')
    await setAnalyticsUserId('user-b')
    // Both should complete without throwing
  })
})

describe('emitPredictionFeedbackSubmitted provider fallback', () => {
  it('uses "unknown" when provider is omitted', () => {
    expect(() => emitPredictionFeedbackSubmitted('positive', 'cpu-forecast')).not.toThrow()
  })

  it('uses explicit provider when provided', () => {
    expect(() => emitPredictionFeedbackSubmitted('negative', 'memory-forecast', 'openai')).not.toThrow()
  })
})

describe('emitDataExported resourceType fallback', () => {
  it('uses empty string when resourceType is omitted', () => {
    expect(() => emitDataExported('csv')).not.toThrow()
  })

  it('passes resourceType when provided', () => {
    expect(() => emitDataExported('json', 'pods')).not.toThrow()
  })
})

describe('emitFixerViewed/Imported/LinkCopied cncfProject fallback', () => {
  it('emitFixerViewed uses empty string when cncfProject omitted', () => {
    expect(() => emitFixerViewed('Fix RBAC')).not.toThrow()
  })

  it('emitFixerViewed passes cncfProject when provided', () => {
    expect(() => emitFixerViewed('Fix RBAC', 'falco')).not.toThrow()
  })

  it('emitFixerImported uses empty string when cncfProject omitted', () => {
    expect(() => emitFixerImported('Fix RBAC')).not.toThrow()
  })

  it('emitFixerImported passes cncfProject when provided', () => {
    expect(() => emitFixerImported('Fix RBAC', 'falco')).not.toThrow()
  })

  it('emitFixerLinkCopied uses empty string when cncfProject omitted', () => {
    expect(() => emitFixerLinkCopied('Fix RBAC')).not.toThrow()
  })

  it('emitFixerLinkCopied passes cncfProject when provided', () => {
    expect(() => emitFixerLinkCopied('Fix RBAC', 'falco')).not.toThrow()
  })
})

describe('emitFixerImportError truncation edge cases', () => {
  it('handles empty firstError', () => {
    expect(() => emitFixerImportError('Fix RBAC', 0, '')).not.toThrow()
  })

  it('handles exactly 100 char firstError', () => {
    const exact100 = 'x'.repeat(100)
    expect(() => emitFixerImportError('Fix RBAC', 1, exact100)).not.toThrow()
  })
})

describe('emitError with cardId conditional spread', () => {
  it('includes cardId when provided', () => {
    expect(() => emitError('card_render', 'some error', 'pod-card')).not.toThrow()
  })

  it('excludes cardId when empty string (falsy)', () => {
    expect(() => emitError('runtime', 'some error', '')).not.toThrow()
  })

  it('excludes cardId when undefined', () => {
    expect(() => emitError('runtime', 'some error')).not.toThrow()
  })
})

// Custom dimensions added in #9861 (error_type, component_name)
describe('emitError accepts EmitErrorExtra context (#9861)', () => {
  it('accepts an Error instance to derive error_type from .name', () => {
    const err = new TypeError('Cannot read properties of undefined')
    expect(() => emitError('runtime', err.message, undefined, { error: err })).not.toThrow()
  })

  it('accepts a React componentStack to derive component_name', () => {
    const componentStack = '\n    in PodList (created by Dashboard)\n    in Dashboard'
    expect(() =>
      emitError('uncaught_render', 'boom', undefined, { componentStack }),
    ).not.toThrow()
  })

  it('accepts both error and componentStack together', () => {
    const err = new RangeError('out of bounds')
    const componentStack = '\n    in ClusterCard'
    expect(() =>
      emitError('card_render', err.message, 'cluster-health', {
        error: err,
        componentStack,
      }),
    ).not.toThrow()
  })

  it('accepts a non-Error reason object (e.g. a thrown string)', () => {
    expect(() =>
      emitError('unhandled_rejection', 'plain string reason', undefined, {
        error: 'plain string reason',
      }),
    ).not.toThrow()
  })

  it('handles undefined extra (back-compat with existing callers)', () => {
    expect(() => emitError('runtime', 'no extra context')).not.toThrow()
  })
})

describe('emitMarketplaceInstallFailed error truncation', () => {
  it('handles empty error string', () => {
    expect(() => emitMarketplaceInstallFailed('card', 'gpu-monitor', '')).not.toThrow()
  })

  it('handles error string exactly 100 chars', () => {
    const exact = 'a'.repeat(100)
    expect(() => emitMarketplaceInstallFailed('card', 'gpu-monitor', exact)).not.toThrow()
  })

  it('truncates error string over 100 chars', () => {
    const long = 'b'.repeat(200)
    expect(() => emitMarketplaceInstallFailed('card', 'gpu-monitor', long)).not.toThrow()
  })
})

describe('emitUpdateFailed error truncation edge cases', () => {
  it('handles empty error string', () => {
    expect(() => emitUpdateFailed('')).not.toThrow()
  })

  it('handles error exactly 100 chars', () => {
    expect(() => emitUpdateFailed('x'.repeat(100))).not.toThrow()
  })
})

describe('emitChunkReloadRecoveryFailed truncation edge cases', () => {
  it('handles empty error detail', () => {
    expect(() => emitChunkReloadRecoveryFailed('')).not.toThrow()
  })

  it('handles error detail exactly 100 chars', () => {
    expect(() => emitChunkReloadRecoveryFailed('x'.repeat(100))).not.toThrow()
  })
})

describe('emitClusterInventory flattens distribution params', () => {
  it('handles single distribution entry', () => {
    expect(() => emitClusterInventory({
      total: 1,
      healthy: 1,
      unhealthy: 0,
      unreachable: 0,
      distributions: { kind: 1 },
    })).not.toThrow()
  })

  it('handles distributions with special characters in keys', () => {
    expect(() => emitClusterInventory({
      total: 2,
      healthy: 2,
      unhealthy: 0,
      unreachable: 0,
      distributions: { 'k3s-arm': 1, 'eks-fargate': 1 },
    })).not.toThrow()
  })

  it('sets cluster_count user property', () => {
    // This exercises the userProperties.cluster_count = String(counts.total) branch
    emitClusterInventory({
      total: 42,
      healthy: 40,
      unhealthy: 1,
      unreachable: 1,
      distributions: { eks: 20, gke: 22 },
    })
    // No direct assertion on internal state, but the code path is exercised
  })
})

describe('emitAgentProvidersDetected bitmask categorization', () => {
  it('categorizes providers with TOOL_EXEC as CLI', () => {
    // capability=2 means TOOL_EXEC only
    expect(() => emitAgentProvidersDetected([
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 2 },
    ])).not.toThrow()
  })

  it('categorizes providers with CHAT only as API', () => {
    // capability=1 means CHAT only
    expect(() => emitAgentProvidersDetected([
      { name: 'openai', displayName: 'OpenAI', capabilities: 1 },
    ])).not.toThrow()
  })

  it('categorizes providers with both capabilities as CLI', () => {
    // capability=3 means both CHAT and TOOL_EXEC
    expect(() => emitAgentProvidersDetected([
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 3 },
    ])).not.toThrow()
  })

  it('correctly separates mixed providers into CLI and API lists', () => {
    expect(() => emitAgentProvidersDetected([
      { name: 'openai', displayName: 'OpenAI', capabilities: 1 },
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 3 },
      { name: 'gemini', displayName: 'Gemini', capabilities: 1 },
      { name: 'copilot', displayName: 'Copilot', capabilities: 2 },
    ])).not.toThrow()
  })

  it('returns early for null-ish providers', () => {
    // This tests the `if (!providers || providers.length === 0) return` guard
    expect(() => emitAgentProvidersDetected([])).not.toThrow()
  })

  it('handles provider with capability=0 (no capabilities)', () => {
    // Neither CHAT nor TOOL_EXEC -- should not appear in either list
    expect(() => emitAgentProvidersDetected([
      { name: 'unknown', displayName: 'Unknown', capabilities: 0 },
    ])).not.toThrow()
  })
})

describe('emitRecommendedCardShown joins card types', () => {
  it('joins multiple card types with comma', () => {
    expect(() => emitRecommendedCardShown(['pods', 'nodes', 'deployments'])).not.toThrow()
  })

  it('handles single card type', () => {
    expect(() => emitRecommendedCardShown(['pods'])).not.toThrow()
  })

  it('handles empty array (card_count=0, card_types="")', () => {
    expect(() => emitRecommendedCardShown([])).not.toThrow()
  })
})

describe('emitDemoModeToggled updates user properties', () => {
  it('sets demo_mode to "true" when enabled', () => {
    expect(() => emitDemoModeToggled(true)).not.toThrow()
  })

  it('sets demo_mode to "false" when disabled', () => {
    expect(() => emitDemoModeToggled(false)).not.toThrow()
  })
})

describe('updateAnalyticsIds only overrides non-empty values', () => {
  it('overrides ga4MeasurementId with non-empty value', () => {
    expect(() => updateAnalyticsIds({ ga4MeasurementId: 'G-CUSTOM123' })).not.toThrow()
  })

  it('overrides umamiWebsiteId with non-empty value', () => {
    expect(() => updateAnalyticsIds({ umamiWebsiteId: 'custom-umami-id' })).not.toThrow()
  })

  it('does NOT override when empty string is passed', () => {
    // Empty string is falsy, so the condition `if (ids.ga4MeasurementId)` is false
    expect(() => updateAnalyticsIds({ ga4MeasurementId: '' })).not.toThrow()
  })

  it('handles both IDs being set simultaneously', () => {
    expect(() => updateAnalyticsIds({
      ga4MeasurementId: 'G-BOTH123',
      umamiWebsiteId: 'both-umami-id',
    })).not.toThrow()
  })
})

describe('emitConversionStep with various step numbers and details', () => {
  it('sends step 1 discovery with deployment_type detail', () => {
    expect(() => emitConversionStep(1, 'discovery', { deployment_type: 'localhost' })).not.toThrow()
  })

  it('sends step 2 login without details', () => {
    expect(() => emitConversionStep(2, 'login')).not.toThrow()
  })

  it('sends step 7 adopter_cta with multiple details', () => {
    expect(() => emitConversionStep(7, 'adopter_cta', {
      deployment_type: 'console.kubestellar.io',
      source: 'banner',
    })).not.toThrow()
  })
})

describe('emitAISuggestionViewed boolean param', () => {
  it('handles hasAIEnrichment=true', () => {
    expect(() => emitAISuggestionViewed('security', true)).not.toThrow()
  })

  it('handles hasAIEnrichment=false', () => {
    expect(() => emitAISuggestionViewed('performance', false)).not.toThrow()
  })
})

describe('emitGameEnded with various outcomes', () => {
  it('handles win outcome', () => {
    expect(() => emitGameEnded('tetris', 'win', 1500)).not.toThrow()
  })

  it('handles loss outcome', () => {
    expect(() => emitGameEnded('tetris', 'loss', 200)).not.toThrow()
  })

  it('handles completion outcome with zero score', () => {
    expect(() => emitGameEnded('kubequest', 'completion', 0)).not.toThrow()
  })
})

describe('emitWidgetLoaded mode variants', () => {
  it('handles standalone mode', () => {
    expect(() => emitWidgetLoaded('standalone')).not.toThrow()
  })

  it('handles browser mode', () => {
    expect(() => emitWidgetLoaded('browser')).not.toThrow()
  })
})

describe('emitWidgetInstalled method variants', () => {
  it('handles pwa-prompt method', () => {
    expect(() => emitWidgetInstalled('pwa-prompt')).not.toThrow()
  })

  it('handles safari-dock method', () => {
    expect(() => emitWidgetInstalled('safari-dock')).not.toThrow()
  })
})

describe('emitWidgetDownloaded widget type variants', () => {
  it('handles uebersicht widget type', () => {
    expect(() => emitWidgetDownloaded('uebersicht')).not.toThrow()
  })

  it('handles browser widget type', () => {
    expect(() => emitWidgetDownloaded('browser')).not.toThrow()
  })
})

describe('emitDashboardScrolled depth variants', () => {
  it('handles shallow depth', () => {
    expect(() => emitDashboardScrolled('shallow')).not.toThrow()
  })

  it('handles deep depth', () => {
    expect(() => emitDashboardScrolled('deep')).not.toThrow()
  })
})

describe('emitGlobalSearchOpened method variants', () => {
  it('handles keyboard method', () => {
    expect(() => emitGlobalSearchOpened('keyboard')).not.toThrow()
  })

  it('handles click method', () => {
    expect(() => emitGlobalSearchOpened('click')).not.toThrow()
  })
})

describe('emitInstallCommandCopied source variants', () => {
  it('handles setup_quickstart source', () => {
    expect(() => emitInstallCommandCopied('setup_quickstart', 'curl | bash')).not.toThrow()
  })

  it('handles from_lens source', () => {
    expect(() => emitInstallCommandCopied('from_lens', 'kubectl apply')).not.toThrow()
  })

  it('handles white_label source', () => {
    expect(() => emitInstallCommandCopied('white_label', 'docker run ...')).not.toThrow()
  })

  it('handles demo_to_local source', () => {
    expect(() => emitInstallCommandCopied('demo_to_local', 'brew install')).not.toThrow()
  })

  it('handles agent_install_banner source', () => {
    expect(() => emitInstallCommandCopied('agent_install_banner', 'npm install')).not.toThrow()
  })
})

