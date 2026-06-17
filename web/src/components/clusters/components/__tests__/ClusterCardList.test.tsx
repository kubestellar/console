/**
 * ClusterCardList Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ClusterInfo } from '../../../../hooks/useMCP'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../ui/FlashingValue', () => ({
  FlashingValue: ({ value }: { value: string | number | undefined }) => <span>{value}</span>,
}))

vi.mock('../../../charts/StatusIndicator', () => ({
  StatusIndicator: ({ status }: { status: string }) => <span data-testid={`status-indicator-${status}`} />,
}))

vi.mock('../../../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: ({ provider }: { provider: string }) => <span data-testid="cloud-icon">{provider}</span>,
  detectCloudProvider: () => 'kind',
  getProviderColor: () => 'var(--ks-purple)',
}))

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

vi.mock('../../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('../utils', () => ({
  isClusterHealthy: vi.fn((c: ClusterInfo) => c.healthy === true && c.reachable !== false),
  isClusterLoading: vi.fn((c: ClusterInfo) => c.refreshing === true),
  isClusterUnreachable: vi.fn((c: ClusterInfo) => c.reachable === false || ['timeout', 'network', 'certificate', 'auth'].includes(c.errorType ?? '')),
}))

vi.mock('../ClusterTokenRefresh', () => ({
  isTokenExpired: vi.fn((c: ClusterInfo) => c.errorType === 'auth'),
  useClusterRefreshSpin: vi.fn((refreshing: boolean) => refreshing),
}))

vi.mock('../ClusterAuthBadges', () => ({
  ClusterAuthBadges: () => null,
  ClusterIAMRefreshHint: () => null,
}))

vi.mock('../LocalClusterControls', () => ({
  LocalClusterControls: () => null,
}))

vi.mock('../ClusterGrid.constants', () => ({
  CLUSTER_GRID_DIV_STYLE_2: {},
  DISABLED_CLUSTER_ACTION_CLASS: 'disabled-class',
  LOCAL_PLATFORMS: new Set<string>(),
  THEME_COLOR: '#7c3aed',
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { ClusterCardList } from '../ClusterCardList'
import type { GPUInfo } from '../ClusterGrid.types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'list-cluster',
    context: 'list-cluster',
    healthy: true,
    reachable: true,
    nodeCount: 4,
    cpuCores: 12,
    podCount: 60,
    source: 'kubeconfig',
    ...overrides,
  }
}

const defaultGpu: GPUInfo = { total: 0, allocated: 0, available: 0 }

interface RenderOptions {
  gpuInfo?: GPUInfo
  isConnected?: boolean
  permissionsLoading?: boolean
  isClusterAdmin?: boolean
  onSelectCluster?: () => void
  onRefreshCluster?: () => void
  onRemoveCluster?: () => void
  dragHandle?: ReactNode
}

function renderCard(
  clusterOverrides: Partial<ClusterInfo> = {},
  extra: RenderOptions = {},
) {
  const cluster = makeCluster(clusterOverrides)
  return render(
    <ClusterCardList
      cluster={cluster}
      gpuInfo={extra.gpuInfo ?? defaultGpu}
      isConnected={extra.isConnected ?? true}
      permissionsLoading={extra.permissionsLoading ?? false}
      isClusterAdmin={extra.isClusterAdmin ?? true}
      onSelectCluster={extra.onSelectCluster ?? vi.fn()}
      onRefreshCluster={extra.onRefreshCluster}
      onRemoveCluster={extra.onRemoveCluster}
      dragHandle={extra.dragHandle}
    />,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ClusterCardList', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the cluster context name', () => {
    renderCard()
    expect(screen.getByText('list-cluster')).toBeTruthy()
  })

  it('renders node, cpu, and pod stats', () => {
    renderCard()
    expect(screen.getByText('4')).toBeTruthy()   // nodes
    expect(screen.getByText('12')).toBeTruthy()  // CPUs
    expect(screen.getByText('60')).toBeTruthy()  // pods
  })

  it('shows "-" for stats when nodeCount is 0 (no cached data)', () => {
    renderCard({ nodeCount: 0 })
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })

  it('shows the healthy status indicator for a healthy cluster', () => {
    renderCard()
    expect(screen.getByTestId('status-indicator-healthy')).toBeTruthy()
  })

  it('shows the loading status indicator during initial loading', () => {
    renderCard({ refreshing: true, nodeCount: 0 })
    expect(screen.getByTestId('status-indicator-loading')).toBeTruthy()
  })

  it('shows token expired icon when errorType is auth', () => {
    renderCard({ errorType: 'auth', reachable: false })
    expect(screen.getByTitle('Token Expired')).toBeTruthy()
  })

  it('shows WifiOff indicator for an unreachable cluster', () => {
    renderCard({ reachable: false, nodeCount: 0 })
    expect(screen.getByTitle('Offline')).toBeTruthy()
  })

  it('shows unhealthy indicator when cluster is unhealthy', () => {
    renderCard({ healthy: false, reachable: true })
    expect(screen.getByTitle('Unhealthy')).toBeTruthy()
  })

  it('calls onSelectCluster when the card is clicked', () => {
    const onSelectCluster = vi.fn()
    renderCard({}, { onSelectCluster })
    const card = screen.getByRole('button', { name: /Select cluster/i })
    fireEvent.click(card)
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectCluster when Enter key is pressed', () => {
    const onSelectCluster = vi.fn()
    renderCard({}, { onSelectCluster })
    const card = screen.getByRole('button', { name: /Select cluster/i })
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectCluster when Space key is pressed', () => {
    const onSelectCluster = vi.fn()
    renderCard({}, { onSelectCluster })
    const card = screen.getByRole('button', { name: /Select cluster/i })
    fireEvent.keyDown(card, { key: ' ' })
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('renders a refresh button when onRefreshCluster is provided', () => {
    const onRefreshCluster = vi.fn()
    renderCard({}, { onRefreshCluster })
    expect(screen.getByLabelText('common.refresh')).toBeTruthy()
  })

  it('calls onRefreshCluster without propagating to onSelectCluster', () => {
    const onSelectCluster = vi.fn()
    const onRefreshCluster = vi.fn()
    renderCard({}, { onSelectCluster, onRefreshCluster })
    const refreshBtn = screen.getByLabelText('common.refresh')
    fireEvent.click(refreshBtn)
    expect(onRefreshCluster).toHaveBeenCalledTimes(1)
    expect(onSelectCluster).not.toHaveBeenCalled()
  })

  it('disables refresh button while refreshing', () => {
    const onRefreshCluster = vi.fn()
    renderCard({ refreshing: true }, { onRefreshCluster })
    const refreshBtn = screen.getByLabelText('common.refreshing')
    expect((refreshBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables refresh button when cluster is unreachable', () => {
    const onRefreshCluster = vi.fn()
    renderCard({ reachable: false }, { onRefreshCluster })
    const refreshBtn = screen.getByLabelText('cluster.controlsDisabledOffline')
    expect((refreshBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the current cluster star icon when isCurrent is true', () => {
    renderCard({ isCurrent: true })
    expect(screen.getByTitle('Current context')).toBeTruthy()
  })

  it('displays alias badge when aliases are present', () => {
    renderCard({ aliases: ['alias-1', 'alias-2'] })
    expect(screen.getByTestId('status-badge')).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('shows remove button for unreachable kubeconfig clusters', () => {
    const onRemoveCluster = vi.fn()
    renderCard({ reachable: false, source: 'kubeconfig' }, { isConnected: true, onRemoveCluster })
    expect(screen.getByTestId('remove-cluster-button')).toBeTruthy()
  })

  it('does not show remove button when cluster is reachable', () => {
    const onRemoveCluster = vi.fn()
    renderCard({ reachable: true }, { isConnected: true, onRemoveCluster })
    expect(screen.queryByTestId('remove-cluster-button')).toBeNull()
  })

  it('renders the drag handle when provided', () => {
    renderCard({}, { dragHandle: <span data-testid="drag-handle">⠿</span> })
    expect(screen.getByTestId('drag-handle')).toBeTruthy()
  })

  it('renders GPU stat row when gpuInfo total is greater than 0 and cluster is reachable', () => {
    const gpuInfo: GPUInfo = { total: 2, allocated: 1, available: 1 }
    renderCard({}, { gpuInfo })
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('does not render GPU stat row when gpuInfo total is 0', () => {
    renderCard({}, { gpuInfo: { total: 0, allocated: 0, available: 0 } })
    // No GPU value rendered in list stats
    expect(screen.queryByTitle(/GPU:/)).toBeNull()
  })
})
