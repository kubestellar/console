/**
 * analytics.ts — barrel re-export
 *
 * This file is the single public entry point for analytics. All existing
 * imports from 'lib/analytics' continue to work without change.
 *
 * Implementation is split into focused modules:
 *   analytics-types.ts   — shared types, interfaces, window augmentation
 *   analytics-session.ts — bot detection, client/session identity, engagement tracking, UTM
 *   analytics-core.ts    — send pipeline (gtag/proxy/umami), init, opt-out, error tracking
 *   analytics-events.ts  — domain-specific emit* functions
 */

// ── Core lifecycle & configuration ────────────────────────────────
export {
  initAnalytics,
  updateAnalyticsIds,
  setAnalyticsUserId,
  setAnalyticsUserProperties,
  setAnalyticsOptOut,
  isAnalyticsOptedOut,
  emitPageView,
  emitUserEngagement,
  startGlobalErrorTracking,
  emitError,
  emitChunkReloadRecoveryFailed,
  markErrorReported,
  captureUtmParams,
} from './analytics-core'
export type { EmitErrorExtra } from './analytics-core'

// ── UTM params accessor ───────────────────────────────────────────
export { getUtmParams } from './analytics-session'

// ── Domain events ─────────────────────────────────────────────────
export {
  // Dashboard & Cards
  emitCardAdded,
  emitCardRemoved,
  emitCardExpanded,
  emitCardDragged,
  emitCardConfigured,
  emitCardReplaced,

  // Global Search
  emitGlobalSearchOpened,
  emitGlobalSearchQueried,
  emitGlobalSearchSelected,
  emitGlobalSearchAskAI,

  // Card interactions (framework-level)
  emitCardSortChanged,
  emitCardSortDirectionChanged,
  emitCardLimitChanged,
  emitCardSearchUsed,
  emitCardClusterFilterChanged,
  emitCardPaginationUsed,
  emitCardListItemClicked,

  // AI Missions
  emitMissionStarted,
  emitMissionCompleted,
  emitMissionError,
  emitMissionRated,

  // Mission Browser / Knowledge Base
  emitFixerSearchStarted,
  emitFixerSearchCompleted,
  emitFixerBrowsed,
  emitFixerViewed,
  emitFixerImported,
  emitFixerImportError,
  emitFixerLinkCopied,
  emitFixerGitHubLink,

  // Auth
  emitLogin,
  emitLogout,

  // Feedback
  emitFeedbackSubmitted,
  emitScreenshotAttached,
  emitScreenshotUploadFailed,
  emitScreenshotUploadSuccess,

  // NPS Survey
  emitNPSSurveyShown,
  emitNPSResponse,
  emitNPSDismissed,

  // Orbit
  emitOrbitMissionCreated,
  emitOrbitMissionRun,
  emitGroundControlDashboardCreated,
  emitGroundControlCardRequestOpened,

  // Errors (domain-level, separate from core error tracking)
  emitSessionExpired,
  emitAgentTokenFailure,
  emitWsAuthMissing,
  emitSseAuthFailure,
  emitSessionRefreshFailure,

  // Tour
  emitTourStarted,
  emitTourCompleted,
  emitTourSkipped,

  // Marketplace
  emitMarketplaceInstall,
  emitMarketplaceRemove,
  emitMarketplaceInstallFailed,

  // Theme
  emitThemeChanged,

  // Language
  emitLanguageChanged,

  // AI Settings
  emitAIModeChanged,
  emitAIPredictionsToggled,
  emitConfidenceThresholdChanged,
  emitConsensusModeToggled,

  // GitHub Token
  emitGitHubTokenConfigured,
  emitGitHubTokenRemoved,

  // API Provider
  emitApiProviderConnected,

  // Demo Mode
  emitDemoModeToggled,

  // kc-agent Connection
  emitAgentConnected,
  emitAgentDisconnected,
  emitClusterInventory,
  emitAgentProvidersDetected,

  // API Key
  emitApiKeyConfigured,
  emitApiKeyRemoved,

  // Install Command
  emitInstallCommandCopied,

  // Conversion Funnel
  emitConversionStep,

  // Deploy
  emitDeployWorkload,
  emitDeployTemplateApplied,

  // Compliance
  emitComplianceDrillDown,
  emitComplianceFilterChanged,

  // Benchmarks
  emitBenchmarkViewed,

  // Cluster Lifecycle
  emitClusterCreated,

  // GitHub OAuth
  emitGitHubConnected,

  // Cluster Admin
  emitClusterAction,
  emitClusterStatsDrillDown,

  // Widget Tracking
  emitWidgetLoaded,
  emitWidgetNavigation,
  emitWidgetInstalled,
  emitWidgetDownloaded,

  // Engagement Nudges
  emitNudgeShown,
  emitNudgeDismissed,
  emitNudgeActioned,
  emitSmartSuggestionsShown,
  emitSmartSuggestionAccepted,
  emitSmartSuggestionsAddAll,

  // Card Recommendations
  emitCardRecommendationsShown,
  emitCardRecommendationActioned,

  // Mission Suggestions
  emitMissionSuggestionsShown,
  emitMissionSuggestionActioned,

  // "Almost" Action Tracking
  emitAddCardModalOpened,
  emitAddCardModalAbandoned,
  emitDashboardScrolled,
  emitPwaPromptShown,
  emitPwaPromptDismissed,

  // LinkedIn Share
  emitLinkedInShare,

  // Session Context
  emitSessionContext,

  // Settings: Update
  emitUpdateChecked,
  emitUpdateTriggered,
  emitUpdateCompleted,
  emitUpdateFailed,
  emitUpdateRefreshed,
  emitUpdateStalled,

  // Drill-Down
  emitDrillDownOpened,
  emitDrillDownClosed,

  // Card Refresh
  emitCardRefreshed,

  // Global Filters
  emitGlobalClusterFilterChanged,
  emitGlobalSeverityFilterChanged,
  emitGlobalStatusFilterChanged,

  // Prediction Feedback
  emitPredictionFeedbackSubmitted,

  // Snooze
  emitSnoozed,
  emitUnsnoozed,

  // Dashboard CRUD
  emitDashboardCreated,
  emitDashboardDeleted,
  emitDashboardRenamed,
  emitDashboardImported,
  emitDashboardExported,

  // Data Export
  emitDataExported,

  // User Management
  emitUserRoleChanged,
  emitUserRemoved,

  // Marketplace Browsing
  emitMarketplaceItemViewed,

  // Insights
  emitInsightViewed,

  // Arcade Games
  emitGameStarted,
  emitGameEnded,

  // Sidebar Navigation
  emitSidebarNavigated,

  // Local Cluster
  emitLocalClusterCreated,

  // Developer Session
  emitDeveloperSession,

  // Card Modal Browsing
  emitCardCategoryBrowsed,
  emitRecommendedCardShown,

  // Dashboard Duration
  emitDashboardViewed,

  // Feature Hints
  emitFeatureHintShown,
  emitFeatureHintDismissed,
  emitFeatureHintActioned,

  // Getting Started Banner
  emitGettingStartedShown,
  emitGettingStartedActioned,

  // Post-Connect Activation
  emitPostConnectShown,
  emitPostConnectActioned,

  // Demo-to-Local CTA
  emitDemoToLocalShown,
  emitDemoToLocalActioned,

  // Adopter Nudge
  emitAdopterNudgeShown,
  emitAdopterNudgeActioned,

  // Dashboard Excellence: Modal & Action Events
  emitModalOpened,
  emitModalTabViewed,
  emitModalClosed,
  emitInsightAcknowledged,
  emitInsightDismissed,
  emitActionClicked,
  emitAISuggestionViewed,

  // Welcome / Conference Landing Page
  emitWelcomeViewed,
  emitWelcomeActioned,

  // From Lens Landing Page
  emitFromLensViewed,
  emitFromLensActioned,
  emitFromLensTabSwitch,
  emitFromLensCommandCopy,

  // From Headlamp Landing Page
  emitFromHeadlampViewed,
  emitFromHeadlampActioned,
  emitFromHeadlampTabSwitch,
  emitFromHeadlampCommandCopy,

  // White Label Landing Page
  emitWhiteLabelViewed,
  emitWhiteLabelActioned,
  emitWhiteLabelTabSwitch,
  emitWhiteLabelCommandCopy,

  // Rotating tips & engagement
  emitTipShown,
  emitStreakDay,
  emitBlogPostClicked,

  // What's New modal
  emitWhatsNewModalOpened,
  emitWhatsNewUpdateClicked,
  emitWhatsNewRemindLater,

  // ACMM Dashboard
  emitACMMScanned,
  emitACMMMissionLaunched,
  emitACMMLevelMissionLaunched,
} from './analytics-events'

// ── Types (for consumers who need them) ───────────────────────────
export type { DeploymentType, InstallCopySource, UtmParams, ProviderSummary, SendOptions } from './analytics-types'
