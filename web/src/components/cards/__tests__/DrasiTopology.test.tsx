// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Module mocks — registered before importing the SUT.
// ---------------------------------------------------------------------------

const mockUseCachedDrasiTopology = vi.fn()
vi.mock('../../../hooks/useCachedDrasiTopology', () => ({
  useCachedDrasiTopology: () => mockUseCachedDrasiTopology(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height?: number }) => (
    <div data-testid="skeleton" data-height={height} />
  ),
}))

import { DrasiTopology } from '../DrasiTopology'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTopology(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      nodes: [
        { id: 's1', type: 'source', kind: 'kafka', name: 'orders-source', status: 'ready' },
        { id: 's2', type: 'source', kind: 'postgres', name: 'users-source', status: 'error' },
        { id: 'q1', type: 'query', kind: 'continuous', name: 'active-users', status: 'ready' },
        { id: 'r1', type: 'reaction', kind: 'webhook', name: 'notify-slack', status: 'pending' },
      ],
      connectedPairs: 3,
      orphanedNodes: 0,
    },
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrasiTopology', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders skeletons while initial load is in flight with no data', () => {
      mockUseCachedDrasiTopology.mockReturnValue({
        data: null,
        isLoading: true,
        isRefreshing: false,
        isDemoData: false,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: 0,
        refetch: vi.fn(),
      })
      render(<DrasiTopology />)
      const skeletons = screen.getAllByTestId('skeleton')
      // Header skeleton + 3 column skeletons
      expect(skeletons.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('error state', () => {
    it('renders the retry button when isFailed and no data is available', () => {
      const refetch = vi.fn()
      mockUseCachedDrasiTopology.mockReturnValue({
        data: null,
        isLoading: false,
        isRefreshing: false,
        isDemoData: false,
        isFailed: true,
        consecutiveFailures: 3,
        lastRefresh: 0,
        refetch,
      })
      render(<DrasiTopology />)
      expect(screen.getByText('Failed to load topology')).toBeInTheDocument()
      const retry = screen.getByRole('button', { name: /retry loading topology data/i })
      fireEvent.click(retry)
      expect(refetch).toHaveBeenCalledTimes(1)
    })

    it('does NOT render the failure UI when isFailed but data is still present', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeTopology({ isFailed: true }),
      )
      render(<DrasiTopology />)
      expect(screen.queryByText('Failed to load topology')).not.toBeInTheDocument()
      // Real content renders
      expect(screen.getByRole('region', { name: /drasi topology/i })).toBeInTheDocument()
    })
  })

  describe('happy path', () => {
    it('renders sources, queries, and reactions groups with correct counts', () => {
      mockUseCachedDrasiTopology.mockReturnValue(makeTopology())
      render(<DrasiTopology />)

      expect(screen.getByText('Sources')).toBeInTheDocument()
      expect(screen.getByText('Queries')).toBeInTheDocument()
      expect(screen.getByText('Reactions')).toBeInTheDocument()

      // Individual node names appear
      expect(screen.getByText('orders-source')).toBeInTheDocument()
      expect(screen.getByText('users-source')).toBeInTheDocument()
      expect(screen.getByText('active-users')).toBeInTheDocument()
      expect(screen.getByText('notify-slack')).toBeInTheDocument()
    })

    it('renders the connection count from topology.connectedPairs', () => {
      mockUseCachedDrasiTopology.mockReturnValue(makeTopology())
      render(<DrasiTopology />)
      expect(screen.getByText('3 connections')).toBeInTheDocument()
    })

    it('renders orphaned nodes indicator only when orphanedNodes > 0', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeTopology({
          data: {
            ...makeTopology().data,
            orphanedNodes: 2,
          },
        }),
      )
      render(<DrasiTopology />)
      expect(screen.getByText('2 orphaned')).toBeInTheDocument()
    })

    it('does NOT render orphaned indicator when orphanedNodes is 0', () => {
      mockUseCachedDrasiTopology.mockReturnValue(makeTopology())
      render(<DrasiTopology />)
      expect(screen.queryByText(/orphaned/)).not.toBeInTheDocument()
    })
  })

  describe('demo data notice', () => {
    it('shows the "Demo Data" banner when isDemoData is true', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeTopology({ isDemoData: true }),
      )
      render(<DrasiTopology />)
      expect(screen.getByText('Demo Data')).toBeInTheDocument()
    })

    it('hides the demo banner when isDemoData is false', () => {
      mockUseCachedDrasiTopology.mockReturnValue(makeTopology())
      render(<DrasiTopology />)
      expect(screen.queryByText('Demo Data')).not.toBeInTheDocument()
    })
  })

  describe('empty topology', () => {
    it('renders group headers with zero counts when nodes array is empty', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeTopology({
          data: { nodes: [], connectedPairs: 0, orphanedNodes: 0 },
        }),
      )
      render(<DrasiTopology />)
      expect(screen.getByText('Sources')).toBeInTheDocument()
      expect(screen.getByText('Queries')).toBeInTheDocument()
      expect(screen.getByText('Reactions')).toBeInTheDocument()
      expect(screen.getByText('0 connections')).toBeInTheDocument()
    })
  })

  describe('CardDataContext integration', () => {
    it('reports loading state to CardDataContext', () => {
      mockUseCachedDrasiTopology.mockReturnValue(makeTopology())
      render(<DrasiTopology />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: false,
          hasAnyData: true,
          isDemoData: false,
          isFailed: false,
        }),
      )
    })
  })
})
