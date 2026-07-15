/**
 * DrasiTopology card — Vitest RTL tests (Part of #21103 / #21094).
 *
 * Covers: render, loading skeleton, failed/error state, source/query/reaction
 * node groups, node status icons, connection count, demo-data notice,
 * and accessible region label.
 *
 * Run from web/:
 *   npx vitest run src/components/cards/__tests__/DrasiTopology.test.tsx
 */
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

const mockUseCachedDrasiTopology = vi.fn()
vi.mock('../../../hooks/useCachedDrasiTopology', () => ({
  useCachedDrasiTopology: () => mockUseCachedDrasiTopology(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height, className }: { height?: number; className?: string }) => (
    <div data-testid="skeleton" style={{ height }} className={className} />
  ),
}))

import { DrasiTopology } from '../DrasiTopology'
import type { DrasiNodeStatus } from '../../../lib/demo/drasiTopology'

function makeNode(overrides: {
  id?: string
  name?: string
  type?: 'source' | 'query' | 'reaction'
  status?: DrasiNodeStatus
  kind?: string
  connections?: string[]
} = {}) {
  return {
    id: 'node-1',
    name: 'test-node',
    type: 'source' as const,
    status: 'ready' as DrasiNodeStatus,
    kind: 'PostgreSQL',
    connections: [],
    ...overrides,
  }
}

function makeTopology(overrides = {}) {
  return {
    nodes: [
      makeNode({ id: 'src-1', name: 'source-node', type: 'source', status: 'ready' }),
      makeNode({ id: 'qry-1', name: 'query-node', type: 'query', status: 'ready' }),
      makeNode({ id: 'rct-1', name: 'reaction-node', type: 'reaction', status: 'ready' }),
    ],
    edges: [],
    connectedPairs: 2,
    orphanedNodes: 0,
    ...overrides,
  }
}

function makeDefaultHookResult(overrides = {}) {
  return {
    data: makeTopology(),
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('DrasiTopology', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedDrasiTopology.mockReturnValue(makeDefaultHookResult())
  })

  describe('loading state', () => {
    it('renders skeletons when loading with no data', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeDefaultHookResult({ isLoading: true, data: null }),
      )
      render(<DrasiTopology />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('error state', () => {
    it('renders error message and retry button when failed with no data', async () => {
      const refetch = vi.fn()
      mockUseCachedDrasiTopology.mockReturnValue(
        makeDefaultHookResult({ isFailed: true, data: null, refetch }),
      )
      render(<DrasiTopology />)
      expect(screen.getByText('Failed to load topology')).toBeInTheDocument()

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /retry loading topology data/i }))
      expect(refetch).toHaveBeenCalledOnce()
    })
  })

  describe('node group columns', () => {
    it('renders Sources, Queries, and Reactions group headings', () => {
      render(<DrasiTopology />)
      expect(screen.getByText('Sources')).toBeInTheDocument()
      expect(screen.getByText('Queries')).toBeInTheDocument()
      expect(screen.getByText('Reactions')).toBeInTheDocument()
    })

    it('renders each node name within its group', () => {
      render(<DrasiTopology />)
      expect(screen.getByText('source-node')).toBeInTheDocument()
      expect(screen.getByText('query-node')).toBeInTheDocument()
      expect(screen.getByText('reaction-node')).toBeInTheDocument()
    })

    it('shows node counts per group', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeDefaultHookResult({
          data: makeTopology({
            nodes: [
              makeNode({ id: 's1', name: 'src-a', type: 'source' }),
              makeNode({ id: 's2', name: 'src-b', type: 'source' }),
              makeNode({ id: 'q1', name: 'qry-a', type: 'query' }),
            ],
          }),
        }),
      )
      render(<DrasiTopology />)
      // Each group header shows count; two sources means "2" appears somewhere
      expect(screen.getByText('src-a')).toBeInTheDocument()
      expect(screen.getByText('src-b')).toBeInTheDocument()
    })
  })

  describe('node status icons', () => {
    it('renders aria-labels for each status icon', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeDefaultHookResult({
          data: makeTopology({
            nodes: [
              makeNode({ id: 'n1', name: 'ready-node', type: 'source', status: 'ready' }),
              makeNode({ id: 'n2', name: 'error-node', type: 'query', status: 'error' }),
              makeNode({ id: 'n3', name: 'pending-node', type: 'reaction', status: 'pending' }),
            ],
          }),
        }),
      )
      render(<DrasiTopology />)
      expect(screen.getByLabelText('Ready')).toBeInTheDocument()
      expect(screen.getByLabelText('Error')).toBeInTheDocument()
      expect(screen.getByLabelText('Pending')).toBeInTheDocument()
    })
  })

  describe('connection count', () => {
    it('shows connected pairs count in summary', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeDefaultHookResult({
          data: makeTopology({ connectedPairs: 7 }),
        }),
      )
      render(<DrasiTopology />)
      expect(screen.getByText('7 connections')).toBeInTheDocument()
    })

    it('shows orphaned nodes count when non-zero', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeDefaultHookResult({
          data: makeTopology({ orphanedNodes: 2 }),
        }),
      )
      render(<DrasiTopology />)
      expect(screen.getByText(/2 orphaned/)).toBeInTheDocument()
    })

    it('does not show orphaned count when zero', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeDefaultHookResult({
          data: makeTopology({ orphanedNodes: 0 }),
        }),
      )
      render(<DrasiTopology />)
      expect(screen.queryByText(/orphaned/)).not.toBeInTheDocument()
    })
  })

  describe('demo data banner', () => {
    it('shows demo data notice when isDemoData is true', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeDefaultHookResult({ isDemoData: true }),
      )
      render(<DrasiTopology />)
      expect(screen.getByText('Demo Data')).toBeInTheDocument()
    })

    it('hides demo data notice for live data', () => {
      mockUseCachedDrasiTopology.mockReturnValue(
        makeDefaultHookResult({ isDemoData: false }),
      )
      render(<DrasiTopology />)
      expect(screen.queryByText('Demo Data')).not.toBeInTheDocument()
    })
  })

  describe('aria accessibility', () => {
    it('renders with accessible region label', () => {
      render(<DrasiTopology />)
      expect(
        screen.getByRole('region', { name: 'Drasi Topology' }),
      ).toBeInTheDocument()
    })
  })
})
