import { describe, expect, it, mockSend, emitDashboardCreated, emitDashboardDeleted, emitDashboardExported, emitDashboardImported, emitDashboardRenamed, emitDashboardViewed, emitDataExported, emitDrillDownClosed, emitDrillDownOpened, emitGlobalClusterFilterChanged, emitGlobalSeverityFilterChanged, emitGlobalStatusFilterChanged, emitSnoozed, emitUnsnoozed } from './analytics-events.shared'

describe('analytics-events/dashboard', () => {
  it('emitDrillDownOpened sends view_type', () => {
    emitDrillDownOpened('pod-detail')
    expect(mockSend).toHaveBeenCalledWith('ksc_drill_down_opened', { view_type: 'pod-detail' })
  })

  it('emitDrillDownClosed sends view_type and depth', () => {
    emitDrillDownClosed('pod-detail', 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_drill_down_closed', { view_type: 'pod-detail', depth: 2 })
  })

  it('emitGlobalClusterFilterChanged sends selected and total counts', () => {
    emitGlobalClusterFilterChanged(3, 10)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_cluster_filter_changed', {
      selected_count: 3,
      total_count: 10,
    })
  })

  it('emitGlobalSeverityFilterChanged sends selected_count', () => {
    emitGlobalSeverityFilterChanged(2)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_severity_filter_changed', { selected_count: 2 })
  })

  it('emitGlobalStatusFilterChanged sends selected_count', () => {
    emitGlobalStatusFilterChanged(1)
    expect(mockSend).toHaveBeenCalledWith('ksc_global_status_filter_changed', { selected_count: 1 })
  })

  it('emitDashboardCreated sends dashboard_name', () => {
    emitDashboardCreated('My Dashboard')
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_created', { dashboard_name: 'My Dashboard' })
  })

  it('emitDashboardDeleted sends ksc_dashboard_deleted', () => {
    emitDashboardDeleted()
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_deleted')
  })

  it('emitDashboardRenamed sends ksc_dashboard_renamed', () => {
    emitDashboardRenamed()
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_renamed')
  })

  it('emitDashboardImported sends ksc_dashboard_imported', () => {
    emitDashboardImported()
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_imported')
  })

  it('emitDashboardExported sends ksc_dashboard_exported', () => {
    emitDashboardExported()
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_exported')
  })

  it('emitDashboardViewed sends dashboard_id and duration_ms', () => {
    emitDashboardViewed('dash-1', 5000)
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_viewed', {
      dashboard_id: 'dash-1',
      duration_ms: 5000,
    })
  })

  it('emitDataExported sends export_type and resource_type', () => {
    emitDataExported('csv', 'pods')
    expect(mockSend).toHaveBeenCalledWith('ksc_data_exported', {
      export_type: 'csv',
      resource_type: 'pods',
    })
  })

  it('emitDataExported uses empty string when resource_type omitted', () => {
    emitDataExported('json')
    expect(mockSend).toHaveBeenCalledWith('ksc_data_exported', {
      export_type: 'json',
      resource_type: '',
    })
  })

  it('emitSnoozed sends target_type and duration', () => {
    emitSnoozed('alert', '1h')
    expect(mockSend).toHaveBeenCalledWith('ksc_snoozed', { target_type: 'alert', duration: '1h' })
  })

  it('emitSnoozed uses "default" when duration omitted', () => {
    emitSnoozed('card')
    expect(mockSend).toHaveBeenCalledWith('ksc_snoozed', { target_type: 'card', duration: 'default' })
  })

  it('emitUnsnoozed sends target_type', () => {
    emitUnsnoozed('alert')
    expect(mockSend).toHaveBeenCalledWith('ksc_unsnoozed', { target_type: 'alert' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// admin.ts
// ─────────────────────────────────────────────────────────────────────────────
