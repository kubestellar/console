/**
 * ClusterCardFull Component Tests
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
  getProviderLabel: (provider: string) => provider,
  getProviderColor: () => 'var(--ks-purple)',
  getConsoleUrl: () => null,
}))

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

vi.mock('../../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('../../../lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
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
  CLUSTER_GRID_DIV_STYLE_1: {},
  DISABLED_CLUSTER_ACTION_CLASS: 'disabled-class',
  LOCAL_PLATFORMS: new Set<string>(),
  THEME_COLOR: '#7c3aed',
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { ClusterCardFull } from '../ClusterCardFull'
import type { GPUInfo } from '../ClusterGrid.types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'prod-cluster',
    context: 'prod-cluster',
    healthy: true,
    reachable: true,
    nodeCount: 5,
    cpuCores: 16,
    podCount: 100,
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
  onRenameCluster?: () => void
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
    <ClusterCardFull
      cluster={cluster}
      gpuInfo={extra.gpuInfo ?? defaultGpu}
      isConnected={extra.isConnected ?? true}
      permissionsLoading={extra.permissionsLoading ?? false}
      isClusterAdmin={extra.isClusterAdmin ?? true}
      onSelectCluster={extra.onSelectCluster ?? vi.fn()}
      onRenameCluster={extra.onRenameCluster ?? vi.fn()}
      onRefreshCluster={extra.onRefreshCluster}
      onRemoveCluster={extra.onRemoveCluster}
      dragHandle={extra.dragHandle}
    />,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ClusterCardFull', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the cluster context name', () => {
    renderCard()
    expect(screen.getByText('prod-cluster')).toBeTruthy()
  })

  it('renders node, cpu, pod, and gpu stats', () => {
    renderCard({}, { gpuInfo: { total: 4, allocated: 2, available: 2 } })
    expect(screen.getByText('5')).toBeTruthy()    // nodes
    expect(screen.getByText('16')).toBeTruthy()   // CPUs
    expect(screen.getByText('100')).toBeTruthy()  // pods
    expect(screen.getByText('4')).toBeTruthy()    // GPUs
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

  it('shows the loading status indicator when initialLoading is true', () => {
    renderCard({ refreshing: true, nodeCount: 0 })
    expect(screen.getByTestId('status-indicator-loading')).toBeTruthy()
  })

  it('shows the token expired icon when errorType is auth', () => {
    renderCard({ errorType: 'auth', reachable: false })
    // Title from token expired container
    expect(screen.getByTitle('common.tokenExpired')).toBeTruthy()
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

  it('renders a refresh button when onRefreshCluster is provided', () => {
    const onRefreshCluster = vi.fn()
    renderCard({}, { onRefreshCluster })
    const refreshBtn = screen.getByLabelText('common.refreshClusterData')
    expect(refreshBtn).toBeTruthy()
  })

  it('calls onRefreshCluster and does not propagate to onSelectCluster when refresh is clicked', () => {
    const onSelectCluster = vi.fn()
    const onRefreshCluster = vi.fn()
    renderCard({}, { onSelectCluster, onRefreshCluster })
    const refreshBtn = screen.getByLabelText('common.refreshClusterData')
    fireEvent.click(refreshBtn)
    expect(onRefreshCluster).toHaveBeenCalledTimes(1)
    expect(onSelectCluster).not.toHaveBeenCalled()
  })

  it('disables refresh button while refreshing is spinning', () => {
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
    const { container } = renderCard({ isCurrent: true })
    const star = container.querySelector('.fill-current')
    expect(star).toBeTruthy()
  })

  it('displays alias badge when aliases are present', () => {
    renderCard({ aliases: ['alias-one'] })
    const badge = screen.getByTestId('status-badge')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toContain('1 alias')
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
})
