import React from 'react'
/**
 * Unit tests for DrasiTopology card component.
 * Covers: loading skeleton, error state, demo data notice, happy-path topology
 * (sources / queries / reactions), orphaned-nodes warning, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DrasiTopology } from './DrasiTopology'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseCachedDrasiTopology = vi.fn()
vi.mock('../../hooks/useCachedDrasiTopology', () => ({
  useCachedDrasiTopology: () => mockUseCachedDrasiTopology(),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height?: number }) => (
    <div data-testid="skeleton" data-height={height} />
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeNode = (overrides = {}) => ({
  id: 'node-1',
  name: 'my-source',
  type: 'source' as const,
  status: 'ready' as const,
  kind: 'PostgreSQL',
  connections: [],
  ...overrides,
})

const defaultTopology = {
  nodes: [
    makeNode({ id: 's1', name: 'db-source', type: 'source', kind: 'PostgreSQL' }),
    makeNode({ id: 'q1', name: 'customer-query', type: 'query', kind: 'ContinuousQuery', status: 'ready' }),
    makeNode({ id: 'r1', name: 'event-sink', type: 'reaction', kind: 'EventGrid', status: 'ready' }),
  ],
  connectedPairs: 2,
  orphanedNodes: 0,
}

const defaultReturn = {
  data: defaultTopology,
  isLoading: false,
  isRefreshing: false,
  isDemoData: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
}

function setup(overrides = {}) {
  mockUseCachedDrasiTopology.mockReturnValue({ ...defaultReturn, ...overrides })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrasiTopology', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading skeleton
  it('renders skeleton when loading with no data', () => {
    setup({ isLoading: true, data: { nodes: [], connectedPairs: 0, orphanedNodes: 0 } })
    render(<DrasiTopology />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  // 2. Error state
  it('renders error state when failed with no data', () => {
    setup({ isFailed: true, data: { nodes: [], connectedPairs: 0, orphanedNodes: 0 } })
    render(<DrasiTopology />)
    expect(screen.getByText(/Failed to load topology/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls refetch when retry clicked', async () => {
    const refetch = vi.fn()
    setup({ isFailed: true, data: { nodes: [], connectedPairs: 0, orphanedNodes: 0 }, refetch })
    const user = userEvent.setup()
    render(<DrasiTopology />)
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalled()
  })

  // 3. Demo data
  it('shows demo data notice when isDemoData is true', () => {
    setup({ isDemoData: true })
    render(<DrasiTopology />)
    expect(screen.getByText('Demo Data')).toBeInTheDocument()
  })

  it('does not show demo notice when isDemoData is false', () => {
    render(<DrasiTopology />)
    expect(screen.queryByText('Demo Data')).not.toBeInTheDocument()
  })

  // 4. Happy path
  it('renders region with correct aria-label', () => {
    render(<DrasiTopology />)
    expect(screen.getByRole('region', { name: /Drasi Topology/i })).toBeInTheDocument()
  })

  it('renders connection count', () => {
    render(<DrasiTopology />)
    expect(screen.getByText('2 connections')).toBeInTheDocument()
  })

  it('renders source node name', () => {
    render(<DrasiTopology />)
    expect(screen.getByText('db-source')).toBeInTheDocument()
  })

  it('renders query node name', () => {
    render(<DrasiTopology />)
    expect(screen.getByText('customer-query')).toBeInTheDocument()
  })

  it('renders reaction node name', () => {
    render(<DrasiTopology />)
    expect(screen.getByText('event-sink')).toBeInTheDocument()
  })

  it('renders node kind labels', () => {
    render(<DrasiTopology />)
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument()
    expect(screen.getByText('ContinuousQuery')).toBeInTheDocument()
    expect(screen.getByText('EventGrid')).toBeInTheDocument()
  })

  it('shows status icon labels', () => {
    render(<DrasiTopology />)
    const readyIcons = screen.getAllByLabelText('Ready')
    expect(readyIcons.length).toBeGreaterThanOrEqual(1)
  })

  it('renders error status icon for error node', () => {
    setup({
      data: {
        ...defaultTopology,
        nodes: [makeNode({ id: 'e1', name: 'bad-source', type: 'source', status: 'error' })],
      },
    })
    render(<DrasiTopology />)
    expect(screen.getByLabelText('Error')).toBeInTheDocument()
  })

  it('renders pending status icon for pending node', () => {
    setup({
      data: {
        ...defaultTopology,
        nodes: [makeNode({ id: 'p1', name: 'pending-src', type: 'source', status: 'pending' })],
      },
    })
    render(<DrasiTopology />)
    expect(screen.getByLabelText('Pending')).toBeInTheDocument()
  })

  it('shows orphaned node warning when orphanedNodes > 0', () => {
    setup({ data: { ...defaultTopology, orphanedNodes: 3 } })
    render(<DrasiTopology />)
    expect(screen.getByText('3 orphaned')).toBeInTheDocument()
  })

  it('does not show orphaned warning when orphanedNodes is 0', () => {
    render(<DrasiTopology />)
    expect(screen.queryByText(/orphaned/)).not.toBeInTheDocument()
  })

  it('renders correct group labels', () => {
    render(<DrasiTopology />)
    expect(screen.getByText('Sources')).toBeInTheDocument()
    expect(screen.getByText('Queries')).toBeInTheDocument()
    expect(screen.getByText('Reactions')).toBeInTheDocument()
  })

  // 5. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<DrasiTopology />)
    expect(asFragment()).toMatchSnapshot()
  })
})
