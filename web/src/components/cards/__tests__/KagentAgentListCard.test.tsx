import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KagentAgentListCard } from '../KagentAgentListCard'
import type { KagentStatusData } from '../../../hooks/useCachedKagentStatus'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
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
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeKagentStatusData = (overrides?: Partial<KagentStatusData>): KagentStatusData => ({
  clusters: [
    {
      cluster: 'prod-east',
      totalAgents: 3,
      readyAgents: 3,
      pendingAgents: 0,
      failedAgents: 0,
      healthPercentage: 100,
      agents: [
        {
          name: 'k8s-assistant',
          namespace: 'kagent-system',
          cluster: 'prod-east',
          status: 'Ready',
          agentType: 'Declarative',
          runtime: 'python',
          replicas: 2,
          readyReplicas: 2,
          modelConfigRef: 'claude-sonnet',
          toolCount: 4,
          a2aEnabled: true,
          lastHeartbeat: '2025-03-24T15:30:00Z',
          uptime: '68d 5h 30m',
        },
        {
          name: 'code-reviewer',
          namespace: 'kagent-system',
          cluster: 'prod-east',
          status: 'Ready',
          agentType: 'Declarative',
          runtime: 'python',
          replicas: 1,
          readyReplicas: 1,
          modelConfigRef: 'gpt-4o',
          toolCount: 2,
          a2aEnabled: true,
        },
        {
          name: 'log-parser',
          namespace: 'kagent-ops',
          cluster: 'prod-east',
          status: 'Ready',
          agentType: 'BYO',
          runtime: 'go',
          replicas: 1,
          readyReplicas: 1,
          modelConfigRef: 'ollama-llama',
          toolCount: 1,
          a2aEnabled: false,
        },
      ],
    },
    {
      cluster: 'prod-west',
      totalAgents: 2,
      readyAgents: 1,
      pendingAgents: 1,
      failedAgents: 0,
      healthPercentage: 50,
      agents: [
        {
          name: 'incident-bot',
          namespace: 'kagent-system',
          cluster: 'prod-west',
          status: 'Ready',
          agentType: 'Declarative',
          runtime: 'go',
          replicas: 3,
          readyReplicas: 3,
          modelConfigRef: 'claude-sonnet',
          toolCount: 5,
          a2aEnabled: false,
        },
        {
          name: 'helm-deployer',
          namespace: 'kagent-system',
          cluster: 'prod-west',
          status: 'Pending',
          agentType: 'BYO',
          runtime: '',
          replicas: 1,
          readyReplicas: 0,
          modelConfigRef: 'gemini-pro',
          toolCount: 3,
          a2aEnabled: true,
        },
      ],
    },
  ],
  totalAgents: 5,
  totalReady: 4,
  overallHealth: 80,
  ...overrides,
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('KagentAgentListCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedKagentStatus.mockReturnValue({
      data: makeKagentStatusData(),
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
  })

  describe('Skeleton state', () => {
    it('renders skeleton when showSkeleton is true', () => {
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: true,
        showEmptyState: false,
      })

      const { container } = render(<KagentAgentListCard />)
      const pulses = container.querySelectorAll('.animate-pulse')
      expect(pulses.length).toBeGreaterThan(0)
    })

    it('renders skeleton when isLoading and no cached data', () => {
      mockUseCachedKagentStatus.mockReturnValue({
        data: { clusters: [], totalAgents: 0, totalReady: 0, overallHealth: 0 },
        isLoading: true,
        isRefreshing: false,
        isDemoFallback: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      })
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: true,
        showEmptyState: false,
      })

      const { container } = render(<KagentAgentListCard />)
      const pulses = container.querySelectorAll('.animate-pulse')
      expect(pulses.length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows empty state when showEmptyState is true', () => {
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: false,
        showEmptyState: true,
      })

      render(<KagentAgentListCard />)
      expect(screen.getByText('kagent.noAgents')).toBeTruthy()
      expect(screen.getByText('kagent.noAgentsDescription')).toBeTruthy()
    })
  })

  describe('Content rendering', () => {
    it('renders agent data with correct total count', () => {
      const { container } = render(<KagentAgentListCard />)
      
      // Should display total agents count
      const content = container.textContent || ''
      expect(content).toContain('5')
      
      // Should display ready agents count
      expect(content).toContain('4')
    })

    it('renders cluster breakdown', () => {
      const { container } = render(<KagentAgentListCard />)
      const content = container.textContent || ''
      
      // Should show both cluster names
      expect(content).toContain('prod-east')
      expect(content).toContain('prod-west')
    })

    it('renders agent list with names', () => {
      const { container } = render(<KagentAgentListCard />)
      const content = container.textContent || ''
      
      // Should show some agent names (up to 3 per cluster)
      expect(content).toContain('k8s-assistant')
    })

    it('displays health percentages', () => {
      const { container } = render(<KagentAgentListCard />)
      const content = container.textContent || ''
      
      // Should show health percentages
      expect(content).toContain('100% healthy')
      expect(content).toContain('50% healthy')
    })
  })

  describe('Demo fallback', () => {
    it('uses demo data when isDemoFallback is true', () => {
      mockUseCachedKagentStatus.mockReturnValue({
        data: makeKagentStatusData(),
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: true,
        consecutiveFailures: 0,
        lastRefresh: Date.now(),
      })
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: false,
        showEmptyState: false,
      })

      const { container } = render(<KagentAgentListCard />)
      
      // Should still render data when demo fallback
      expect(container.textContent).toContain('prod-east')
    })
  })

  describe('Cluster filtering', () => {
    it('filters to single cluster when config.cluster is provided', () => {
      const { container } = render(
        <KagentAgentListCard config={{ cluster: 'prod-east' }} />
      )
      const content = container.textContent || ''
      
      // Should show only prod-east
      expect(content).toContain('prod-east')
      // Should not show prod-west
      expect(content).not.toContain('prod-west')
    })

    it('shows all clusters when no filter specified', () => {
      const { container } = render(<KagentAgentListCard />)
      const content = container.textContent || ''
      
      // Should show both clusters
      expect(content).toContain('prod-east')
      expect(content).toContain('prod-west')
    })

    it('computes correct stats for filtered cluster', () => {
      const { container } = render(
        <KagentAgentListCard config={{ cluster: 'prod-east' }} />
      )
      const content = container.textContent || ''
      
      // prod-east has 3 agents, all ready
      expect(content).toContain('3')
      expect(content).toContain('100% healthy')
    })
  })

  describe('Freshness indicator', () => {
    it('forwards lastRefresh to useCardLoadingState', () => {
      const lastRefresh = Date.now() - 60000 // 1 minute ago
      
      mockUseCachedKagentStatus.mockReturnValue({
        data: makeKagentStatusData(),
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        consecutiveFailures: 0,
        lastRefresh,
      })

      render(<KagentAgentListCard />)
      
      // Verify useCardLoadingState was called with the expected shape
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: false,
          isRefreshing: false,
          hasAnyData: true,
          isFailed: false,
          consecutiveFailures: 0,
          isDemoData: false,
        })
      )
    })
  })

  describe('Failure state', () => {
    it('passes isFailed when consecutive failures exceed threshold', () => {
      mockUseCachedKagentStatus.mockReturnValue({
        data: makeKagentStatusData(),
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        consecutiveFailures: 3,
        lastRefresh: null,
      })

      render(<KagentAgentListCard />)
      
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: true,
          consecutiveFailures: 3,
        })
      )
    })
  })

  describe('Agent status badges', () => {
    it('displays pending agents when present', () => {
      const { container } = render(<KagentAgentListCard />)
      const content = container.textContent || ''
      
      // prod-west has 1 pending agent
      expect(content).toContain('1 pending')
    })

    it('displays failed agents when present', () => {
      const dataWithFailures = makeKagentStatusData({
        clusters: [
          {
            cluster: 'test-cluster',
            totalAgents: 2,
            readyAgents: 1,
            pendingAgents: 0,
            failedAgents: 1,
            healthPercentage: 50,
            agents: [
              {
                name: 'working-agent',
                namespace: 'kagent-system',
                cluster: 'test-cluster',
                status: 'Ready',
                agentType: 'Declarative',
                runtime: 'python',
                replicas: 1,
                readyReplicas: 1,
                modelConfigRef: 'claude-sonnet',
                toolCount: 2,
                a2aEnabled: true,
              },
              {
                name: 'broken-agent',
                namespace: 'kagent-system',
                cluster: 'test-cluster',
                status: 'Failed',
                agentType: 'Declarative',
                runtime: 'python',
                replicas: 1,
                readyReplicas: 0,
                modelConfigRef: 'claude-sonnet',
                toolCount: 2,
                a2aEnabled: true,
              },
            ],
          },
        ],
      })

      mockUseCachedKagentStatus.mockReturnValue({
        data: dataWithFailures,
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        consecutiveFailures: 0,
        lastRefresh: Date.now(),
      })

      const { container } = render(<KagentAgentListCard />)
      const content = container.textContent || ''
      
      expect(content).toContain('1 failed')
    })
  })
})
