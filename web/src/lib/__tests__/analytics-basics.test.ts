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

describe('analytics module', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('all emit functions are callable without throwing', () => {
    // These all call send() internally, which gates on initialized/opted-out
    // They should never throw even when analytics is not initialized
    expect(() => emitPageView('/test')).not.toThrow()
    expect(() => emitCardAdded('test', 'manual')).not.toThrow()
    expect(() => emitCardRemoved('test')).not.toThrow()
    expect(() => emitCardExpanded('test')).not.toThrow()
    expect(() => emitCardDragged('test')).not.toThrow()
    expect(() => emitCardConfigured('test')).not.toThrow()
    expect(() => emitCardReplaced('old', 'new')).not.toThrow()
    expect(() => emitLogin('github')).not.toThrow()
    expect(() => emitLogout()).not.toThrow()
    expect(() => emitFeedbackSubmitted('bug')).not.toThrow()
    expect(() => emitError('test', 'detail')).not.toThrow()
    expect(() => emitTourStarted()).not.toThrow()
    expect(() => emitTourCompleted(5)).not.toThrow()
    expect(() => emitTourSkipped(2)).not.toThrow()
    expect(() => emitMarketplaceInstall('card', 'test')).not.toThrow()
    expect(() => emitMarketplaceRemove('card')).not.toThrow()
    expect(() => emitThemeChanged('dark', 'settings')).not.toThrow()
    expect(() => emitLanguageChanged('en')).not.toThrow()
    expect(() => emitSessionExpired()).not.toThrow()
    expect(() => emitGlobalSearchOpened('keyboard')).not.toThrow()
    expect(() => emitGlobalSearchQueried(5, 10)).not.toThrow()
    expect(() => emitConversionStep(1, 'discovery')).not.toThrow()
    expect(() => emitAgentConnected('1.0', 3)).not.toThrow()
    expect(() => emitAgentDisconnected()).not.toThrow()
    expect(() => emitBenchmarkViewed('latency')).not.toThrow()
    expect(() => emitDashboardCreated('test')).not.toThrow()
    expect(() => emitDashboardDeleted()).not.toThrow()
    expect(() => emitDashboardRenamed()).not.toThrow()
    expect(() => emitDashboardImported()).not.toThrow()
    expect(() => emitDashboardExported()).not.toThrow()
    expect(() => emitUpdateChecked()).not.toThrow()
    expect(() => emitUpdateTriggered()).not.toThrow()
    expect(() => emitDrillDownOpened('pod')).not.toThrow()
    expect(() => emitDrillDownClosed('pod', 1)).not.toThrow()
    expect(() => emitCardRefreshed('test')).not.toThrow()
    expect(() => emitGlobalClusterFilterChanged(3, 5)).not.toThrow()
    expect(() => emitSnoozed('card', '1h')).not.toThrow()
    expect(() => emitUnsnoozed('card')).not.toThrow()
    expect(() => emitWidgetLoaded('standalone')).not.toThrow()
    expect(() => emitGameStarted('tetris')).not.toThrow()
    expect(() => emitGameEnded('tetris', 'win', 100)).not.toThrow()
    expect(() => emitSidebarNavigated('/clusters')).not.toThrow()
    expect(() => emitLocalClusterCreated('kind')).not.toThrow()
    expect(() => emitAdopterNudgeShown()).not.toThrow()
    expect(() => emitNudgeShown('test')).not.toThrow()
    expect(() => emitLinkedInShare('dashboard')).not.toThrow()
    expect(() => emitModalOpened('pod', 'pod_issues')).not.toThrow()
    expect(() => emitModalClosed('pod', 5000)).not.toThrow()
    expect(() => emitWelcomeViewed('test')).not.toThrow()
    expect(() => emitWelcomeActioned('click', 'test')).not.toThrow()
    expect(() => emitFromLensViewed()).not.toThrow()
    expect(() => emitWhiteLabelViewed()).not.toThrow()
    expect(() => emitTipShown('dashboard', 'tip1')).not.toThrow()
    expect(() => emitStreakDay(5)).not.toThrow()
  })
})

describe('markErrorReported', () => {
  it('does not throw', () => {
    expect(() => markErrorReported('test error')).not.toThrow()
  })
})

describe('updateAnalyticsIds', () => {
  it('does not throw with valid IDs', () => {
    expect(() => updateAnalyticsIds({
      ga4MeasurementId: 'G-TEST123',
      umamiWebsiteId: 'test-id',
    })).not.toThrow()
  })

  it('handles empty overrides', () => {
    expect(() => updateAnalyticsIds({})).not.toThrow()
  })
})

describe('setAnalyticsUserProperties', () => {
  it('does not throw', () => {
    expect(() => setAnalyticsUserProperties({ test: 'value' })).not.toThrow()
  })
})

describe('opt-out', () => {
  beforeEach(() => { localStorage.clear() })

  it('isAnalyticsOptedOut returns false by default', () => {
    expect(isAnalyticsOptedOut()).toBe(false)
  })

  it('setAnalyticsOptOut sets the flag', () => {
    setAnalyticsOptOut(true)
    expect(isAnalyticsOptedOut()).toBe(true)
  })

  it('setAnalyticsOptOut can re-enable', () => {
    setAnalyticsOptOut(true)
    setAnalyticsOptOut(false)
    expect(isAnalyticsOptedOut()).toBe(false)
  })
})

describe('getUtmParams', () => {
  it('returns a copy of UTM params', () => {
    const params = getUtmParams()
    expect(typeof params).toBe('object')
  })
})

describe('emitClusterInventory', () => {
  it('does not throw', () => {
    expect(() => emitClusterInventory({
      total: 5,
      healthy: 4,
      unhealthy: 1,
      unreachable: 0,
      distributions: { eks: 2, gke: 3 },
    })).not.toThrow()
  })
})

describe('emitAgentProvidersDetected', () => {
  it('does not throw with providers', () => {
    expect(() => emitAgentProvidersDetected([
      { name: 'openai', displayName: 'OpenAI', capabilities: 1 },
      { name: 'claude', displayName: 'Claude', capabilities: 3 },
    ])).not.toThrow()
  })

  it('does not throw with empty array', () => {
    expect(() => emitAgentProvidersDetected([])).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// NEW TESTS — regression-preventing coverage for untested behaviors
// ---------------------------------------------------------------------------

describe('opt-out localStorage persistence', () => {
  const OPT_OUT_KEY = 'kc-analytics-opt-out'

  beforeEach(() => { localStorage.clear() })

  it('opt-out persists the value "true" in localStorage', () => {
    setAnalyticsOptOut(true)
    expect(localStorage.getItem(OPT_OUT_KEY)).toBe('true')
  })

  it('opt-in persists the value "false" in localStorage', () => {
    setAnalyticsOptOut(true)
    setAnalyticsOptOut(false)
    expect(localStorage.getItem(OPT_OUT_KEY)).toBe('false')
  })

  it('opt-out clears session-related localStorage keys', () => {
    // Simulate session keys that the analytics module manages
    localStorage.setItem('_ksc_cid', 'test-cid')
    localStorage.setItem('_ksc_sid', 'test-sid')
    localStorage.setItem('_ksc_sc', '1')
    localStorage.setItem('_ksc_last', '12345')

    setAnalyticsOptOut(true)

    expect(localStorage.getItem('_ksc_cid')).toBeNull()
    expect(localStorage.getItem('_ksc_sid')).toBeNull()
    expect(localStorage.getItem('_ksc_sc')).toBeNull()
    expect(localStorage.getItem('_ksc_last')).toBeNull()
  })

  it('opt-out dispatches kubestellar-settings-changed event', () => {
    const handler = vi.fn()
    window.addEventListener('kubestellar-settings-changed', handler)
    try {
      setAnalyticsOptOut(true)
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('kubestellar-settings-changed', handler)
    }
  })

  it('opt-in dispatches kubestellar-settings-changed event', () => {
    const handler = vi.fn()
    window.addEventListener('kubestellar-settings-changed', handler)
    try {
      setAnalyticsOptOut(false)
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('kubestellar-settings-changed', handler)
    }
  })
})

describe('additional emit functions not throwing', () => {
  beforeEach(() => { localStorage.clear() })

  it('emitGlobalSearchSelected does not throw', () => {
    expect(() => emitGlobalSearchSelected('cluster', 0)).not.toThrow()
  })

  it('emitGlobalSearchAskAI does not throw', () => {
    expect(() => emitGlobalSearchAskAI(10)).not.toThrow()
  })

  it('emitCardSortChanged does not throw', () => {
    expect(() => emitCardSortChanged('name', 'pods')).not.toThrow()
  })

  it('emitCardSortDirectionChanged does not throw', () => {
    expect(() => emitCardSortDirectionChanged('asc', 'pods')).not.toThrow()
  })

  it('emitCardLimitChanged does not throw', () => {
    expect(() => emitCardLimitChanged('25', 'pods')).not.toThrow()
  })

  it('emitCardSearchUsed does not throw', () => {
    expect(() => emitCardSearchUsed(5, 'pods')).not.toThrow()
  })

  it('emitCardClusterFilterChanged does not throw', () => {
    expect(() => emitCardClusterFilterChanged(2, 5, 'pods')).not.toThrow()
  })

  it('emitCardPaginationUsed does not throw', () => {
    expect(() => emitCardPaginationUsed(2, 5, 'pods')).not.toThrow()
  })

  it('emitCardListItemClicked does not throw', () => {
    expect(() => emitCardListItemClicked('pods')).not.toThrow()
  })

  it('emitMissionStarted does not throw', () => {
    expect(() => emitMissionStarted('security-scan', 'openai')).not.toThrow()
  })

  it('emitMissionCompleted does not throw', () => {
    expect(() => emitMissionCompleted('security-scan', 120)).not.toThrow()
  })

  it('emitMissionError does not throw', () => {
    expect(() => emitMissionError('security-scan', 'TIMEOUT')).not.toThrow()
  })

  it('emitMissionRated does not throw', () => {
    expect(() => emitMissionRated('security-scan', 'helpful')).not.toThrow()
  })

  it('emitFixerSearchStarted does not throw', () => {
    expect(() => emitFixerSearchStarted(true)).not.toThrow()
  })

  it('emitFixerSearchCompleted does not throw', () => {
    expect(() => emitFixerSearchCompleted(3, 10)).not.toThrow()
  })

  it('emitFixerBrowsed does not throw', () => {
    expect(() => emitFixerBrowsed('/security')).not.toThrow()
  })

  it('emitFixerViewed does not throw with and without cncfProject', () => {
    expect(() => emitFixerViewed('Fix RBAC')).not.toThrow()
    expect(() => emitFixerViewed('Fix RBAC', 'falco')).not.toThrow()
  })

  it('emitFixerImported does not throw', () => {
    expect(() => emitFixerImported('Fix RBAC', 'falco')).not.toThrow()
  })

  it('emitFixerImportError does not throw', () => {
    expect(() => emitFixerImportError('Fix RBAC', 2, 'Invalid YAML')).not.toThrow()
  })

  it('emitFixerLinkCopied does not throw', () => {
    expect(() => emitFixerLinkCopied('Fix RBAC')).not.toThrow()
  })

  it('emitFixerGitHubLink does not throw', () => {
    expect(() => emitFixerGitHubLink()).not.toThrow()
  })

  it('emitMarketplaceInstallFailed does not throw', () => {
    expect(() => emitMarketplaceInstallFailed('card', 'gpu-monitor', 'timeout')).not.toThrow()
  })

  it('emitApiKeyConfigured does not throw', () => {
    expect(() => emitApiKeyConfigured('openai')).not.toThrow()
  })

  it('emitApiKeyRemoved does not throw', () => {
    expect(() => emitApiKeyRemoved('openai')).not.toThrow()
  })

  it('emitInstallCommandCopied does not throw', () => {
    expect(() => emitInstallCommandCopied('setup_quickstart', 'curl | bash')).not.toThrow()
  })

  it('emitDeployWorkload does not throw', () => {
    expect(() => emitDeployWorkload('nginx', 'prod-clusters')).not.toThrow()
  })

  it('emitDeployTemplateApplied does not throw', () => {
    expect(() => emitDeployTemplateApplied('multi-cluster-ha')).not.toThrow()
  })

  it('emitComplianceDrillDown does not throw', () => {
    expect(() => emitComplianceDrillDown('security')).not.toThrow()
  })

  it('emitComplianceFilterChanged does not throw', () => {
    expect(() => emitComplianceFilterChanged('severity')).not.toThrow()
  })

  it('emitClusterCreated does not throw', () => {
    expect(() => emitClusterCreated('prod-1', 'kubeconfig')).not.toThrow()
  })

  it('emitGitHubConnected does not throw', () => {
    expect(() => emitGitHubConnected()).not.toThrow()
  })

  it('emitClusterAction does not throw', () => {
    expect(() => emitClusterAction('drain', 'prod-1')).not.toThrow()
  })

  it('emitClusterStatsDrillDown does not throw', () => {
    expect(() => emitClusterStatsDrillDown('cpu')).not.toThrow()
  })

  it('emitWidgetNavigation does not throw', () => {
    expect(() => emitWidgetNavigation('/clusters')).not.toThrow()
  })

  it('emitWidgetInstalled does not throw', () => {
    expect(() => emitWidgetInstalled('pwa-prompt')).not.toThrow()
  })

  it('emitWidgetDownloaded does not throw', () => {
    expect(() => emitWidgetDownloaded('uebersicht')).not.toThrow()
  })

  it('emitNudgeDismissed does not throw', () => {
    expect(() => emitNudgeDismissed('add-card')).not.toThrow()
  })

  it('emitNudgeActioned does not throw', () => {
    expect(() => emitNudgeActioned('add-card')).not.toThrow()
  })

  it('emitSmartSuggestionsShown does not throw', () => {
    expect(() => emitSmartSuggestionsShown(3)).not.toThrow()
  })

  it('emitSmartSuggestionAccepted does not throw', () => {
    expect(() => emitSmartSuggestionAccepted('pods')).not.toThrow()
  })

  it('emitSmartSuggestionsAddAll does not throw', () => {
    expect(() => emitSmartSuggestionsAddAll(5)).not.toThrow()
  })

  it('emitCardRecommendationsShown does not throw', () => {
    expect(() => emitCardRecommendationsShown(4, 2)).not.toThrow()
  })

  it('emitCardRecommendationActioned does not throw', () => {
    expect(() => emitCardRecommendationActioned('pods', 'high')).not.toThrow()
  })

  it('emitMissionSuggestionsShown does not throw', () => {
    expect(() => emitMissionSuggestionsShown(3, 1)).not.toThrow()
  })

  it('emitMissionSuggestionActioned does not throw', () => {
    expect(() => emitMissionSuggestionActioned('security-scan', 'critical', 'start')).not.toThrow()
  })

  it('emitAddCardModalOpened does not throw', () => {
    expect(() => emitAddCardModalOpened()).not.toThrow()
  })

  it('emitAddCardModalAbandoned does not throw', () => {
    expect(() => emitAddCardModalAbandoned()).not.toThrow()
  })

  it('emitDashboardScrolled does not throw', () => {
    expect(() => emitDashboardScrolled('shallow')).not.toThrow()
    expect(() => emitDashboardScrolled('deep')).not.toThrow()
  })

  it('emitPwaPromptShown does not throw', () => {
    expect(() => emitPwaPromptShown()).not.toThrow()
  })

  it('emitPwaPromptDismissed does not throw', () => {
    expect(() => emitPwaPromptDismissed()).not.toThrow()
  })

  it('emitSessionContext does not throw', () => {
    expect(() => emitSessionContext('binary', 'stable')).not.toThrow()
  })

  it('emitUpdateCompleted does not throw', () => {
    expect(() => emitUpdateCompleted(5000)).not.toThrow()
  })

  it('emitUpdateFailed does not throw', () => {
    expect(() => emitUpdateFailed('connection timeout')).not.toThrow()
  })

  it('emitUpdateRefreshed does not throw', () => {
    expect(() => emitUpdateRefreshed()).not.toThrow()
  })

  it('emitUpdateStalled does not throw', () => {
    expect(() => emitUpdateStalled()).not.toThrow()
  })

  it('emitGlobalSeverityFilterChanged does not throw', () => {
    expect(() => emitGlobalSeverityFilterChanged(2)).not.toThrow()
  })

  it('emitGlobalStatusFilterChanged does not throw', () => {
    expect(() => emitGlobalStatusFilterChanged(3)).not.toThrow()
  })

  it('emitDataExported does not throw', () => {
    expect(() => emitDataExported('csv')).not.toThrow()
    expect(() => emitDataExported('json', 'pods')).not.toThrow()
  })

  it('emitUserRoleChanged does not throw', () => {
    expect(() => emitUserRoleChanged('admin')).not.toThrow()
  })

  it('emitUserRemoved does not throw', () => {
    expect(() => emitUserRemoved()).not.toThrow()
  })

  it('emitMarketplaceItemViewed does not throw', () => {
    expect(() => emitMarketplaceItemViewed('card', 'gpu-monitor')).not.toThrow()
  })

  it('emitInsightViewed does not throw', () => {
    expect(() => emitInsightViewed('security')).not.toThrow()
  })

  it('emitInsightAcknowledged does not throw', () => {
    expect(() => emitInsightAcknowledged('security', 'critical')).not.toThrow()
  })

  it('emitInsightDismissed does not throw', () => {
    expect(() => emitInsightDismissed('performance', 'warning')).not.toThrow()
  })

  it('emitActionClicked does not throw', () => {
    expect(() => emitActionClicked('drain', 'cluster-health', 'default')).not.toThrow()
  })

  it('emitAISuggestionViewed does not throw', () => {
    expect(() => emitAISuggestionViewed('security', true)).not.toThrow()
    expect(() => emitAISuggestionViewed('performance', false)).not.toThrow()
  })

  it('emitDeveloperSession does not throw', () => {
    expect(() => emitDeveloperSession()).not.toThrow()
  })

  it('emitCardCategoryBrowsed does not throw', () => {
    expect(() => emitCardCategoryBrowsed('monitoring')).not.toThrow()
  })

  it('emitRecommendedCardShown does not throw', () => {
    expect(() => emitRecommendedCardShown(['pods', 'nodes'])).not.toThrow()
  })

  it('emitDashboardViewed does not throw', () => {
    expect(() => emitDashboardViewed('default', 30000)).not.toThrow()
  })

  it('emitFeatureHintShown does not throw', () => {
    expect(() => emitFeatureHintShown('drag-reorder')).not.toThrow()
  })

  it('emitFeatureHintDismissed does not throw', () => {
    expect(() => emitFeatureHintDismissed('drag-reorder')).not.toThrow()
  })

  it('emitFeatureHintActioned does not throw', () => {
    expect(() => emitFeatureHintActioned('drag-reorder')).not.toThrow()
  })

  it('emitGettingStartedShown does not throw', () => {
    expect(() => emitGettingStartedShown()).not.toThrow()
  })

  it('emitGettingStartedActioned does not throw', () => {
    expect(() => emitGettingStartedActioned('add-clusters')).not.toThrow()
  })

  it('emitPostConnectShown does not throw', () => {
    expect(() => emitPostConnectShown()).not.toThrow()
  })

  it('emitPostConnectActioned does not throw', () => {
    expect(() => emitPostConnectActioned('view-clusters')).not.toThrow()
  })

  it('emitDemoToLocalShown does not throw', () => {
    expect(() => emitDemoToLocalShown()).not.toThrow()
  })

  it('emitDemoToLocalActioned does not throw', () => {
    expect(() => emitDemoToLocalActioned('copy-command')).not.toThrow()
  })

  it('emitAdopterNudgeActioned does not throw', () => {
    expect(() => emitAdopterNudgeActioned('edit-adopters')).not.toThrow()
  })

  it('emitModalTabViewed does not throw', () => {
    expect(() => emitModalTabViewed('pod', 'logs')).not.toThrow()
  })

  it('emitFromLensActioned does not throw', () => {
    expect(() => emitFromLensActioned('hero_try_demo')).not.toThrow()
  })

  it('emitFromLensTabSwitch does not throw', () => {
    expect(() => emitFromLensTabSwitch('cluster-portforward')).not.toThrow()
  })

  it('emitFromLensCommandCopy does not throw', () => {
    expect(() => emitFromLensCommandCopy('localhost', 1, 'curl | bash')).not.toThrow()
  })

  it('emitFromHeadlampViewed does not throw', () => {
    expect(() => emitFromHeadlampViewed()).not.toThrow()
  })

  it('emitFromHeadlampActioned does not throw', () => {
    expect(() => emitFromHeadlampActioned('hero_try_demo')).not.toThrow()
  })

  it('emitFromHeadlampTabSwitch does not throw', () => {
    expect(() => emitFromHeadlampTabSwitch('cluster-ingress')).not.toThrow()
  })

  it('emitFromHeadlampCommandCopy does not throw', () => {
    expect(() => emitFromHeadlampCommandCopy('localhost', 2, 'kubectl apply')).not.toThrow()
  })

  it('emitWhiteLabelActioned does not throw', () => {
    expect(() => emitWhiteLabelActioned('hero_try_demo')).not.toThrow()
  })

  it('emitWhiteLabelTabSwitch does not throw', () => {
    expect(() => emitWhiteLabelTabSwitch('helm')).not.toThrow()
  })

  it('emitWhiteLabelCommandCopy does not throw', () => {
    expect(() => emitWhiteLabelCommandCopy('docker', 1, 'docker run')).not.toThrow()
  })

  it('emitGitHubTokenConfigured does not throw', () => {
    expect(() => emitGitHubTokenConfigured()).not.toThrow()
  })

  it('emitGitHubTokenRemoved does not throw', () => {
    expect(() => emitGitHubTokenRemoved()).not.toThrow()
  })

  it('emitApiProviderConnected does not throw', () => {
    expect(() => emitApiProviderConnected('anthropic')).not.toThrow()
  })

  it('emitDemoModeToggled does not throw', () => {
    expect(() => emitDemoModeToggled(true)).not.toThrow()
    expect(() => emitDemoModeToggled(false)).not.toThrow()
  })

  it('emitAIModeChanged does not throw', () => {
    expect(() => emitAIModeChanged('high')).not.toThrow()
  })

  it('emitAIPredictionsToggled does not throw', () => {
    expect(() => emitAIPredictionsToggled(true)).not.toThrow()
  })

  it('emitConfidenceThresholdChanged does not throw', () => {
    expect(() => emitConfidenceThresholdChanged(0.8)).not.toThrow()
  })

  it('emitConsensusModeToggled does not throw', () => {
    expect(() => emitConsensusModeToggled(true)).not.toThrow()
  })

  it('emitPredictionFeedbackSubmitted does not throw', () => {
    expect(() => emitPredictionFeedbackSubmitted('positive', 'cpu-forecast')).not.toThrow()
    expect(() => emitPredictionFeedbackSubmitted('negative', 'memory-forecast', 'openai')).not.toThrow()
  })

  it('emitChunkReloadRecoveryFailed does not throw', () => {
    expect(() => emitChunkReloadRecoveryFailed('Failed to fetch dynamically imported module')).not.toThrow()
  })
})

