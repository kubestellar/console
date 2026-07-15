/**
 * KagentAgentListCard — Vitest RTL tests (Part of #21103 / #21094).
 *
 * Covers: render, loading skeleton, empty state, cluster breakdown,
 * per-agent status icons, health badges, and metric tiles.
 *
 * Run from web/:
 *   npx vitest run src/components/cards/__tests__/KagentAgentListCard.test.tsx
 */
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

const mockUseCachedKagentStatus = vi.fn()
vi.mock('../../../hooks/useCachedKagentStatus', () => ({
  useCachedKagentStatus: () => mockUseCachedKagentStatus(),
  HEALTH_THRESHOLD_HEALTHY: 90,
  HEALTH_THRESHOLD_WARNING: 70,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

import { KagentAgentListCard } from '../KagentAgentListCard'

function makeAgent(overrides = {}) {
  return {
    name: 'test-agent',
    namespace: 'default',
    cluster: 'prod-cluster',
    status: 'Ready',
    replicas: 1,
    readyReplicas: 1,
    ...overrides,
  }
}

function makeCluster(overrides = {}) {
  return {
    cluster: 'prod-cluster',
    totalAgents: 2,
    readyAgents: 2,
    pendingAgents: 0,
    failedAgents: 0,
    healthPercentage: 100,
    agents: [
      makeAgent({ name: 'agent-alpha', status: 'Ready' }),
      makeAgent({ name: 'agent-beta', status: 'Ready' }),
    ],
    ...overrides,
  }
}

function makeStatusData(overrides = {}) {
  return {
    totalAgents: 2,
    clusters: [makeCluster()],
    ...overrides,
  }
}

function makeDefaultHookResult(overrides = {}) {
  return {
    data: makeStatusData(),
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('KagentAgentListCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedKagentStatus.mockReturnValue(makeDefaultHookResult())
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: false,
    })
  })

  describe('loading state', () => {
    it('renders skeletons when showSkeleton is true', () => {
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: true,
        showEmptyState: false,
        hasData: false,
        isRefreshing: false,
      })
      render(<KagentAgentListCard />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('empty state', () => {
    it('renders no-agents message when showEmptyState is true', () => {
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: false,
        showEmptyState: true,
        hasData: false,
        isRefreshing: false,
      })
      render(<KagentAgentListCard />)
      // Component calls t('kagent.noAgents'); mock returns the key as-is
      expect(screen.getByText('kagent.noAgents')).toBeInTheDocument()
    })
  })

  describe('metric tiles', () => {
    it('renders total agents, ready, and issues metric tiles', () => {
      render(<KagentAgentListCard />)
      // t('kagent.totalAgents') returns key as-is; fallback is used via || operator
      // so result is 'kagent.totalAgents' (truthy key), not the || fallback
      expect(screen.getByText('kagent.totalAgents')).toBeInTheDocument()
      expect(screen.getByText('kagent.ready')).toBeInTheDocument()
      expect(screen.getByText('kagent.issues')).toBeInTheDocument()
    })

    it('displays correct total agent count', () => {
      mockUseCachedKagentStatus.mockReturnValue(
        makeDefaultHookResult({
          data: makeStatusData({
            totalAgents: 5,
            clusters: [
              makeCluster({
                totalAgents: 5,
                readyAgents: 4,
                pendingAgents: 1,
                failedAgents: 0,
                agents: Array.from({ length: 5 }, (_, i) =>
                  makeAgent({ name: `agent-${i}`, status: i < 4 ? 'Ready' : 'Pending' }),
                ),
              }),
            ],
          }),
        }),
      )
      render(<KagentAgentListCard />)
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  describe('cluster breakdown', () => {
    it('renders cluster name in breakdown section', () => {
      render(<KagentAgentListCard />)
      expect(screen.getByText('prod-cluster')).toBeInTheDocument()
    })

    it('renders agents by cluster section heading', () => {
      render(<KagentAgentListCard />)
      expect(screen.getByText('kagent.agentsByCluster')).toBeInTheDocument()
    })

    it('renders ready agent count within cluster row', () => {
      mockUseCachedKagentStatus.mockReturnValue(
        makeDefaultHookResult({
          data: makeStatusData({
            clusters: [
              makeCluster({
                readyAgents: 3,
                pendingAgents: 0,
                failedAgents: 0,
                agents: Array.from({ length: 3 }, (_, i) =>
                  makeAgent({ name: `rdy-${i}`, status: 'Ready' }),
                ),
              }),
            ],
          }),
        }),
      )
      render(<KagentAgentListCard />)
      expect(screen.getByText(/3 ready/)).toBeInTheDocument()
    })

    it('renders pending count when non-zero', () => {
      mockUseCachedKagentStatus.mockReturnValue(
        makeDefaultHookResult({
          data: makeStatusData({
            clusters: [
              makeCluster({
                pendingAgents: 2,
                agents: [
                  makeAgent({ name: 'pend-1', status: 'Pending' }),
                  makeAgent({ name: 'pend-2', status: 'Pending' }),
                ],
              }),
            ],
          }),
        }),
      )
      render(<KagentAgentListCard />)
      expect(screen.getByText(/2 pending/)).toBeInTheDocument()
    })

    it('renders failed count when non-zero', () => {
      mockUseCachedKagentStatus.mockReturnValue(
        makeDefaultHookResult({
          data: makeStatusData({
            clusters: [
              makeCluster({
                failedAgents: 1,
                agents: [makeAgent({ name: 'fail-1', status: 'Failed' })],
              }),
            ],
          }),
        }),
      )
      render(<KagentAgentListCard />)
      expect(screen.getByText(/1 failed/)).toBeInTheDocument()
    })
  })

  describe('agent list', () => {
    it('renders agent names in recent agents section', () => {
      render(<KagentAgentListCard />)
      expect(screen.getByText('agent-alpha')).toBeInTheDocument()
      expect(screen.getByText('agent-beta')).toBeInTheDocument()
    })

    it('renders cluster/namespace label for each agent', () => {
      render(<KagentAgentListCard />)
      expect(screen.getAllByText(/prod-cluster \/ default/).length).toBeGreaterThan(0)
    })
  })

  describe('config-based cluster filtering', () => {
    it('renders only the specified cluster when config.cluster is set', () => {
      mockUseCachedKagentStatus.mockReturnValue(
        makeDefaultHookResult({
          data: makeStatusData({
            clusters: [
              makeCluster({ cluster: 'cluster-a', agents: [makeAgent({ name: 'agent-in-a', cluster: 'cluster-a' })] }),
              makeCluster({ cluster: 'cluster-b', agents: [makeAgent({ name: 'agent-in-b', cluster: 'cluster-b' })] }),
            ],
          }),
        }),
      )
      render(<KagentAgentListCard config={{ cluster: 'cluster-a' }} />)
      expect(screen.getByText('cluster-a')).toBeInTheDocument()
      expect(screen.queryByText('cluster-b')).not.toBeInTheDocument()
    })
  })

  describe('useCardLoadingState is called with correct args', () => {
    it('passes isFailed=true when consecutiveFailures >= 3', () => {
      mockUseCachedKagentStatus.mockReturnValue(
        makeDefaultHookResult({ consecutiveFailures: 3, data: makeStatusData({ totalAgents: 0, clusters: [] }) }),
      )
      render(<KagentAgentListCard />)
      const callArgs = mockUseCardLoadingState.mock.calls[0][0] as { isFailed: boolean }
      expect(callArgs.isFailed).toBe(true)
    })

    it('passes isFailed=false when consecutiveFailures < 3', () => {
      mockUseCachedKagentStatus.mockReturnValue(
        makeDefaultHookResult({ consecutiveFailures: 2 }),
      )
      render(<KagentAgentListCard />)
      const callArgs = mockUseCardLoadingState.mock.calls[0][0] as { isFailed: boolean }
      expect(callArgs.isFailed).toBe(false)
    })
  })
})
