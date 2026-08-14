import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HardwareHealthCardContent } from '../HardwareHealthCardContent'
import type { DeviceAlert, NodeDeviceInventory } from '../../../hooks/useCachedData'
import type { ViewMode } from '../HardwareHealthCard.types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>) =>
      typeof fallbackOrOptions === 'string' ? fallbackOrOptions : key,
  }),
}))

vi.mock('../../../hooks/useSnoozedAlerts', () => ({
  SNOOZE_DURATIONS: { '1h': 60, '1d': 1440 },
  formatSnoozeRemaining: (m: number) => `${m}m`,
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardAIActions: () => <button type="button">AI</button>,
  CardPaginationFooter: ({ totalItems }: { totalItems: number }) => (
    <div data-testid="pagination-footer">items:{totalItems}</div>
  ),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: ({ isRefreshing }: { isRefreshing: boolean }) => (
    <div data-testid="refresh-indicator">refreshing:{String(isRefreshing)}</div>
  ),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

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

const makeInventoryNode = (overrides: Partial<NodeDeviceInventory> = {}): NodeDeviceInventory => ({
  nodeName: 'gpu-worker-1',
  cluster: 'cluster-1',
  devices: {
    gpuCount: 4,
    nicCount: 2,
    nvmeCount: 1,
    infinibandCount: 0,
    sriovCapable: true,
    rdmaAvailable: false,
    mellanoxPresent: false,
    nvidiaNicPresent: false,
    spectrumScale: false,
    mofedReady: false,
    gpuDriverReady: true,
  },
  lastSeen: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

function baseProps(overrides: Partial<React.ComponentProps<typeof HardwareHealthCardContent>> = {}) {
  const props: React.ComponentProps<typeof HardwareHealthCardContent> = {
    viewMode: 'alerts',
    getTabPanelProps: (tab: ViewMode) => ({
      id: `${tab}-panel`,
      role: 'tabpanel',
      'aria-labelledby': `${tab}-tab`,
      tabIndex: 0,
    }),
    paginatedAlerts: [],
    sortedAlerts: [],
    alertsTotalPages: 1,
    alertsNeedsPagination: false,
    paginatedInventory: [],
    sortedInventory: [],
    inventoryTotalPages: 1,
    inventoryNeedsPagination: false,
    search: '',
    localClusterFilter: [],
    drillToNode: vi.fn(),
    isSnoozed: () => false,
    unsnoozeAlert: vi.fn(),
    getSnoozeRemaining: () => null,
    snoozeMenuOpen: null,
    setSnoozeMenuOpen: vi.fn(),
    snoozeMenuRef: { current: null },
    snoozeAlert: vi.fn(),
    clearAlert: vi.fn(),
    currentPage: 1,
    effectivePerPage: 10,
    setCurrentPage: vi.fn(),
    isRefreshing: false,
    isDemoFallback: false,
    lastUpdate: null,
    ...overrides,
  }
  return props
}

describe('HardwareHealthCardContent', () => {
  it('shows "all healthy" empty message in alerts mode when no alerts and no filters', () => {
    render(<HardwareHealthCardContent {...baseProps({ viewMode: 'alerts' })} />)
    expect(screen.getByText('All hardware devices healthy')).toBeInTheDocument()
  })

  it('shows "no matching alerts" when search is set and no alerts', () => {
    render(<HardwareHealthCardContent {...baseProps({ viewMode: 'alerts', search: 'gpu' })} />)
    expect(screen.getByText('No matching alerts')).toBeInTheDocument()
  })

  it('shows "no nodes tracked yet" in inventory mode with no filters', () => {
    render(<HardwareHealthCardContent {...baseProps({ viewMode: 'inventory' })} />)
    expect(screen.getByText('No nodes tracked yet')).toBeInTheDocument()
    expect(screen.getByText('Waiting for device scan...')).toBeInTheDocument()
  })

  it('shows "no matching nodes" in inventory mode with a cluster filter', () => {
    render(
      <HardwareHealthCardContent
        {...baseProps({ viewMode: 'inventory', localClusterFilter: ['prod'] })}
      />,
    )
    expect(screen.getByText('No matching nodes')).toBeInTheDocument()
  })

  it('renders an alert row and calls drillToNode when activated', () => {
    const drillToNode = vi.fn()
    const alert = makeAlert()
    render(
      <HardwareHealthCardContent
        {...baseProps({
          viewMode: 'alerts',
          paginatedAlerts: [alert],
          sortedAlerts: [alert],
          drillToNode,
        })}
      />,
    )
    const row = screen.getByLabelText('cards:hardwareHealth.viewAlertAria')
    fireEvent.click(row)
    expect(drillToNode).toHaveBeenCalledWith(
      'cluster-1',
      'gpu-worker-1',
      expect.objectContaining({ issue: expect.stringContaining('4 → 2') }),
    )
  })

  it('opens the snooze menu for the alert when the snooze button is clicked', () => {
    const setSnoozeMenuOpen = vi.fn()
    const alert = makeAlert()
    render(
      <HardwareHealthCardContent
        {...baseProps({
          viewMode: 'alerts',
          paginatedAlerts: [alert],
          sortedAlerts: [alert],
          setSnoozeMenuOpen,
        })}
      />,
    )
    fireEvent.click(screen.getByLabelText('cards:hardwareHealth.snoozeAlertAria'))
    expect(setSnoozeMenuOpen).toHaveBeenCalledWith('alert-1')
  })

  it('clears an alert when the clear button is clicked', () => {
    const clearAlert = vi.fn()
    const alert = makeAlert()
    render(
      <HardwareHealthCardContent
        {...baseProps({
          viewMode: 'alerts',
          paginatedAlerts: [alert],
          sortedAlerts: [alert],
          clearAlert,
        })}
      />,
    )
    fireEvent.click(screen.getByLabelText('cards:hardwareHealth.clearAlertAria'))
    expect(clearAlert).toHaveBeenCalledWith('alert-1')
  })

  it('renders inventory node with device counts and drills on click', () => {
    const drillToNode = vi.fn()
    const node = makeInventoryNode()
    render(
      <HardwareHealthCardContent
        {...baseProps({
          viewMode: 'inventory',
          paginatedInventory: [node],
          sortedInventory: [node],
          drillToNode,
        })}
      />,
    )
    expect(screen.getByText(/4 GPU/)).toBeInTheDocument()
    expect(screen.getByText(/2 NIC/)).toBeInTheDocument()
    expect(screen.getByText(/1 NVMe/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('cards:hardwareHealth.viewNodeAria'))
    expect(drillToNode).toHaveBeenCalledWith('cluster-1', 'gpu-worker-1')
  })

  it('shows "no devices" copy when a node has zero devices', () => {
    const bareNode = makeInventoryNode({
      devices: {
        gpuCount: 0,
        nicCount: 0,
        nvmeCount: 0,
        infinibandCount: 0,
        sriovCapable: false,
        rdmaAvailable: false,
        mellanoxPresent: false,
        nvidiaNicPresent: false,
        spectrumScale: false,
        mofedReady: false,
        gpuDriverReady: false,
      },
    })
    render(
      <HardwareHealthCardContent
        {...baseProps({
          viewMode: 'inventory',
          paginatedInventory: [bareNode],
          sortedInventory: [bareNode],
        })}
      />,
    )
    expect(screen.getByText('cards:hardwareHealth.noDevicesDetected')).toBeInTheDocument()
  })

  it('renders the refresh indicator', () => {
    render(<HardwareHealthCardContent {...baseProps({ isRefreshing: true })} />)
    expect(screen.getByTestId('refresh-indicator')).toHaveTextContent('refreshing:true')
  })

  it('renders pagination footers for both tab panels', () => {
    const alert = makeAlert()
    const node = makeInventoryNode()
    render(
      <HardwareHealthCardContent
        {...baseProps({
          viewMode: 'alerts',
          paginatedAlerts: [alert],
          sortedAlerts: [alert],
          paginatedInventory: [node],
          sortedInventory: [node, node],
        })}
      />,
    )
    const footers = screen.getAllByTestId('pagination-footer')
    // both alerts and inventory tab panels render (inventory hidden but present)
    expect(footers).toHaveLength(2)
    expect(footers.some(f => f.textContent === 'items:1')).toBe(true)
    expect(footers.some(f => f.textContent === 'items:2')).toBe(true)
  })
})
