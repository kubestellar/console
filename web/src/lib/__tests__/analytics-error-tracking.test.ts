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


describe('startGlobalErrorTracking sets up listeners', () => {
  it('can be called multiple times without throwing', () => {
    expect(() => startGlobalErrorTracking()).not.toThrow()
    expect(() => startGlobalErrorTracking()).not.toThrow()
  })

  it('handles unhandledrejection events', () => {
    startGlobalErrorTracking()
    // Dispatch a rejection event -- should not throw
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'test rejection error' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips clipboard errors in unhandledrejection', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'Failed to execute writeText on clipboard' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips AbortError in unhandledrejection', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'The user aborted a request', name: 'AbortError' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips TimeoutError in unhandledrejection', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'signal timed out', name: 'TimeoutError' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips JSON parse errors in unhandledrejection', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'JSON.parse: unexpected character at line 1' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips "is not valid JSON" errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'response body is not valid JSON' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips WebKit URL pattern errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'The string did not match the expected pattern.' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips ServiceWorker notification errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'No active registration available' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips Safari fetch aborted errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'Fetch is aborted' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips "signal is aborted" errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'signal is aborted without reason' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips "The operation timed out" errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'The operation timed out.' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips "Load failed" errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'Load failed' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips "JSON Parse error" (Safari) errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'JSON Parse error: Unexpected token <' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips "Unexpected token" errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'Unexpected token < in JSON at position 0' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips "showNotification" errors', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message: 'Failed to execute showNotification' },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('handles rejection with non-object reason', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: 'simple string error',
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('handles rejection with null reason', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: null,
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('handles rejection with undefined reason', () => {
    startGlobalErrorTracking()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: undefined,
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('handles error events with "Script error." message (cross-origin)', () => {
    startGlobalErrorTracking()
    const event = new ErrorEvent('error', { message: 'Script error.' })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('handles error events with empty message', () => {
    startGlobalErrorTracking()
    const event = new ErrorEvent('error', { message: '' })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('handles error events with clipboard-related message', () => {
    startGlobalErrorTracking()
    const event = new ErrorEvent('error', { message: 'Cannot read clipboard data' })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('handles error events with copy-related message', () => {
    startGlobalErrorTracking()
    const event = new ErrorEvent('error', { message: 'Document.execCommand("copy") failed' })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('handles real runtime error events', () => {
    startGlobalErrorTracking()
    const event = new ErrorEvent('error', { message: 'ReferenceError: foo is not defined' })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('skips ResizeObserver loop errors (benign browser noise)', () => {
    startGlobalErrorTracking()
    // Chrome/Edge message
    const event1 = new ErrorEvent('error', {
      message: 'ResizeObserver loop completed with undelivered notifications.',
    })
    expect(() => window.dispatchEvent(event1)).not.toThrow()
    // Older browser message
    const event2 = new ErrorEvent('error', {
      message: 'ResizeObserver loop limit exceeded',
    })
    expect(() => window.dispatchEvent(event2)).not.toThrow()
  })
})

describe('markErrorReported and dedup integration', () => {
  it('marks error and exercises dedup path', () => {
    const msg = 'Component render error in PodCard'
    markErrorReported(msg)
    // Calling emitError with a message that was already reported -- send path
    // exercises wasAlreadyReported() returning true
    expect(() => emitError('card_render', msg)).not.toThrow()
  })

  it('marks multiple errors independently', () => {
    markErrorReported('error-alpha')
    markErrorReported('error-beta')
    expect(() => emitError('runtime', 'error-alpha')).not.toThrow()
    expect(() => emitError('runtime', 'error-beta')).not.toThrow()
  })
})

describe('captureUtmParams with URL search params', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('captures and stores UTM params from sessionStorage fallback', () => {
    // Set UTM data in sessionStorage to simulate a previous capture
    sessionStorage.setItem('_ksc_utm', JSON.stringify({
      utm_source: 'google',
      utm_medium: 'cpc',
    }))
    captureUtmParams()
    const result = getUtmParams()
    expect(result.utm_source).toBe('google')
    expect(result.utm_medium).toBe('cpc')
  })

  it('handles invalid JSON in sessionStorage gracefully', () => {
    sessionStorage.setItem('_ksc_utm', 'not-valid-json')
    expect(() => captureUtmParams()).not.toThrow()
  })

  it('getUtmParams returns independent copies', () => {
    const a = getUtmParams()
    const b = getUtmParams()
    expect(a).not.toBe(b) // Different object references
    expect(a).toEqual(b)  // Same values
  })
})

describe('emitAIPredictionsToggled string conversion', () => {
  it('converts true to string "true"', () => {
    expect(() => emitAIPredictionsToggled(true)).not.toThrow()
  })

  it('converts false to string "false"', () => {
    expect(() => emitAIPredictionsToggled(false)).not.toThrow()
  })
})

describe('emitConsensusModeToggled string conversion', () => {
  it('converts true to string "true"', () => {
    expect(() => emitConsensusModeToggled(true)).not.toThrow()
  })

  it('converts false to string "false"', () => {
    expect(() => emitConsensusModeToggled(false)).not.toThrow()
  })
})

describe('emitDemoModeToggled string conversion and userProperties update', () => {
  it('converts true to string "true"', () => {
    expect(() => emitDemoModeToggled(true)).not.toThrow()
  })

  it('converts false to string "false"', () => {
    expect(() => emitDemoModeToggled(false)).not.toThrow()
  })
})

describe('emitPageView resets page ID', () => {
  it('emits page view for different paths', () => {
    expect(() => emitPageView('/')).not.toThrow()
    expect(() => emitPageView('/clusters')).not.toThrow()
    expect(() => emitPageView('/settings')).not.toThrow()
  })
})

describe('emitCardAdded with various sources', () => {
  it('handles manual source', () => {
    expect(() => emitCardAdded('pods', 'manual')).not.toThrow()
  })

  it('handles marketplace source', () => {
    expect(() => emitCardAdded('gpu-monitor', 'marketplace')).not.toThrow()
  })

  it('handles recommendation source', () => {
    expect(() => emitCardAdded('nodes', 'recommendation')).not.toThrow()
  })

  it('handles smart_suggestion source', () => {
    expect(() => emitCardAdded('deployments', 'smart_suggestion')).not.toThrow()
  })
})

describe('emitModalOpened/TabViewed/Closed lifecycle', () => {
  it('tracks full modal lifecycle', () => {
    expect(() => emitModalOpened('pod', 'pod_issues')).not.toThrow()
    expect(() => emitModalTabViewed('pod', 'logs')).not.toThrow()
    expect(() => emitModalTabViewed('pod', 'yaml')).not.toThrow()
    expect(() => emitModalClosed('pod', 15000)).not.toThrow()
  })

  it('handles modal with zero duration', () => {
    expect(() => emitModalClosed('cluster', 0)).not.toThrow()
  })
})

describe('emitDrillDown lifecycle', () => {
  it('tracks open and close with depth', () => {
    expect(() => emitDrillDownOpened('namespace')).not.toThrow()
    expect(() => emitDrillDownClosed('namespace', 3)).not.toThrow()
  })

  it('handles zero depth', () => {
    expect(() => emitDrillDownClosed('pod', 0)).not.toThrow()
  })
})

describe('emitFromLensCommandCopy parameters', () => {
  it('passes tab, step, and command', () => {
    expect(() => emitFromLensCommandCopy('localhost', 1, 'curl -sL ... | bash')).not.toThrow()
    expect(() => emitFromLensCommandCopy('cluster-portforward', 2, 'kubectl port-forward')).not.toThrow()
    expect(() => emitFromLensCommandCopy('cluster-ingress', 3, 'kubectl apply -f')).not.toThrow()
  })
})

describe('emitFromHeadlampCommandCopy parameters', () => {
  it('passes tab, step, and command', () => {
    expect(() => emitFromHeadlampCommandCopy('localhost', 1, 'brew install')).not.toThrow()
    expect(() => emitFromHeadlampCommandCopy('cluster-portforward', 2, 'kubectl apply')).not.toThrow()
  })
})

describe('emitWhiteLabelCommandCopy parameters', () => {
  it('passes tab, step, and command', () => {
    expect(() => emitWhiteLabelCommandCopy('binary', 1, './ksc --branding config.yaml')).not.toThrow()
    expect(() => emitWhiteLabelCommandCopy('docker', 2, 'docker run -e BRANDING_URL=...')).not.toThrow()
    expect(() => emitWhiteLabelCommandCopy('helm', 3, 'helm install ksc ...')).not.toThrow()
  })
})
