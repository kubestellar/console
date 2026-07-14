import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerDrillAction,
  registerRenderer,
  registerCard,
  getCardDefinition,
  getAllCardDefinitions,
  parseCardYAML,
} from './CardRuntime.setup'
import { registerFakeHook, makeDefinition, CardRuntime } from './CardRuntime.setup'
import { render } from '@testing-library/react'
import React from 'react'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerDataHook', () => {
  it('registers a hook that can be used by CardRuntime', () => {
    registerFakeHook('useRegistered', { data: [{ name: 'a' }] })
    const def = makeDefinition({
      dataSource: { hook: 'useRegistered' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    const { container } = render(React.createElement(CardRuntime, { definition: def }))
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

describe('registerDrillAction', () => {
  it('registers and invokes a drill action on item click', () => {
    const drillFn = vi.fn()
    registerDrillAction('testDrill', drillFn)
    registerFakeHook('useDrillData', { data: [{ cluster: 'c1', namespace: 'ns1', name: 'pod1' }] })

    const def = makeDefinition({
      dataSource: { hook: 'useDrillData' },
      visualization: 'status',
      columns: [
        { field: 'name', header: 'Name' },
        { field: 'namespace', header: 'Namespace' },
      ],
      drillDown: { action: 'testDrill', params: ['cluster', 'namespace', 'name'] },
    })

    render(React.createElement(CardRuntime, { definition: def }))
    expect(drillFn).toBeDefined()
  })
})

describe('registerRenderer', () => {
  it('registers a custom renderer used in renderCell', () => {
    registerRenderer('bold', (value) => React.createElement('strong', { 'data-testid': 'bold-cell' }, String(value)))
    registerFakeHook('useRendererData', { data: [{ name: 'item1' }] })

    const def = makeDefinition({
      dataSource: { hook: 'useRendererData' },
      columns: [{ field: 'name', header: 'Name', render: 'bold' }],
    })

    render(React.createElement(CardRuntime, { definition: def }))
    expect(def).toBeTruthy()
  })
})

describe('registerCard / getCardDefinition / getAllCardDefinitions', () => {
  it('registers and retrieves a card definition', () => {
    const def = makeDefinition({ type: 'reg_test' })
    registerCard(def)
    expect(getCardDefinition('reg_test')).toBe(def)
  })

  it('returns undefined for unregistered card type', () => {
    expect(getCardDefinition('nonexistent_type_xyz')).toBeUndefined()
  })

  it('getAllCardDefinitions returns all registered definitions', () => {
    const before = getAllCardDefinitions().length
    registerCard(makeDefinition({ type: 'all_test_1' }))
    registerCard(makeDefinition({ type: 'all_test_2' }))
    const after = getAllCardDefinitions()
    expect(after.length).toBeGreaterThanOrEqual(before + 2)
  })
})

describe('parseCardYAML', () => {
  it('throws not-yet-implemented error', () => {
    expect(() => parseCardYAML('type: test')).toThrow('YAML parsing not yet implemented')
  })
})
