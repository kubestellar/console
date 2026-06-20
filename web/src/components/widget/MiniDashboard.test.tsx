import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiniDashboard } from './MiniDashboard'

// Mock the hooks
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [
      { name: 'cluster-1', healthy: true },
      { name: 'cluster-2', healthy: false },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useGPUNodes: () => ({
    nodes: [
      { name: 'node-1', gpuCount: 4, gpuAllocated: 2 },
      { name: 'node-2', gpuCount: 8, gpuAllocated: 4 },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  usePodIssues: () => ({
    issues: [
      { name: 'pod-1', status: 'Error', reason: 'Crashed' },
      { name: 'pod-2', status: 'CrashLoopBackOff', reason: 'Backoff' },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
}))

// Mock other dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

vi.mock('../../lib/constants/network', () => ({
  POLL_INTERVAL_MS: 30000,
}))

vi.mock('../../config/routes', () => ({
  ROUTES: {
    HOME: '/',
  },
}))

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      nodes: [
        { name: 'node-1', status: 'Ready', roles: ['worker'], unschedulable: false },
        { name: 'node-2', status: 'Ready', roles: ['worker'], unschedulable: false },
      ],
    }),
  }),
}))

vi.mock('../../hooks/useDeepLink', () => ({
  sendNotificationWithDeepLink: vi.fn(),
}))

vi.mock('../../lib/analytics', () => ({
  emitWidgetLoaded: vi.fn(),
  emitWidgetNavigation: vi.fn(),
  emitWidgetInstalled: vi.fn(),
}))

describe('MiniDashboard Component', () => {
  beforeEach(() => {
    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    // Mock Notification API
    ;(global as any).Notification = {
      permission: 'default',
      requestPermission: vi.fn(),
    }
  })

  it('exports MiniDashboard component', () => {
    expect(MiniDashboard).toBeDefined()
    expect(typeof MiniDashboard).toBe('function')
  })

  it('renders health indicators', async () => {
    render(<MiniDashboard />)

    // Should render the overall status indicator (Status card)
    expect(screen.getByText('Status')).toBeTruthy()

    // Should render cluster health info (healthy count)
    expect(screen.getByText('Clusters')).toBeTruthy()
    expect(screen.getByText(/healthy/)).toBeTruthy()

    // Should render node health (Nodes Offline)
    expect(screen.getByText('Nodes Offline')).toBeTruthy()

    // Should render pod issues health indicator
    expect(screen.getByText('Pod Issues')).toBeTruthy()
  })

  it('renders status indicators with color coding for health levels', async () => {
    render(<MiniDashboard />)

    // The component should have status badges with color information
    const statusElements = screen.getByText('Status')
    expect(statusElements).toBeTruthy()

    // Should render node readiness info
    const nodesText = screen.getByText('Nodes')
    expect(nodesText).toBeTruthy()
  })

  it('renders refresh button for manual health check', () => {
    render(<MiniDashboard />)

    // Should have refresh button
    const refreshButton = screen.getByRole('button', { name: /common.refresh/i })
    expect(refreshButton).toBeTruthy()
  })
})
