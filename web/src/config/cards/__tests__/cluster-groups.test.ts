// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clusterGroupsConfig } from '../cluster-groups'
import * as moduleExports from '../cluster-groups'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('cluster-groups', moduleExports)

describe('cluster-groups configuration coverage', () => {
  it('validates all required fields', () => {
    expect(clusterGroupsConfig.type).toBe('cluster_groups')
    expect(clusterGroupsConfig.title).toBe('Cluster Groups')
    expect(clusterGroupsConfig.category).toBe('cluster-health')
    expect(clusterGroupsConfig.description).toBe('Manage cluster groupings')
  })

  it('validates projects configuration', () => {
    expect(clusterGroupsConfig.projects).toBeDefined()
    expect(clusterGroupsConfig.projects).toEqual(['kubestellar'])
  })

  it('validates appearance fields', () => {
    expect(clusterGroupsConfig.icon).toBe('Layers')
    expect(clusterGroupsConfig.iconColor).toBe('text-blue-400')
    expect(clusterGroupsConfig.defaultWidth).toBe(4)
    expect(clusterGroupsConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(clusterGroupsConfig.dataSource.type).toBe('hook')
    expect(clusterGroupsConfig.dataSource.hook).toBe('useClusterGroups')
  })

  it('validates content configuration', () => {
    expect(clusterGroupsConfig.content.type).toBe('list')
    expect(clusterGroupsConfig.content.pageSize).toBe(8)
    expect(clusterGroupsConfig.content.columns).toBeDefined()
    expect(clusterGroupsConfig.content.columns).toHaveLength(3)
    expect(clusterGroupsConfig.content.columns?.[0].field).toBe('name')
    expect(clusterGroupsConfig.content.columns?.[0].primary).toBe(true)
  })

  it('validates empty state configuration', () => {
    expect(clusterGroupsConfig.emptyState?.icon).toBe('Layers')
    expect(clusterGroupsConfig.emptyState?.title).toBe('No Groups')
    expect(clusterGroupsConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(clusterGroupsConfig.loadingState?.type).toBe('list')
    expect(clusterGroupsConfig.loadingState?.rows).toBe(4)
  })

  it('validates metadata fields', () => {
    expect(clusterGroupsConfig.isDemoData).toBe(false)
    expect(clusterGroupsConfig.isLive).toBe(true)
  })
})
