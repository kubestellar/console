import { send } from '../analytics-core'

// Max characters to send in the error_detail dimension. GA4 caps event
// parameter values at 100 chars, so anything longer is truncated to stay
// within the limit while still surfacing the leading diagnostic text.
const MISSION_ERROR_DETAIL_MAX_LEN = 100

// ── AI Missions ────────────────────────────────────────────────────

export function emitMissionStarted(missionType: string, agentProvider: string) {
  send('ksc_mission_started', { mission_type: missionType, agent_provider: agentProvider })
}

export function emitMissionCompleted(missionType: string, durationSec: number) {
  send('ksc_mission_completed', { mission_type: missionType, duration_sec: durationSec })
}

export function emitMissionError(
  missionType: string,
  errorCode: string,
  errorDetail?: string,
) {
  const trimmedDetail = errorDetail?.trim()
  send('ksc_mission_error', {
    mission_type: missionType,
    error_code: errorCode,
    error_detail: trimmedDetail
      ? trimmedDetail.slice(0, MISSION_ERROR_DETAIL_MAX_LEN)
      : '',
  })
}

export function emitMissionToolMissing(
  missionType: string,
  missingTool: string,
  errorDetail?: string,
) {
  const trimmedDetail = errorDetail?.trim()
  send('ksc_mission_tool_missing', {
    mission_type: missionType,
    missing_tool: missingTool,
    error_detail: trimmedDetail
      ? trimmedDetail.slice(0, MISSION_ERROR_DETAIL_MAX_LEN)
      : '',
  })
}

export function emitMissionRated(missionType: string, rating: string) {
  send('ksc_mission_rated', { mission_type: missionType, rating }, { bypassOptOut: true })
}

// ── Mission Browser / Knowledge Base ───────────────────────────

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

// ── Orbit (Recurring Maintenance) 

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

// ── Deploy ──────────────────────────────────────────────────────────

export function emitDeployWorkload(workloadName: string, clusterGroup: string) {
  send('ksc_deploy_workload', { workload_name: workloadName, cluster_group: clusterGroup })
}

export function emitDeployTemplateApplied(templateName: string) {
  send('ksc_deploy_template_applied', { template_name: templateName })
}

// ── Compliance ──────────────────────────────────────────────────

export function emitComplianceDrillDown(statType: string) {
  send('ksc_compliance_drill_down', { stat_type: statType })
}

export function emitComplianceFilterChanged(filterType: string) {
  send('ksc_compliance_filter_changed', { filter_type: filterType })
}

// ── Benchmarks ──────────────────────────────────────────────────────

export function emitBenchmarkViewed(benchmarkType: string) {
  send('ksc_benchmark_viewed', { benchmark_type: benchmarkType })
}

// ── Mission Suggestions ─────────────────────────────────────────────

export function emitMissionSuggestionsShown(count: number, criticalCount: number) {
  send('ksc_mission_suggestions_shown', { suggestion_count: count, critical_count: criticalCount })
}

export function emitMissionSuggestionActioned(missionType: string, priority: string, action: string) {
  send('ksc_mission_suggestion_actioned', { mission_type: missionType, priority, action })
}

// ── Dashboard ACMM ───────────────────────────────────

export function emitACMMScanned(repo: string, level: number, detected: number, total: number) {
  send('ksc_acmm_scanned', { repo, acmm_level: level, detected, total })
}

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
