import { send } from '../analytics-core'

// ── Drill-Down ──────────────────────────────────────────────────────

export function emitDrillDownOpened(viewType: string) {
  send('ksc_drill_down_opened', { view_type: viewType })
}

export function emitDrillDownClosed(viewType: string, depth: number) {
  send('ksc_drill_down_closed', { view_type: viewType, depth })
}

// --- Global Filters ---

export function emitGlobalClusterFilterChanged(selectedCount: number, totalCount: number) {
  send('ksc_global_cluster_filter_changed', { selected_count: selectedCount, total_count: totalCount })
}

export function emitGlobalSeverityFilterChanged(selectedCount: number) {
  send('ksc_global_severity_filter_changed', { selected_count: selectedCount })
}

export function emitGlobalStatusFilterChanged(selectedCount: number) {
  send('ksc_global_status_filter_changed', { selected_count: selectedCount })
}

// ── Dashboard CRUD ──────────────────────────────────────────

export function emitDashboardCreated(name: string) {
  send('ksc_dashboard_created', { dashboard_name: name })
}

export function emitDashboardDeleted() {
  send('ksc_dashboard_deleted')
}

export function emitDashboardRenamed() {
  send('ksc_dashboard_renamed')
}

export function emitDashboardImported() {
  send('ksc_dashboard_imported')
}

export function emitDashboardExported() {
  send('ksc_dashboard_exported')
}

export function emitDashboardViewed(dashboardId: string, durationMs: number) {
  send('ksc_dashboard_viewed', { dashboard_id: dashboardId, duration_ms: durationMs })
}

// ── Dashboard Utilities ─────────────

export function emitDataExported(exportType: string, resourceType?: string) {
  send('ksc_data_exported', { export_type: exportType, resource_type: resourceType ?? '' })
}

export function emitSnoozed(targetType: string, duration?: string) {
  send('ksc_snoozed', { target_type: targetType, duration: duration ?? 'default' })
}

export function emitUnsnoozed(targetType: string) {
  send('ksc_unsnoozed', { target_type: targetType })
}
