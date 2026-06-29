import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiniDashboard } from './MiniDashboard'

const mockUseClusters = vi.fn()
const mockUseGPUNodes = vi.fn()
const mockUsePodIssues = vi.fn()
const mockAgentFetch = vi.fn()

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
  useGPUNodes: () => mockUseGPUNodes(),
  usePodIssues: () => mockUsePodIssues(),
}))

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitWidgetLoaded: vi.fn(),
  emitWidgetNavigation: vi.fn(),
  emitWidgetInstalled: vi.fn(),
}
))

vi.mock('../../hooks/useDeepLink', () => ({
  sendNotificationWithDeepLink: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('MiniDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'cluster-1', healthy: false }],
      isLoading: false,
      refetch: vi.fn(),
    })
    mockUseGPUNodes.mockReturnValue({
      nodes: [{ gpuCount: 4, gpuAllocated: 2 }],
      isLoading: false,
      refetch: vi.fn(),
    })
    mockUsePodIssues.mockReturnValue({
      issues: [],
      isLoading: false,
      refetch: vi.fn(),
    })
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [
          { name: 'node-ready', status: 'Ready', roles: ['worker'], unschedulable: false },
          { name: 'node-offline', status: 'NotReady', roles: ['worker'], unschedulable: false },
        ],
      }),
    })

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    Object.defineProperty(window, 'Notification', {
      writable: true,
      value: {
        permission: 'denied',
        requestPermission: vi.fn(),
      },
    })

    window.open = vi.fn()
  })

  it('exports MiniDashboard component', () => {
    expect(MiniDashboard).toBeDefined()
    expect(typeof MiniDashboard).toBe('function')
  })

  it('renders status indicators with color coding for health levels', async () => {
    render(<MiniDashboard />)

    expect(await screen.findByText('Alert')).toHaveClass('text-red-400')
    expect(screen.getByText('Pod Issues').previousElementSibling).toHaveClass('text-muted-foreground')
    expect(screen.getByText('Nodes Offline').previousElementSibling).toHaveClass('text-red-400')

    const statusDot = document.querySelector('.animate-pulse.bg-red-500')
    expect(statusDot).toHaveClass('bg-red-500')
  })
})
