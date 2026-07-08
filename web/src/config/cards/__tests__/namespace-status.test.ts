// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { namespaceStatusConfig } from '../namespace-status'
import * as moduleExports from '../namespace-status'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('namespace-status', moduleExports)

describe('namespace-status configuration coverage', () => {
  it('validates all required fields', () => {
    expect(namespaceStatusConfig.type).toBe('namespace_status')
    expect(namespaceStatusConfig.title).toBe('Namespaces')
    expect(namespaceStatusConfig.category).toBe('namespaces')
    expect(namespaceStatusConfig.description).toBe('Kubernetes Namespaces across clusters')
  })

  it('validates appearance fields', () => {
    expect(namespaceStatusConfig.icon).toBe('FolderOpen')
    expect(namespaceStatusConfig.iconColor).toBe('text-blue-400')
    expect(namespaceStatusConfig.defaultWidth).toBe(6)
    expect(namespaceStatusConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(namespaceStatusConfig.dataSource.type).toBe('hook')
    expect(namespaceStatusConfig.dataSource.hook).toBe('useNamespaces')
  })

  it('validates filters configuration', () => {
    expect(namespaceStatusConfig.filters).toBeDefined()
    expect(namespaceStatusConfig.filters).toHaveLength(2)
    expect(namespaceStatusConfig.filters?.[0].field).toBe('search')
    expect(namespaceStatusConfig.filters?.[0].type).toBe('text')
    expect(namespaceStatusConfig.filters?.[1].field).toBe('cluster')
    expect(namespaceStatusConfig.filters?.[1].type).toBe('cluster-select')
  })

  it('validates content configuration', () => {
    expect(namespaceStatusConfig.content.type).toBe('list')
    expect(namespaceStatusConfig.content.pageSize).toBe(10)
    expect(namespaceStatusConfig.content.columns).toBeDefined()
    expect(namespaceStatusConfig.content.columns).toHaveLength(4)
    expect(namespaceStatusConfig.content.columns?.[1].primary).toBe(true)
  })

  it('validates empty state configuration', () => {
    expect(namespaceStatusConfig.emptyState?.icon).toBe('FolderOpen')
    expect(namespaceStatusConfig.emptyState?.title).toBe('No Namespaces')
    expect(namespaceStatusConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(namespaceStatusConfig.loadingState?.type).toBe('list')
    expect(namespaceStatusConfig.loadingState?.rows).toBe(5)
    expect(namespaceStatusConfig.loadingState?.showSearch).toBe(true)
  })

  it('validates metadata fields', () => {
    expect(namespaceStatusConfig.isDemoData).toBe(true)
    expect(namespaceStatusConfig.isLive).toBe(true)
  })
})
