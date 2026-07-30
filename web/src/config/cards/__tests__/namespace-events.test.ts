// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { namespaceEventsConfig } from '../namespace-events'
import * as moduleExports from '../namespace-events'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('namespace-events', moduleExports)

describe('namespace-events configuration coverage', () => {
  it('validates all required fields', () => {
    expect(namespaceEventsConfig.type).toBe('namespace_events')
    expect(namespaceEventsConfig.title).toBe('Namespace Events')
    expect(namespaceEventsConfig.category).toBe('events')
    expect(namespaceEventsConfig.description).toBe('Events in selected namespace')
  })

  it('validates appearance fields', () => {
    expect(namespaceEventsConfig.icon).toBe('Activity')
    expect(namespaceEventsConfig.iconColor).toBe('text-cyan-400')
    expect(namespaceEventsConfig.defaultWidth).toBe(6)
    expect(namespaceEventsConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(namespaceEventsConfig.dataSource.type).toBe('hook')
    expect(namespaceEventsConfig.dataSource.hook).toBe('useNamespaceEvents')
  })

  it('validates content configuration', () => {
    expect(namespaceEventsConfig.content.type).toBe('list')
    expect(namespaceEventsConfig.content.pageSize).toBe(10)
    expect(namespaceEventsConfig.content.columns).toBeDefined()
    expect(namespaceEventsConfig.content.columns).toHaveLength(4)
    expect(namespaceEventsConfig.content.columns?.[0].field).toBe('type')
    expect(namespaceEventsConfig.content.columns?.[2].primary).toBe(true)
  })

  it('validates empty state configuration', () => {
    expect(namespaceEventsConfig.emptyState?.icon).toBe('Activity')
    expect(namespaceEventsConfig.emptyState?.title).toBe('No Events')
    expect(namespaceEventsConfig.emptyState?.variant).toBe('info')
  })

  it('validates loading state configuration', () => {
    expect(namespaceEventsConfig.loadingState?.type).toBe('list')
    expect(namespaceEventsConfig.loadingState?.rows).toBe(5)
  })

  it('validates metadata fields', () => {
    expect(namespaceEventsConfig.isDemoData).toBe(false)
    expect(namespaceEventsConfig.isLive).toBe(true)
  })
})
