/**
 * analytics-events.ts
 *
 * Domain-specific analytics event emitters. All functions call send() from
 * analytics-core.ts. Organized by product area matching the section headers
 * in the original analytics.ts.
 */

import { send, setAnalyticsUserProperties, emitError } from './analytics-core'
import type { InstallCopySource, ProviderSummary } from './analytics-types'
import { CAPABILITY_TOOL_EXEC, CAPABILITY_CHAT } from './analytics-types'
import { isDemoMode } from './demoMode'
import { getDeploymentType } from './analytics-session'

// ── Page views ─────────────────────────────────────────────────────
// (emitPageView lives in analytics-core.ts because it needs rand() and emitUserEngagement)

// ── Dashboard & Cards ──────────────────────────────────────────────

export function emitCardAdded(cardType: string, source: string) {
  send('ksc_card_added', { card_type: cardType, source })
}

export function emitCardRemoved(cardType: string) {
  send('ksc_card_removed', { card_type: cardType })
}

export function emitCardExpanded(cardType: string) {
  send('ksc_card_expanded', { card_type: cardType })
}

export function emitCardDragged(cardType: string) {
  send('ksc_card_dragged', { card_type: cardType })
}

export function emitCardConfigured(cardType: string) {
  send('ksc_card_configured', { card_type: cardType })
}

export function emitCardReplaced(oldType: string, newType: string) {
  send('ksc_card_replaced', { old_type: oldType, new_type: newType })
}

// ── Global Search (Cmd+K) ─────────────────────────────────────────────

/** Fired when user opens the global search dialog (Cmd+K, Ctrl+K, or click) */
export function emitGlobalSearchOpened(method: 'keyboard' | 'click') {
  send('ksc_global_search_opened', { method })
}

/** Fired when user executes a search query (debounced — fires once per search session on blur) */
export function emitGlobalSearchQueried(queryLength: number, resultCount: number) {
  send('ksc_global_search_queried', { query_length: queryLength, result_count: resultCount })
}

/** Fired when user selects a result from global search */
export function emitGlobalSearchSelected(category: string, resultIndex: number) {
  send('ksc_global_search_selected', { category, result_index: resultIndex })
}

/** Fired when user chooses "Ask AI" from global search */
export function emitGlobalSearchAskAI(queryLength: number) {
  send('ksc_global_search_ask_ai', { query_length: queryLength })
}

// ── Card Interactions (framework-level) ──────────────────────────────
// These fire automatically from shared UI components (CardControls,
// CardSearchInput, CardClusterFilter) so all cards get consistent
// tracking without per-card instrumentation.

/** Fired when user changes sort field in a card's controls */
export function emitCardSortChanged(sortField: string, cardType: string) {
  send('ksc_card_sort_changed', { sort_field: sortField, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user toggles sort direction in a card's controls */
export function emitCardSortDirectionChanged(direction: string, cardType: string) {
  send('ksc_card_sort_direction_changed', { direction, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user changes the item limit in a card's controls */
export function emitCardLimitChanged(limit: string, cardType: string) {
  send('ksc_card_limit_changed', { limit, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user types in a card's search input (debounced — fires once per search session) */
export function emitCardSearchUsed(queryLength: number, cardType: string) {
  send('ksc_card_search_used', { query_length: queryLength, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user changes cluster filter selection in a card */
export function emitCardClusterFilterChanged(selectedCount: number, totalCount: number, cardType: string) {
  send('ksc_card_cluster_filter_changed', {
    selected_count: selectedCount,
    total_count: totalCount,
    card_type: cardType,
    page_path: window.location.pathname,
  })
}

/** Fired when user navigates pages via pagination controls */
export function emitCardPaginationUsed(page: number, totalPages: number, cardType: string) {
  send('ksc_card_pagination_used', { page, total_pages: totalPages, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user clicks a list item row in a card */
export function emitCardListItemClicked(cardType: string) {
  send('ksc_card_list_item_clicked', { card_type: cardType, page_path: window.location.pathname })
}

// ── AI Missions ────────────────────────────────────────────────────

export function emitMissionStarted(missionType: string, agentProvider: string) {
  send('ksc_mission_started', { mission_type: missionType, agent_provider: agentProvider })
}

export function emitMissionCompleted(missionType: string, durationSec: number) {
  send('ksc_mission_completed', { mission_type: missionType, duration_sec: durationSec })
}

// Max characters to send in the error_detail dimension. GA4 caps event
// parameter values at 100 chars, so anything longer is truncated to stay
// within the limit while still surfacing the leading diagnostic text.
const MISSION_ERROR_DETAIL_MAX_LEN = 100

export function emitMissionError(
  missionType: string,
  errorCode: string,
  errorDetail?: string
) {
  const trimmedDetail = errorDetail?.trim()
  send('ksc_mission_error', {
    mission_type: missionType,
    error_code: errorCode,
    error_detail: trimmedDetail
      ? trimmedDetail.slice(0, MISSION_ERROR_DETAIL_MAX_LEN)
      : '' })
}

export function emitMissionRated(missionType: string, rating: string) {
  send('ksc_mission_rated', { mission_type: missionType, rating }, { bypassOptOut: true })
}

// ── Mission Browser / Knowledge Base ──────────────────────────────

export function emitFixerSearchStarted(clusterConnected: boolean) {
  send('ksc_fixer_search', { cluster_connected: clusterConnected })
}

export function emitFixerSearchCompleted(found: number, scanned: number) {
  send('ksc_fixer_search_done', { found, scanned })
}

export function emitFixerBrowsed(path: string) {
  send('ksc_fixer_browsed', { path })
}

export function emitFixerViewed(title: string, cncfProject?: string) {
  send('ksc_fixer_viewed', { title, cncf_project: cncfProject ?? '' })
}

export function emitFixerImported(title: string, cncfProject?: string) {
  send('ksc_fixer_imported', { title, cncf_project: cncfProject ?? '' })
}

export function emitFixerImportError(title: string, errorCount: number, firstError: string) {
  send('ksc_fixer_import_error', {
    title,
    error_count: String(errorCount),
    first_error: firstError.slice(0, 100),
  })
}

export function emitFixerLinkCopied(title: string, cncfProject?: string) {
  send('ksc_fixer_link_copied', { title, cncf_project: cncfProject ?? '' })
}

export function emitFixerGitHubLink() {
  send('ksc_fixer_github_link')
}

// ── Auth ───────────────────────────────────────────────────────────

export function emitLogin(method: string) {
  send('login', { method })
}

export function emitLogout() {
  send('ksc_logout')
}

// ── Feedback ───────────────────────────────────────────────────────

// Maximum length for error detail strings to avoid oversized payloads
const ERROR_DETAIL_MAX_LEN = 100

export function emitFeedbackSubmitted(type: string) {
  send('ksc_feedback_submitted', { feedback_type: type })
}

export function emitScreenshotAttached(method: 'paste' | 'drop' | 'file_picker', count: number) {
  send('ksc_screenshot_attached', { method, count })
}

export function emitScreenshotUploadFailed(error: string, screenshotCount: number) {
  send('ksc_screenshot_upload_failed', { error: error.substring(0, ERROR_DETAIL_MAX_LEN), screenshot_count: screenshotCount })
}

export function emitScreenshotUploadSuccess(screenshotCount: number) {
  send('ksc_screenshot_upload_success', { screenshot_count: screenshotCount })
}

// ── NPS Survey ────────────────────────────────────────────────────
// NPS is voluntary, user-initiated product feedback — the user explicitly
// clicks an emoji and hits submit. These three events bypass the analytics
// opt-out gate so GA4 stays in sync with the NPS backend (Netlify Blobs),
// which already records responses regardless of opt-out. See useNPSSurvey.ts.

/** Fired when the NPS survey widget becomes visible */
export function emitNPSSurveyShown() {
  send('ksc_nps_survey_shown', undefined, { bypassOptOut: true })
}

/** Fired when user submits an NPS response */
export function emitNPSResponse(score: number, category: string, feedbackLength?: number) {
  send('ksc_nps_response', {
    nps_score: score,
    nps_category: category,
    ...(feedbackLength !== undefined && { nps_feedback_length: feedbackLength }),
  }, { bypassOptOut: true })
}

/** Fired when user dismisses the NPS widget without responding */
export function emitNPSDismissed(dismissCount: number) {
  send('ksc_nps_dismissed', { dismiss_count: dismissCount }, { bypassOptOut: true })
}

// ── Orbit (Recurring Maintenance) ─────────────────────────────────

export function emitOrbitMissionCreated(orbitType: string, cadence: string) {
  send('ksc_orbit_mission_created', { orbit_type: orbitType, cadence })
}

export function emitOrbitMissionRun(orbitType: string, result: string) {
  send('ksc_orbit_mission_run', { orbit_type: orbitType, result })
}

export function emitGroundControlDashboardCreated(cardCount: number) {
  send('ksc_ground_control_dashboard_created', { card_count: cardCount })
}

export function emitGroundControlCardRequestOpened(project: string) {
  send('ksc_ground_control_card_request', { project })
}

// ── Errors ─────────────────────────────────────────────────────────
// emitError, markErrorReported, emitChunkReloadRecoveryFailed, and
// startGlobalErrorTracking live in analytics-core.ts because they are
// tightly coupled to the send pipeline and chunk-reload recovery logic.

export function emitSessionExpired() {
  send('ksc_session_expired')
}

// ── Tour ───────────────────────────────────────────────────────────

export function emitTourStarted() {
  send('ksc_tour_started')
}

export function emitTourCompleted(stepCount: number) {
  send('ksc_tour_completed', { step_count: stepCount })
}

export function emitTourSkipped(atStep: number) {
  send('ksc_tour_skipped', { at_step: atStep })
}

// ── Marketplace ────────────────────────────────────────────────────

export function emitMarketplaceInstall(itemType: string, itemName: string) {
  send('ksc_marketplace_install', { item_type: itemType, item_name: itemName })
}

export function emitMarketplaceRemove(itemType: string) {
  send('ksc_marketplace_remove', { item_type: itemType })
}

/** Fired when a marketplace install attempt fails */
export function emitMarketplaceInstallFailed(
  itemType: string,
  itemName: string,
  error: string,
  failureStage: 'download' | 'http_error' | 'parse' | 'persist'
) {
  send('ksc_marketplace_install_failed', {
    item_type: itemType,
    item_name: itemName,
    error_detail: error.slice(0, 100),
    failure_stage: failureStage,
  })
}

// ── Theme ─────────────────────────────────────────────────────────

/** Fired when user changes theme via settings dropdown or navbar toggle */
export function emitThemeChanged(themeId: string, source: string) {
  send('ksc_theme_changed', { theme_id: themeId, source })
}

// ── Language ──────────────────────────────────────────────────────

/** Fired when user changes UI language */
export function emitLanguageChanged(langCode: string) {
  send('ksc_language_changed', { language: langCode })
}

// ── AI Settings ───────────────────────────────────────────────────

/** Fired when user changes AI mode (low/medium/high) */
export function emitAIModeChanged(mode: string) {
  send('ksc_ai_mode_changed', { mode })
}

/** Fired when user toggles AI predictions on/off */
export function emitAIPredictionsToggled(enabled: boolean) {
  send('ksc_ai_predictions_toggled', { enabled: String(enabled) })
}

/** Fired when user changes prediction confidence threshold */
export function emitConfidenceThresholdChanged(value: number) {
  send('ksc_confidence_threshold_changed', { threshold: value })
}

/** Fired when user toggles consensus (multi-provider) mode */
export function emitConsensusModeToggled(enabled: boolean) {
  send('ksc_consensus_mode_toggled', { enabled: String(enabled) })
}

// ── GitHub Token ───────────────────────────────────────────────────

export function emitGitHubTokenConfigured() {
  send('ksc_github_token_configured')
}

export function emitGitHubTokenRemoved() {
  send('ksc_github_token_removed')
}

// ── API Provider ───────────────────────────────────────────────────

export function emitApiProviderConnected(provider: string) {
  send('ksc_api_provider_connected', { provider })
}

// ── Demo Mode ──────────────────────────────────────────────────────

export function emitDemoModeToggled(enabled: boolean) {
  send('ksc_demo_mode_toggled', { enabled: String(enabled) })
  setAnalyticsUserProperties({ demo_mode: String(enabled) })
}

// ── Auth / Connection Failure Detection ─────────────────────────
// These events fire when auth-dependent paths silently degrade.
// The GA4 error monitor workflow creates issues when thresholds are hit.
//
// All four emitters route through emitError() so they respect the
// per-category throttle window (ERROR_THROTTLE_MS) and the per-page
// session budget (MAX_ERRORS_PER_PAGE_SESSION). Previously they called
// send('ksc_error', …) directly — bypassing throttling — which caused
// the agent_token_failure 4→17→60 trend (#10996) and the ksc_error
// 3.6× spike (#11006) when polling hooks retried every 30-60 s.

export function emitAgentTokenFailure(reason: string) {
  emitError('agent_token_failure', reason.slice(0, 100))
}

export function emitWsAuthMissing(url: string) {
  emitError('ws_auth_missing', url.replace(/^wss?:\/\/[^/]+/, '').slice(0, 100))
}

export function emitSseAuthFailure(url: string) {
  emitError('sse_auth_failure', url.replace(/^https?:\/\/[^/]+/, '').slice(0, 100))
}

export function emitSessionRefreshFailure(reason: string) {
  emitError('session_refresh_failure', reason.slice(0, 100))
}

// ── kc-agent Connection ─────────────────────────────────────────

export function emitAgentConnected(version: string, clusterCount: number) {
  send('ksc_agent_connected', { agent_version: version, cluster_count: clusterCount })
}

export function emitAgentDisconnected() {
  send('ksc_agent_disconnected')
}

/**
 * Emitted when cluster inventory changes. Sends only aggregate counts —
 * NEVER cluster names, IPs, servers, or any identifiable information.
 */
export function emitClusterInventory(counts: {
  total: number
  healthy: number
  unhealthy: number
  unreachable: number
  distributions: Record<string, number>
}) {
  // Flatten distribution counts into safe GA4 params (e.g., dist_eks: 2)
  const distParams: Record<string, string | number> = {}
  for (const [dist, count] of Object.entries(counts.distributions)) {
    distParams[`dist_${dist}`] = count
  }
  send('ksc_cluster_inventory', {
    cluster_count: counts.total,
    healthy_count: counts.healthy,
    unhealthy_count: counts.unhealthy,
    unreachable_count: counts.unreachable,
    ...distParams,
  })
  // Set as user property so GA4 can compute averages across users
  setAnalyticsUserProperties({ cluster_count: String(counts.total) })
}

// ── Agent Provider Detection ────────────────────────────────────

/**
 * Fired when kc-agent connects with the list of available AI providers.
 * Categorizes providers into CLI (tool-exec capable) and API (chat-only)
 * so GA4 reports show which coding agents users have installed.
 */
export function emitAgentProvidersDetected(providers: ProviderSummary[]) {
  if (!providers || providers.length === 0) return

  const cliProviders = (providers || [])
    .filter(p => (p.capabilities & CAPABILITY_TOOL_EXEC) !== 0)
    .map(p => p.name)
  const apiProviders = (providers || [])
    .filter(p => (p.capabilities & CAPABILITY_TOOL_EXEC) === 0 && (p.capabilities & CAPABILITY_CHAT) !== 0)
    .map(p => p.name)

  send('ksc_agent_providers_detected', {
    provider_count: providers.length,
    cli_providers: cliProviders.join(',') || 'none',
    api_providers: apiProviders.join(',') || 'none',
    cli_count: cliProviders.length,
    api_count: apiProviders.length,
  })
}

// ── API Key Configuration ───────────────────────────────────────

export function emitApiKeyConfigured(provider: string) {
  send('ksc_api_key_configured', { provider })
}

export function emitApiKeyRemoved(provider: string) {
  send('ksc_api_key_removed', { provider })
}

// ── Install Command Copied ──────────────────────────────────────

export function emitInstallCommandCopied(source: InstallCopySource, command: string) {
  send('ksc_install_command_copied', { source, command })
}

// ── Conversion Funnel ───────────────────────────────────────────
// Unified step-based funnel event for user journey:
//   1 = discovery     (visited site)
//   2 = login         (authenticated via OAuth or demo)
//   3 = agent         (kc-agent connected)
//   4 = clusters      (real clusters detected)
//   5 = api_key       (AI API key configured)
//   6 = github_token  (GitHub token configured)
//   7 = adopter_cta   (clicked "Join Adopters" to edit ADOPTERS.MD)

export function emitConversionStep(
  step: number,
  stepName: string,
  details?: Record<string, string>,
) {
  send('ksc_conversion_step', {
    step_number: step,
    step_name: stepName,
    ...details,
  })
}

// ── Deploy ─────────────────────────────────────────────────────────

export function emitDeployWorkload(workloadName: string, clusterGroup: string) {
  send('ksc_deploy_workload', { workload_name: workloadName, cluster_group: clusterGroup })
}

export function emitDeployTemplateApplied(templateName: string) {
  send('ksc_deploy_template_applied', { template_name: templateName })
}

// ── Compliance ─────────────────────────────────────────────────────

export function emitComplianceDrillDown(statType: string) {
  send('ksc_compliance_drill_down', { stat_type: statType })
}

export function emitComplianceFilterChanged(filterType: string) {
  send('ksc_compliance_filter_changed', { filter_type: filterType })
}

// ── Benchmarks ─────────────────────────────────────────────────────

export function emitBenchmarkViewed(benchmarkType: string) {
  send('ksc_benchmark_viewed', { benchmark_type: benchmarkType })
}

// ── Cluster Lifecycle ───────────────────────────────────────────────

/** Fired when a user successfully adds a cluster via the Add Cluster dialog */
export function emitClusterCreated(clusterName: string, authType: string) {
  send('ksc_cluster_created', { cluster_name: clusterName, auth_type: authType })
}

// ── GitHub OAuth ────────────────────────────────────────────────────

/** Fired when a user completes GitHub OAuth login (token received) */
export function emitGitHubConnected() {
  send('ksc_github_connected')
}

// ── Cluster Admin ──────────────────────────────────────────────────

export function emitClusterAction(action: string, clusterName: string) {
  send('ksc_cluster_action', { action, cluster_name: clusterName })
}

export function emitClusterStatsDrillDown(statType: string) {
  send('ksc_cluster_stats_drill_down', { stat_type: statType })
}

// ── Widget Tracking ─────────────────────────────────────────────────

/** Fired once when the PWA mini-dashboard mounts (tracks active widget users) */
export function emitWidgetLoaded(mode: 'standalone' | 'browser') {
  send('ksc_widget_loaded', { mode })
}

/** Fired when a user clicks a stat card in the widget to open the full console */
export function emitWidgetNavigation(targetPath: string) {
  send('ksc_widget_navigation', { target_path: targetPath })
}

/** Fired when the PWA install prompt is accepted */
export function emitWidgetInstalled(method: 'pwa-prompt' | 'safari-dock') {
  send('ksc_widget_installed', { method })
}

/** Fired when the Übersicht widget JSX file is downloaded from settings */
export function emitWidgetDownloaded(widgetType: 'uebersicht' | 'browser') {
  send('ksc_widget_downloaded', { widget_type: widgetType })
}

// ── Engagement Nudges ────────────────────────────────────────────────

/** Fired when contextual nudge is shown to user */
export function emitNudgeShown(nudgeType: string) {
  send('ksc_nudge_shown', { nudge_type: nudgeType })
}

/** Fired when user dismisses a contextual nudge */
export function emitNudgeDismissed(nudgeType: string) {
  send('ksc_nudge_dismissed', { nudge_type: nudgeType })
}

/** Fired when user acts on a contextual nudge (e.g. clicks "Add card") */
export function emitNudgeActioned(nudgeType: string) {
  send('ksc_nudge_actioned', { nudge_type: nudgeType })
}

/** Fired when smart card suggestions are shown after agent connects */
export function emitSmartSuggestionsShown(cardCount: number) {
  send('ksc_smart_suggestions_shown', { card_count: cardCount })
}

/** Fired when user adds a card from smart suggestions */
export function emitSmartSuggestionAccepted(cardType: string) {
  send('ksc_smart_suggestion_accepted', { card_type: cardType })
}

/** Fired when user adds all suggested cards at once */
export function emitSmartSuggestionsAddAll(cardCount: number) {
  send('ksc_smart_suggestions_add_all', { card_count: cardCount })
}

// ── Card Recommendations (dashboard panel) ──────────────────────────

/** Fired when the "Recommended Cards for your clusters" panel renders */
export function emitCardRecommendationsShown(cardCount: number, highPriorityCount: number) {
  send('ksc_card_recommendations_shown', { card_count: cardCount, high_priority_count: highPriorityCount })
}

/** Fired when user adds a card from the recommendations panel */
export function emitCardRecommendationActioned(cardType: string, priority: string) {
  send('ksc_card_recommendation_actioned', { card_type: cardType, priority })
}

// ── Mission Suggestions (dashboard panel) ───────────────────────────

/** Fired when the "Recommended Actions for your clusters" panel renders */
export function emitMissionSuggestionsShown(count: number, criticalCount: number) {
  send('ksc_mission_suggestions_shown', { suggestion_count: count, critical_count: criticalCount })
}

/** Fired when user starts an action from the mission suggestions panel */
export function emitMissionSuggestionActioned(missionType: string, priority: string, action: string) {
  send('ksc_mission_suggestion_actioned', { mission_type: missionType, priority, action })
}

// ── "Almost" Action Tracking ────────────────────────────────────────

/** Fired when add-card modal is opened (tracks intent to add) */
export function emitAddCardModalOpened() {
  send('ksc_add_card_modal_opened')
}

/** Fired when add-card modal is closed without adding any cards */
export function emitAddCardModalAbandoned() {
  send('ksc_add_card_modal_abandoned')
}

/** Fired when user scrolls the dashboard card grid (debounced) */
export function emitDashboardScrolled(depth: 'shallow' | 'deep') {
  send('ksc_dashboard_scrolled', { depth })
}

/** Fired when PWA install prompt is shown */
export function emitPwaPromptShown() {
  send('ksc_pwa_prompt_shown')
}

/** Fired when PWA install prompt is dismissed */
export function emitPwaPromptDismissed() {
  send('ksc_pwa_prompt_dismissed')
}

// ── LinkedIn Share ─────────────────────────────────────────────────

/** Fired when user clicks a LinkedIn share button */
export function emitLinkedInShare(source: string) {
  send('ksc_linkedin_share', { source })
}

// ── Session Context ──────────────────────────────────────────────

/**
 * Set install method and update channel as GA4 user properties.
 * Call this once the version-check hook has detected the install method.
 * Also fires a ksc_session_start event so we can segment sessions by
 * install method and channel in GA4 reports.
 *
 * Deduplicated per browser session — only fires once per tab lifecycle.
 */
const SESSION_START_KEY = '_ksc_session_start_sent'

export function emitSessionContext(installMethod: string, updateChannel: string) {
  // Set as persistent user properties — available on ALL future events
  setAnalyticsUserProperties({
    install_method: installMethod,
    update_channel: updateChannel,
  })

  // Fire session start event once per page load
  if (sessionStorage.getItem(SESSION_START_KEY)) return
  sessionStorage.setItem(SESSION_START_KEY, '1')

  send('ksc_session_start', {
    install_method: installMethod,
    update_channel: updateChannel,
  })
}

// ── Settings: Update ──────────────────────────────────────────────

/** Fired when user clicks "Check for Updates" in settings */
export function emitUpdateChecked() {
  send('ksc_update_checked')
}

/** Fired when user clicks "Update Now" to trigger an update */
export function emitUpdateTriggered() {
  send('ksc_update_triggered')
}

/** Fired when kc-agent reports the update completed successfully */
export function emitUpdateCompleted(durationMs: number) {
  send('ksc_update_completed', { duration_ms: durationMs })
}

/** Fired when kc-agent reports the update failed */
export function emitUpdateFailed(error: string) {
  send('ksc_update_failed', { error_detail: error.slice(0, 100) })
}

/** Fired when user clicks "Refresh to load new version" after a successful update */
export function emitUpdateRefreshed() {
  send('ksc_update_refreshed')
}

/** Fired when the stale-update timeout fires (no WebSocket progress within threshold) */
export function emitUpdateStalled() {
  send('ksc_update_stalled')
}

// ── Drill-Down ───────────────────────────────────────────────────

/** Fired when user opens a drill-down view (pod, cluster, namespace, etc.) */
export function emitDrillDownOpened(viewType: string) {
  send('ksc_drill_down_opened', { view_type: viewType })
}

/** Fired when user closes the drill-down modal */
export function emitDrillDownClosed(viewType: string, depth: number) {
  send('ksc_drill_down_closed', { view_type: viewType, depth })
}

// ── Card Refresh ─────────────────────────────────────────────────

/** Fired when user clicks the manual refresh button on a card */
export function emitCardRefreshed(cardType: string) {
  send('ksc_card_refreshed', { card_type: cardType })
}

// ── Global Filters ───────────────────────────────────────────────

/** Fired when user changes global cluster filter */
export function emitGlobalClusterFilterChanged(selectedCount: number, totalCount: number) {
  send('ksc_global_cluster_filter_changed', { selected_count: selectedCount, total_count: totalCount })
}

/** Fired when user changes global severity filter */
export function emitGlobalSeverityFilterChanged(selectedCount: number) {
  send('ksc_global_severity_filter_changed', { selected_count: selectedCount })
}

/** Fired when user changes global status filter */
export function emitGlobalStatusFilterChanged(selectedCount: number) {
  send('ksc_global_status_filter_changed', { selected_count: selectedCount })
}

// ── Prediction Feedback ──────────────────────────────────────────

/** Fired when user gives thumbs up/down on a prediction */
export function emitPredictionFeedbackSubmitted(feedback: string, predictionType: string, provider?: string) {
  send('ksc_prediction_feedback', { feedback, prediction_type: predictionType, provider: provider ?? 'unknown' })
}

// ── Snooze ───────────────────────────────────────────────────────

/** Fired when user snoozes a card, alert, mission, or recommendation */
export function emitSnoozed(targetType: string, duration?: string) {
  send('ksc_snoozed', { target_type: targetType, duration: duration ?? 'default' })
}

/** Fired when user unsnoozes an item */
export function emitUnsnoozed(targetType: string) {
  send('ksc_unsnoozed', { target_type: targetType })
}

// ── Dashboard CRUD ───────────────────────────────────────────────

/** Fired when user creates a new dashboard */
export function emitDashboardCreated(name: string) {
  send('ksc_dashboard_created', { dashboard_name: name })
}

/** Fired when user deletes a dashboard */
export function emitDashboardDeleted() {
  send('ksc_dashboard_deleted')
}

/** Fired when user renames a dashboard */
export function emitDashboardRenamed() {
  send('ksc_dashboard_renamed')
}

/** Fired when user imports a dashboard */
export function emitDashboardImported() {
  send('ksc_dashboard_imported')
}

/** Fired when user exports a dashboard */
export function emitDashboardExported() {
  send('ksc_dashboard_exported')
}

// ── Data Export ──────────────────────────────────────────────────

/** Fired when user downloads or copies data from a drill-down view */
export function emitDataExported(exportType: string, resourceType?: string) {
  send('ksc_data_exported', { export_type: exportType, resource_type: resourceType ?? '' })
}

// ── User Management ──────────────────────────────────────────────

/** Fired when admin changes a user's role */
export function emitUserRoleChanged(newRole: string) {
  send('ksc_user_role_changed', { new_role: newRole })
}

/** Fired when admin removes a user */
export function emitUserRemoved() {
  send('ksc_user_removed')
}

// ── Marketplace Browsing ─────────────────────────────────────────

/** Fired when user views a marketplace item detail */
export function emitMarketplaceItemViewed(itemType: string, itemName: string) {
  send('ksc_marketplace_item_viewed', { item_type: itemType, item_name: itemName })
}

// ── Insights ─────────────────────────────────────────────────────

/** Fired when user views an insight card detail */
export function emitInsightViewed(insightCategory: string) {
  send('ksc_insight_viewed', { insight_category: insightCategory })
}

// ── Arcade Games ────────────────────────────────────────────────

/** Fired when user starts or restarts an arcade game */
export function emitGameStarted(gameName: string) {
  send('ksc_game_started', { game_name: gameName })
}

/** Fired when a game ends (win, loss, or completion) */
export function emitGameEnded(gameName: string, outcome: string, score: number) {
  send('ksc_game_ended', { game_name: gameName, outcome, score })
}

// ── Sidebar Navigation ──────────────────────────────────────────

/** Fired when user clicks a sidebar navigation item */
export function emitSidebarNavigated(destination: string) {
  send('ksc_sidebar_navigated', { destination })
}

// ── Local Cluster ─────────────────────────────────────────────────

/** Fired when user creates a local cluster (kind, k3d, minikube) */
export function emitLocalClusterCreated(tool: string) {
  send('ksc_local_cluster_created', { tool })
}

// ── Developer Session ──────────────────────────────────────────────

/** Storage key to ensure we only fire developer session once per client */
const DEV_SESSION_KEY = 'ksc-dev-session-sent'

/**
 * Fired once per client when the user is running on localhost with the
 * Go backend (cloned the repo + startup-oauth.sh). This distinguishes
 * developers / contributors from regular console.kubestellar.io visitors.
 */
export function emitDeveloperSession() {
  if (localStorage.getItem(DEV_SESSION_KEY)) return
  const dep = getDeploymentType()
  if (dep !== 'localhost') return
  // Don't fire in forced demo mode (e.g. VITE_DEMO_MODE=true on localhost)
  if (isDemoMode() && !localStorage.getItem('ksc-token')) return
  localStorage.setItem(DEV_SESSION_KEY, '1')
  send('ksc_developer_session', { deployment_type: dep })
}

// ── Card Modal Browsing ─────────────────────────────────────────────

/** Fired when user expands a category in the add-card modal */
export function emitCardCategoryBrowsed(category: string) {
  send('ksc_card_category_browsed', { category })
}

/** Fired when the "Recommended for you" section renders in add-card modal */
export function emitRecommendedCardShown(cardTypes: string[]) {
  send('ksc_recommended_cards_shown', {
    card_count: cardTypes.length,
    card_types: cardTypes.join(','),
  })
}

// ── Dashboard Duration ──────────────────────────────────────────────

/** Fired when user navigates away from a dashboard, recording time spent */
export function emitDashboardViewed(dashboardId: string, durationMs: number) {
  send('ksc_dashboard_viewed', { dashboard_id: dashboardId, duration_ms: durationMs })
}

// ── Feature Hints ───────────────────────────────────────────────────

/** Fired when a contextual feature hint tooltip appears */
export function emitFeatureHintShown(hintType: string) {
  send('ksc_feature_hint_shown', { hint_type: hintType })
}

/** Fired when user dismisses a feature hint tooltip */
export function emitFeatureHintDismissed(hintType: string) {
  send('ksc_feature_hint_dismissed', { hint_type: hintType })
}

/** Fired when user clicks the CTA on a feature hint tooltip */
export function emitFeatureHintActioned(hintType: string) {
  send('ksc_feature_hint_actioned', { hint_type: hintType })
}

// ── Getting Started Banner ──────────────────────────────────────────

/** Fired when the Getting Started banner renders on main dashboard */
export function emitGettingStartedShown() {
  send('ksc_getting_started_shown')
}

/** Fired when user clicks one of the Getting Started quick-action buttons */
export function emitGettingStartedActioned(action: string) {
  send('ksc_getting_started_actioned', { action })
}

// ── Post-Connect Activation ──────────────────────────────────────────

/** Fired when the post-agent-connect activation banner renders */
export function emitPostConnectShown() {
  send('ksc_post_connect_shown')
}

/** Fired when user clicks a CTA on the post-connect activation banner */
export function emitPostConnectActioned(action: string) {
  send('ksc_post_connect_actioned', { action })
}

// ── Demo-to-Local CTA ──────────────────────────────────────────────

/** Fired when the "Try it locally" CTA renders for demo-site visitors */
export function emitDemoToLocalShown() {
  send('ksc_demo_to_local_shown')
}

/** Fired when a demo-site visitor clicks the install CTA */
export function emitDemoToLocalActioned(action: string) {
  send('ksc_demo_to_local_actioned', { action })
}

// ── Adopter Nudge ─────────────────────────────────────────────────

/** Fired when the adopter nudge banner renders */
export function emitAdopterNudgeShown() {
  send('ksc_adopter_nudge_shown')
}

/** Fired when user clicks the adopter nudge CTA */
export function emitAdopterNudgeActioned(action: string) {
  send('ksc_adopter_nudge_actioned', { action })
}

// ── UTM Tracking ───────────────────────────────────────────────────
// captureUtmParams and getUtmParams live in analytics-session.ts because
// UTM state is part of session identity and is referenced in sendViaProxy.

// ── Dashboard Excellence: Modal & Action Events ─────────────────────

/** Fired when any detail modal is opened */
export function emitModalOpened(modalType: string, sourceCard: string) {
  send('ksc_modal_opened', { modal_type: modalType, source_card: sourceCard })
}

/** Fired when a tab is viewed within a modal */
export function emitModalTabViewed(modalType: string, tabName: string) {
  send('ksc_modal_tab_viewed', { modal_type: modalType, tab_name: tabName })
}

/** Fired when a modal is closed, with duration */
export function emitModalClosed(modalType: string, durationMs: number) {
  send('ksc_modal_closed', { modal_type: modalType, duration_ms: durationMs })
}

/** Fired when an insight is acknowledged */
export function emitInsightAcknowledged(insightCategory: string, insightSeverity: string) {
  send('ksc_insight_acknowledged', { insight_category: insightCategory, insight_severity: insightSeverity })
}

/** Fired when an insight is dismissed */
export function emitInsightDismissed(insightCategory: string, insightSeverity: string) {
  send('ksc_insight_dismissed', { insight_category: insightCategory, insight_severity: insightSeverity })
}

/** Fired when an inline action button is clicked */
export function emitActionClicked(actionType: string, sourceCard: string, dashboard: string) {
  send('ksc_action_clicked', { action_type: actionType, source_card: sourceCard, dashboard })
}

/** Fired when the AI suggestion/remediation tab is viewed */
export function emitAISuggestionViewed(insightCategory: string, hasAIEnrichment: boolean) {
  send('ksc_ai_suggestion_viewed', { insight_category: insightCategory, has_ai_enrichment: hasAIEnrichment })
}

// ── Welcome / Conference Landing Page ────────────────────────────────

/** Fired once when /welcome is rendered */
export function emitWelcomeViewed(ref: string) {
  send('ksc_welcome_viewed', { ref })
}

/** Fired on CTA button clicks (hero_explore_demo, hero_github, scenario_*, footer_*) */
export function emitWelcomeActioned(action: string, ref: string) {
  send('ksc_welcome_actioned', { action, ref })
}

// ── From Lens Landing Page ──────────────────────────────────────────

/** Fired when a user views the /from-lens landing page */
export function emitFromLensViewed() {
  send('ksc_from_lens_viewed')
}

/** Fired when a user interacts with a CTA on the /from-lens page */
export function emitFromLensActioned(action: string) {
  send('ksc_from_lens_actioned', { action })
}

/** Fired when a user switches deployment tabs (localhost / cluster-portforward / cluster-ingress) */
export function emitFromLensTabSwitch(tab: string) {
  send('ksc_from_lens_tab_switch', { tab })
}

/** Fired when a user copies an install command from the /from-lens page */
export function emitFromLensCommandCopy(tab: string, step: number, command: string) {
  send('ksc_from_lens_command_copy', { tab, step, command })
}

// ── /from-headlamp competitive landing page ─────────────────────────

/** Fired once when /from-headlamp is rendered */
export function emitFromHeadlampViewed() {
  send('ksc_from_headlamp_viewed')
}

/** Fired on CTA button clicks (hero_try_demo, hero_view_github, footer_try_demo, footer_view_github) */
export function emitFromHeadlampActioned(action: string) {
  send('ksc_from_headlamp_actioned', { action })
}

/** Fired when switching deployment tabs (localhost, cluster-portforward, cluster-ingress) */
export function emitFromHeadlampTabSwitch(tab: string) {
  send('ksc_from_headlamp_tab_switch', { tab })
}

/** Fired when a user copies an install command from the /from-headlamp page */
export function emitFromHeadlampCommandCopy(tab: string, step: number, command: string) {
  send('ksc_from_headlamp_command_copy', { tab, step, command })
}

// ── /white-label landing page ──────────────────────────────────────

/** Fired once when /white-label is rendered */
export function emitWhiteLabelViewed() {
  send('ksc_white_label_viewed')
}

/** Fired on CTA button clicks (hero_try_demo, hero_view_github, footer_try_demo, footer_view_github) */
export function emitWhiteLabelActioned(action: string) {
  send('ksc_white_label_actioned', { action })
}

/** Fired when switching deployment tabs (binary, helm, docker) */
export function emitWhiteLabelTabSwitch(tab: string) {
  send('ksc_white_label_tab_switch', { tab })
}

/** Fired when a user copies a command from the /white-label page */
export function emitWhiteLabelCommandCopy(tab: string, step: number, command: string) {
  send('ksc_white_label_command_copy', { tab, step, command })
}

// ── Rotating tips ──────────────────────────────────────────────────

/** Fired when a rotating "Did you know?" tip is displayed on a page */
export function emitTipShown(page: string, tip: string) {
  send('ksc_tip_shown', { page, tip })
}

/** Fired when user's visit streak increments (consecutive days visiting) */
export function emitStreakDay(streakCount: number) {
  send('ksc_streak_day', { streak_count: streakCount })
}

/** Fired when a user clicks a blog post link; `title` is the clicked post title */
export function emitBlogPostClicked(title: string) {
  send('ksc_blog_post_clicked', { blog_title: title })
}

/** Fired when the What's New modal opens (replaces the old update dropdown) */
export function emitWhatsNewModalOpened(tag: string) {
  send('ksc_whats_new_modal_opened', { release_tag: tag })
}

/** Fired when user clicks "Update now" inside the What's New modal */
export function emitWhatsNewUpdateClicked(tag: string, installMethod: string) {
  send('ksc_whats_new_update_clicked', { release_tag: tag, install_method: installMethod })
}

/** Fired when user clicks "Remind me later" inside the What's New modal */
export function emitWhatsNewRemindLater(tag: string, duration: string) {
  send('ksc_whats_new_remind_later', { release_tag: tag, snooze_duration: duration })
}

// ── ACMM Dashboard ──────────────────────────────────────────────────

/** Fired when a user scans a repo on the ACMM dashboard. Tracks which
 *  repos people are scanning and what level they land at. */
export function emitACMMScanned(repo: string, level: number, detected: number, total: number) {
  send('ksc_acmm_scanned', { repo, acmm_level: level, detected, total })
}

/** Fired when a user launches an AI mission from the ACMM dashboard to
 *  add a missing criterion. Connects the scan → mission → level-up funnel. */
export function emitACMMMissionLaunched(
  repo: string,
  criterionId: string,
  criterionSource: string,
  targetLevel: number,
) {
  send('ksc_acmm_mission_launched', {
    repo,
    criterion_id: criterionId,
    criterion_source: criterionSource,
    target_level: targetLevel,
  })
}

/** Fired when a user launches a "complete this level" mission from the
 *  ACMM Feedback Loop Inventory sticky footer. */
export function emitACMMLevelMissionLaunched(
  repo: string,
  targetLevel: number,
  criteriaCount: number,
) {
  send('ksc_acmm_level_mission_launched', {
    repo,
    target_level: targetLevel,
    criteria_count: criteriaCount,
  })
}
