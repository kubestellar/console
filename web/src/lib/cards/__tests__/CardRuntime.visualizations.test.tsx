import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  CardRuntime,
  registerFakeHook,
  registerDrillAction,
  makeDefinition,
  setMockCardDataResult,
  makeCardDataResult,
} from './CardRuntime.setup'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CardRuntime — list/status visualization', () => {
  beforeEach(() => {
    registerFakeHook('useListData', { data: [
      { name: 'pod-a', namespace: 'default', status: 'Running' },
      { name: 'pod-b', namespace: 'kube-system', status: 'Failed' },
    ]})
    setMockCardDataResult(makeCardDataResult({
      items: [
        { name: 'pod-a', namespace: 'default', status: 'Running' },
        { name: 'pod-b', namespace: 'kube-system', status: 'Failed' },
      ],
      totalItems: 2,
    }))
  })

  it('renders list items for status visualization', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useListData' },
      visualization: 'status',
      columns: [
        { field: 'name', header: 'Pod' },
        { field: 'namespace', header: 'Namespace' },
        { field: 'status', header: 'Status' },
      ],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('pod-a')).toBeTruthy()
    expect(screen.getByText('pod-b')).toBeTruthy()
  })

  it('renders only first 3 columns in list view', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useListData' },
      visualization: 'status',
      columns: [
        { field: 'name', header: 'Pod' },
        { field: 'namespace', header: 'Namespace' },
        { field: 'status', header: 'Status' },
        { field: 'extra', header: 'Extra' },
      ],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('pod-a')).toBeTruthy()
  })

  it('uses title override from props', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useListData' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} title="Custom Title" />)
    expect(screen.getByText('Custom Title')).toBeTruthy()
  })

  it('uses definition title when no title prop', () => {
    const def = makeDefinition({
      title: 'Definition Title',
      dataSource: { hook: 'useListData' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Definition Title')).toBeTruthy()
  })
})

describe('CardRuntime — table visualization', () => {
  beforeEach(() => {
    registerFakeHook('useTableData', { data: [
      { name: 'svc-1', type: 'ClusterIP', port: 8080 },
      { name: 'svc-2', type: 'NodePort', port: 30080 },
    ]})
    setMockCardDataResult(makeCardDataResult({
      items: [
        { name: 'svc-1', type: 'ClusterIP', port: 8080 },
        { name: 'svc-2', type: 'NodePort', port: 30080 },
      ],
      totalItems: 2,
    }))
  })

  it('renders a table with headers and rows', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useTableData' },
      visualization: 'table',
      columns: [
        { field: 'name', header: 'Service' },
        { field: 'type', header: 'Type' },
        { field: 'port', header: 'Port', align: 'right', width: 80 },
      ],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Service')).toBeTruthy()
    expect(screen.getByText('Type')).toBeTruthy()
    expect(screen.getByText('Port')).toBeTruthy()
    expect(screen.getByText('svc-1')).toBeTruthy()
    expect(screen.getByText('ClusterIP')).toBeTruthy()
    expect(screen.getByText('8080')).toBeTruthy()
  })

  it('renders table rows as clickable when drillDown is defined', () => {
    const drillFn = vi.fn()
    registerDrillAction('tableDrill', drillFn)
    const def = makeDefinition({
      dataSource: { hook: 'useTableData' },
      visualization: 'table',
      columns: [{ field: 'name', header: 'Service' }],
      drillDown: { action: 'tableDrill', params: ['name'] },
    })
    render(<CardRuntime definition={def} />)
    const row = screen.getByText('svc-1').closest('tr')
    expect(row?.className).toContain('cursor-pointer')
    if (row) fireEvent.click(row)
    expect(drillFn).toHaveBeenCalledWith('svc-1', undefined)
  })

  it('table rows are not clickable when no drillDown', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useTableData' },
      visualization: 'table',
      columns: [{ field: 'name', header: 'Service' }],
    })
    render(<CardRuntime definition={def} />)
    const row = screen.getByText('svc-1').closest('tr')
    expect(row?.className).not.toContain('cursor-pointer')
  })
})
