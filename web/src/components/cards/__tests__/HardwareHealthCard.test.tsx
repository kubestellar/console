import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HardwareHealthCard } from '../HardwareHealthCard'
import type { DeviceAlert, HardwareHealthData, NodeDeviceInventory } from '../../../hooks/useCachedData'

interface CachedHardwareHealthState {
  data: HardwareHealthData
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  consecutiveFailures: number
  isDemoFallback: boolean
  error: string | null
  refetch: () => void
  retryFetch: () => Promise<void>
}

const emptyHardwareHealth: HardwareHealthData = {
  alerts: [],
  inventory: [],
  nodeCount: 0,
  lastUpdate: null,
}

const makeInventoryNode = (overrides: Partial<NodeDeviceInventory> = {}): NodeDeviceInventory => ({
  nodeName: 'gpu-worker-1',
  cluster: 'cluster-1',
  devices: {
    gpuCount: 4,
    nicCount: 2,
    nvmeCount: 1,
    infinibandCount: 1,
    sriovCapable: true,
    rdmaAvailable: true,
    mellanoxPresent: true,
    nvidiaNicPresent: false,
    spectrumScale: false,
    mofedReady: true,
    gpuDriverReady: true,
  },
  lastSeen: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeAlert = (overrides: Partial<DeviceAlert> = {}): DeviceAlert => ({
  id: 'alert-1',
  nodeName: 'gpu-worker-1',
  cluster: 'cluster-1',
  deviceType: 'gpu',
  previousCount: 4,
  currentCount: 2,
  droppedCount: 2,
  firstSeen: '2026-01-01T00:00:00.000Z',
  lastSeen: '2026-01-01T00:05:00.000Z',
  severity: 'critical',
  ...overrides,
})

const mockUseCachedHardwareHealth = vi.fn<() => CachedHardwareHealthState>()
const mockUseCardLoadingState = vi.fn()
const mockDrillToNode = vi.fn()
const mockRetryFetch = vi.fn<() => Promise<void>>()

vi.mock('../../../hooks/useCachedData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useCachedData')>()),
  useCachedHardwareHealth: () => mockUseCachedHardwareHealth(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (state: unknown) => mockUseCardLoadingState(state),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [{ name: 'cluster-1', aliases: ['alias-1'], reachable: true }],
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToNode: mockDrillToNode }),
}))

vi.mock('../../../hooks/useSnoozedAlerts', () => ({
  SNOOZE_DURATIONS: { '1h': 60, '1d': 1440 },
  formatSnoozeRemaining: (minutes: number) => `${minutes}m`,
  useSnoozedAlerts: () => ({
    snoozeAlert: vi.fn(),
    snoozeMultiple: vi.fn(),
    unsnoozeAlert: vi.fn(),
    isSnoozed: () => false,
    getSnoozeRemaining: () => null,
    clearAllSnoozed: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useKeyboardNav', () => ({
  useTabKeyboardNav: ({ activeTab, onChange }: { activeTab: string; onChange: (tab: 'inventory' | 'alerts') => void }) => ({
    tabListProps: { role: 'tablist', 'aria-orientation': 'horizontal', onKeyDown: vi.fn() },
    getTabProps: (tab: 'inventory' | 'alerts') => ({
      id: `${tab}-tab`,
      role: 'tab',
      tabIndex: activeTab === tab ? 0 : -1,
      'data-tab-id': tab,
      'aria-selected': activeTab === tab,
      onClick: () => onChange(tab),
    }),
    getTabPanelProps: (tab: 'inventory' | 'alerts') => ({
      id: `${tab}-panel`,
      role: 'tabpanel',
      'aria-labelledby': `${tab}-tab`,
      tabIndex: 0,
    }),
  }),
  useKeyboardNav: () => ({
    containerRef: { current: null },
    handleKeyDown: vi.fn(),
    focusMatchingItem: vi.fn(),
  }),
}))

vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: vi.fn(() => Promise.resolve({ ok: true })),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>, options?: Record<string, unknown>) => {
      if (typeof fallbackOrOptions === 'string') return fallbackOrOptions
      const count = fallbackOrOptions?.count ?? options?.count
      return count === undefined ? key : `${key}:${count}`
    },
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardAIActions: () => <button type="button">AI</button>,
  CardControlsRow: () => <div data-testid="card-controls-row" />,
  CardPaginationFooter: ({ totalItems }: { totalItems: number }) => <div data-testid="pagination-footer">items:{totalItems}</div>,
  CardSearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) => (
    <input aria-label="hardware-search" placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} />
  ),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: ({ isRefreshing }: { isRefreshing: boolean }) => <div data-testid="refresh-indicator">refreshing:{String(isRefreshing)}</div>,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

function setHardwareHealthState(overrides: Partial<CachedHardwareHealthState> = {}) {
  mockUseCachedHardwareHealth.mockReturnValue({
    data: emptyHardwareHealth,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
    error: null,
    refetch: vi.fn(),
    retryFetch: mockRetryFetch,
    ...overrides,
  })
}

describe('HardwareHealthCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRetryFetch.mockResolvedValue()
    setHardwareHealthState()
  })

  it('reports loading state for skeleton rendering', () => {
    setHardwareHealthState({ isLoading: true })

    render(<HardwareHealthCard />)

    expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({
      isLoading: true,
      hasAnyData: false,
    }))
  })

  it('renders empty inventory state when backend response has no hardware data', () => {
    render(<HardwareHealthCard />)

    expect(screen.getByText('No nodes tracked yet')).toBeInTheDocument()
    expect(screen.getByText('Waiting for device scan...')).toBeInTheDocument()
  })

  it('renders network error state with retry action', async () => {
    setHardwareHealthState({ error: 'Network error' })

    render(<HardwareHealthCard />)
    fireEvent.click(screen.getByText('Retry').closest('button')!)

    expect(screen.getByText('Network error')).toBeInTheDocument()
    await waitFor(() => expect(mockRetryFetch).toHaveBeenCalledTimes(1))
  })

  it('renders happy-path inventory and alert data', () => {
    setHardwareHealthState({
      data: {
        alerts: [makeAlert()],
        inventory: [makeInventoryNode()],
        nodeCount: 1,
        lastUpdate: '2026-01-01T00:00:00.000Z',
      },
    })

    render(<HardwareHealthCard />)

    expect(screen.getAllByText('gpu-worker-1')).not.toHaveLength(0)
    expect(screen.getAllByText('cluster-1')).not.toHaveLength(0)
    expect(screen.getByText('4 GPU')).toBeInTheDocument()
    expect(screen.getByText('SR-IOV')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Alerts/ })).toBeInTheDocument()
  })

  it('switches to alerts view and drills into a hardware alert', () => {
    setHardwareHealthState({
      data: {
        alerts: [makeAlert()],
        inventory: [makeInventoryNode()],
        nodeCount: 1,
        lastUpdate: '2026-01-01T00:00:00.000Z',
      },
    })

    render(<HardwareHealthCard />)
    fireEvent.click(screen.getByRole('tab', { name: /Alerts/ }))
    fireEvent.click(screen.getAllByText('gpu-worker-1')[0].closest('[role="button"]')!)

    expect(screen.getByText('4 → 2 (2 disappeared)')).toBeInTheDocument()
    expect(mockDrillToNode).toHaveBeenCalledWith('cluster-1', 'gpu-worker-1', expect.objectContaining({
      issue: 'GPU disappeared: 4 → 2',
    }))
  })

  it('matches snapshot for populated hardware health card', () => {
    setHardwareHealthState({
      data: {
        alerts: [makeAlert()],
        inventory: [makeInventoryNode()],
        nodeCount: 1,
        lastUpdate: '2026-01-01T00:00:00.000Z',
      },
      isDemoFallback: true,
    })

    const { container } = render(<HardwareHealthCard />)

    expect(container.firstChild).toMatchSnapshot()
  })
})
