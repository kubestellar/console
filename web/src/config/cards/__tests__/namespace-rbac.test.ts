// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { namespaceRbacConfig } from '../namespace-rbac'
import * as moduleExports from '../namespace-rbac'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('namespace-rbac', moduleExports)

describe('namespace-rbac configuration coverage', () => {
  it('validates all required fields', () => {
    expect(namespaceRbacConfig.type).toBe('namespace_rbac')
    expect(namespaceRbacConfig.title).toBe('Namespace RBAC')
    expect(namespaceRbacConfig.category).toBe('security')
    expect(namespaceRbacConfig.description).toBe('RBAC permissions in namespace')
  })

  it('validates appearance fields', () => {
    expect(namespaceRbacConfig.icon).toBe('Shield')
    expect(namespaceRbacConfig.iconColor).toBe('text-red-400')
    expect(namespaceRbacConfig.defaultWidth).toBe(6)
    expect(namespaceRbacConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(namespaceRbacConfig.dataSource.type).toBe('hook')
    expect(namespaceRbacConfig.dataSource.hook).toBe('useNamespaceRBAC')
  })

  it('validates content configuration', () => {
    expect(namespaceRbacConfig.content.type).toBe('list')
    expect(namespaceRbacConfig.content.pageSize).toBe(10)
    expect(namespaceRbacConfig.content.columns).toBeDefined()
    expect(namespaceRbacConfig.content.columns).toHaveLength(4)
    expect(namespaceRbacConfig.content.columns?.[0].field).toBe('subject')
    expect(namespaceRbacConfig.content.columns?.[0].primary).toBe(true)
  })

  it('validates empty state configuration', () => {
    expect(namespaceRbacConfig.emptyState?.icon).toBe('Shield')
    expect(namespaceRbacConfig.emptyState?.title).toBe('No RBAC')
    expect(namespaceRbacConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(namespaceRbacConfig.loadingState?.type).toBe('list')
    expect(namespaceRbacConfig.loadingState?.rows).toBe(5)
  })

  it('validates metadata fields', () => {
    expect(namespaceRbacConfig.isDemoData).toBe(false)
    expect(namespaceRbacConfig.isLive).toBe(true)
  })
})
