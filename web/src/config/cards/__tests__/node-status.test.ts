// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { nodeStatusConfig } from '../node-status'
import * as moduleExports from '../node-status'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('node-status', moduleExports)

describe('node-status configuration coverage', () => {
  it('validates all required fields', () => {
    expect(nodeStatusConfig.type).toBe('node_status')
    expect(nodeStatusConfig.title).toBe('Node Status')
    expect(nodeStatusConfig.category).toBe('compute')
    expect(nodeStatusConfig.description).toBe('Kubernetes Nodes across clusters')
  })

  it('validates appearance fields', () => {
    expect(nodeStatusConfig.icon).toBe('Server')
    expect(nodeStatusConfig.iconColor).toBe('text-purple-400')
    expect(nodeStatusConfig.defaultWidth).toBe(6)
    expect(nodeStatusConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(nodeStatusConfig.dataSource.type).toBe('hook')
    expect(nodeStatusConfig.dataSource.hook).toBe('useNodes')
  })

  it('validates filters configuration', () => {
    expect(nodeStatusConfig.filters).toBeDefined()
    expect(nodeStatusConfig.filters).toHaveLength(2)
    expect(nodeStatusConfig.filters?.[0].field).toBe('search')
    expect(nodeStatusConfig.filters?.[0].searchFields).toEqual(['name', 'cluster', 'status'])
    expect(nodeStatusConfig.filters?.[1].type).toBe('cluster-select')
  })

  it('validates content configuration', () => {
    expect(nodeStatusConfig.content.type).toBe('list')
    expect(nodeStatusConfig.content.pageSize).toBe(10)
    expect(nodeStatusConfig.content.columns).toBeDefined()
    expect(nodeStatusConfig.content.columns).toHaveLength(6)
    expect(nodeStatusConfig.content.columns?.[1].primary).toBe(true)
  })

  it('validates empty state configuration', () => {
    expect(nodeStatusConfig.emptyState?.icon).toBe('Server')
    expect(nodeStatusConfig.emptyState?.title).toBe('No Nodes')
    expect(nodeStatusConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(nodeStatusConfig.loadingState?.type).toBe('list')
    expect(nodeStatusConfig.loadingState?.rows).toBe(5)
    expect(nodeStatusConfig.loadingState?.showSearch).toBe(true)
  })

  it('validates metadata fields', () => {
    expect(nodeStatusConfig.isDemoData).toBe(true)
    expect(nodeStatusConfig.isLive).toBe(true)
  })
})
