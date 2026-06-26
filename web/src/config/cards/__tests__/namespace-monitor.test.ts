// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { namespaceMonitorConfig } from '../namespace-monitor'
import * as moduleExports from '../namespace-monitor'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('namespace-monitor', moduleExports)

describe('namespace-monitor configuration coverage', () => {
  it('validates all required fields', () => {
    expect(namespaceMonitorConfig.type).toBe('namespace_monitor')
    expect(namespaceMonitorConfig.title).toBe('Namespace Monitor')
    expect(namespaceMonitorConfig.category).toBe('namespaces')
    expect(namespaceMonitorConfig.description).toBe('Real-time namespace health monitoring')
  })

  it('validates appearance fields', () => {
    expect(namespaceMonitorConfig.icon).toBe('Monitor')
    expect(namespaceMonitorConfig.iconColor).toBe('text-green-400')
    expect(namespaceMonitorConfig.defaultWidth).toBe(8)
    expect(namespaceMonitorConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(namespaceMonitorConfig.dataSource.type).toBe('hook')
    expect(namespaceMonitorConfig.dataSource.hook).toBe('useNamespaceMonitor')
  })

  it('validates content configuration', () => {
    expect(namespaceMonitorConfig.content.type).toBe('stats-grid')
    expect(namespaceMonitorConfig.content.stats).toBeDefined()
    expect(namespaceMonitorConfig.content.stats).toHaveLength(4)
    expect(namespaceMonitorConfig.content.stats?.[0].field).toBe('healthy')
    expect(namespaceMonitorConfig.content.stats?.[1].field).toBe('warning')
    expect(namespaceMonitorConfig.content.stats?.[2].field).toBe('critical')
    expect(namespaceMonitorConfig.content.stats?.[3].field).toBe('unknown')
  })

  it('validates empty state configuration', () => {
    expect(namespaceMonitorConfig.emptyState?.icon).toBe('Monitor')
    expect(namespaceMonitorConfig.emptyState?.title).toBe('No Data')
    expect(namespaceMonitorConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(namespaceMonitorConfig.loadingState?.type).toBe('stats')
    expect(namespaceMonitorConfig.loadingState?.count).toBe(4)
  })

  it('validates metadata fields', () => {
    expect(namespaceMonitorConfig.isDemoData).toBe(false)
    expect(namespaceMonitorConfig.isLive).toBe(true)
  })
})
