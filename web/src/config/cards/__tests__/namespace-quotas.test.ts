// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { namespaceQuotasConfig } from '../namespace-quotas'
import * as moduleExports from '../namespace-quotas'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('namespace-quotas', moduleExports)

describe('namespace-quotas configuration coverage', () => {
  it('validates all required fields', () => {
    expect(namespaceQuotasConfig.type).toBe('namespace_quotas')
    expect(namespaceQuotasConfig.title).toBe('Namespace Quotas')
    expect(namespaceQuotasConfig.category).toBe('namespaces')
    expect(namespaceQuotasConfig.description).toBe('Resource quota usage by namespace')
  })

  it('validates appearance fields', () => {
    expect(namespaceQuotasConfig.icon).toBe('Gauge')
    expect(namespaceQuotasConfig.iconColor).toBe('text-yellow-400')
    expect(namespaceQuotasConfig.defaultWidth).toBe(5)
    expect(namespaceQuotasConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(namespaceQuotasConfig.dataSource.type).toBe('hook')
    expect(namespaceQuotasConfig.dataSource.hook).toBe('useNamespaceQuotas')
  })

  it('validates content configuration', () => {
    expect(namespaceQuotasConfig.content.type).toBe('list')
    expect(namespaceQuotasConfig.content.pageSize).toBe(8)
    expect(namespaceQuotasConfig.content.columns).toBeDefined()
    expect(namespaceQuotasConfig.content.columns).toHaveLength(4)
    expect(namespaceQuotasConfig.content.columns?.[0].field).toBe('resource')
    expect(namespaceQuotasConfig.content.columns?.[0].primary).toBe(true)
    expect(namespaceQuotasConfig.content.columns?.[3].render).toBe('progress-bar')
  })

  it('validates empty state configuration', () => {
    expect(namespaceQuotasConfig.emptyState?.icon).toBe('Gauge')
    expect(namespaceQuotasConfig.emptyState?.title).toBe('No Quotas')
    expect(namespaceQuotasConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(namespaceQuotasConfig.loadingState?.type).toBe('list')
    expect(namespaceQuotasConfig.loadingState?.rows).toBe(5)
  })

  it('validates metadata fields', () => {
    expect(namespaceQuotasConfig.isDemoData).toBe(false)
    expect(namespaceQuotasConfig.isLive).toBe(true)
  })
})
