// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { namespaceOverviewConfig } from '../namespace-overview'
import * as moduleExports from '../namespace-overview'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('namespace-overview', moduleExports)

describe('namespace-overview configuration coverage', () => {
  it('validates all required fields', () => {
    expect(namespaceOverviewConfig.type).toBe('namespace_overview')
    expect(namespaceOverviewConfig.title).toBe('Namespace Overview')
    expect(namespaceOverviewConfig.category).toBe('namespaces')
    expect(namespaceOverviewConfig.description).toBe('Namespace resource summary')
  })

  it('validates appearance fields', () => {
    expect(namespaceOverviewConfig.icon).toBe('FolderOpen')
    expect(namespaceOverviewConfig.iconColor).toBe('text-blue-400')
    expect(namespaceOverviewConfig.defaultWidth).toBe(6)
    expect(namespaceOverviewConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(namespaceOverviewConfig.dataSource.type).toBe('hook')
    expect(namespaceOverviewConfig.dataSource.hook).toBe('useNamespaceOverview')
  })

  it('validates content configuration', () => {
    expect(namespaceOverviewConfig.content.type).toBe('stats-grid')
    expect(namespaceOverviewConfig.content.stats).toBeDefined()
    expect(namespaceOverviewConfig.content.stats).toHaveLength(4)
    expect(namespaceOverviewConfig.content.stats?.[0].field).toBe('pods')
    expect(namespaceOverviewConfig.content.stats?.[1].field).toBe('deployments')
    expect(namespaceOverviewConfig.content.stats?.[2].field).toBe('services')
    expect(namespaceOverviewConfig.content.stats?.[3].field).toBe('configmaps')
  })

  it('validates empty state configuration', () => {
    expect(namespaceOverviewConfig.emptyState?.icon).toBe('FolderOpen')
    expect(namespaceOverviewConfig.emptyState?.title).toBe('Select Namespace')
    expect(namespaceOverviewConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(namespaceOverviewConfig.loadingState?.type).toBe('stats')
    expect(namespaceOverviewConfig.loadingState?.count).toBe(4)
  })

  it('validates metadata fields', () => {
    expect(namespaceOverviewConfig.isDemoData).toBe(false)
    expect(namespaceOverviewConfig.isLive).toBe(true)
  })
})
