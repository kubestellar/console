import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

import { DataTable } from '../DataTable'

const cols = [
  { key: 'name' as const, header: 'Name' },
  { key: 'value' as const, header: 'Value' },
]

type Row = { name: string; value: string }

describe('DataTable', () => {
  it('renders without crashing', () => {
    const { container } = render(<DataTable data={[]} columns={[]} />)
    expect(container).toBeTruthy()
  })

  it('shows empty state when data is empty', () => {
    render(<DataTable data={[]} columns={cols} />)
    expect(screen.getByText('common.noData')).toBeTruthy()
  })

  it('renders rows from data', () => {
    const data: Row[] = [{ name: 'foo', value: 'bar' }]
    render(<DataTable data={data} columns={cols} />)
    expect(screen.getByText('foo')).toBeTruthy()
    expect(screen.getByText('bar')).toBeTruthy()
  })

  it('renders multiple rows', () => {
    const data: Row[] = [
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ]
    render(<DataTable data={data} columns={cols} />)
    expect(screen.getByText('a')).toBeTruthy()
    expect(screen.getByText('b')).toBeTruthy()
  })

  it('calls onRowClick when row is clicked', () => {
    const onRowClick = vi.fn()
    const data: Row[] = [{ name: 'clickable', value: 'row' }]
    render(<DataTable data={data} columns={cols} onRowClick={onRowClick} />)
    fireEvent.click(screen.getByText('clickable'))
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })

  it('uses custom render function when provided', () => {
    const customCols = [
      { key: 'name' as const, header: 'Name', render: (v: Row['name']) => `custom:${v}` },
      { key: 'value' as const, header: 'Value' },
    ]
    const data: Row[] = [{ name: 'foo', value: 'bar' }]
    render(<DataTable data={data} columns={customCols} />)
    expect(screen.getByText('custom:foo')).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<DataTable data={[]} columns={[]} title="My Table" />)
    expect(screen.getByText('My Table')).toBeTruthy()
  })

  it('does not render title element when title is omitted', () => {
    const { container } = render(<DataTable data={[]} columns={[]} />)
    expect(container.querySelector('h4')).toBeNull()
  })
})
