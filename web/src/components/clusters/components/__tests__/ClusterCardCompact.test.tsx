/**
 * ClusterCardCompact Component Tests
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
  isClusterUnreachable: vi.fn((c: ClusterInfo) => c.reachable === false || ['timeout', 'network', 'certificate', 'auth'].includes(c.errorType ?? '')),
}))

vi.mock('../ClusterTokenRefresh', () => ({
  isTokenExpired: vi.fn((c: ClusterInfo) => c.errorType === 'auth'),
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { ClusterCardCompact } from '../ClusterCardCompact'
import type { GPUInfo } from '../ClusterGrid.types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'kind-dev',
    context: 'kind-dev',
    healthy: true,
    reachable: true,
    nodeCount: 3,
    cpuCores: 8,
    podCount: 42,
    ...overrides,
  }
}

const defaultGpu: GPUInfo = { total: 0, allocated: 0, available: 0 }

function renderCard(
  clusterOverrides: Partial<ClusterInfo> = {},
  extra: { gpuInfo?: GPUInfo; isConnected?: boolean; onSelectCluster?: () => void; onRemoveCluster?: () => void; dragHandle?: ReactNode } = {},
) {
  const cluster = makeCluster(clusterOverrides)
  const onSelectCluster = extra.onSelectCluster ?? vi.fn()
  return render(
    <ClusterCardCompact
      cluster={cluster}
      gpuInfo={extra.gpuInfo ?? defaultGpu}
      isConnected={extra.isConnected ?? true}
      onSelectCluster={onSelectCluster}
      onRemoveCluster={extra.onRemoveCluster}
      dragHandle={extra.dragHandle}
    />,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ClusterCardCompact', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the cluster context name', () => {
    renderCard()
    expect(screen.getByText('kind-dev')).toBeTruthy()
  })

  it('renders node, cpu, pod, and gpu stats', () => {
    renderCard({}, { gpuInfo: { total: 2, allocated: 1, available: 1 } })
    expect(screen.getByText('3')).toBeTruthy()   // nodes
    expect(screen.getByText('8')).toBeTruthy()   // CPUs
    expect(screen.getByText('42')).toBeTruthy()  // pods
    expect(screen.getByText('2')).toBeTruthy()   // GPUs
  })

  it('shows "-" for stats when nodeCount is 0 (no cached data)', () => {
    renderCard({ nodeCount: 0 })
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })

  it('shows a green indicator for a healthy cluster', () => {
    const { container } = renderCard()
    // A healthy cluster shows a green dot (no WifiOff, no AlertCircle, no KeyRound)
    const greenDot = container.querySelector('.bg-green-400')
    expect(greenDot).toBeTruthy()
  })

  it('shows WifiOff indicator for an unreachable cluster', () => {
    // nodeCount=0 to prevent hasCachedData from being true while reachable=false
    const { container } = renderCard({ reachable: false, nodeCount: 0 })
    // WifiOff SVG rendered by lucide has aria-hidden
    const wifiOffIcons = container.querySelectorAll('[aria-hidden="true"]')
    expect(wifiOffIcons.length).toBeGreaterThan(0)
  })

  it('shows token expired icon when errorType is auth', () => {
    renderCard({ errorType: 'auth', reachable: false })
    // KeyRound icon title wrapper
    expect(screen.getByTitle('Token Expired')).toBeTruthy()
  })

  it('shows the current cluster star icon when isCurrent is true', () => {
    const { container } = renderCard({ isCurrent: true })
    // Star icon with fill-current class
    const star = container.querySelector('.fill-current')
    expect(star).toBeTruthy()
  })

  it('displays the alias badge when aliases are present', () => {
    renderCard({ aliases: ['alias-1', 'alias-2'] })
    expect(screen.getByTestId('status-badge')).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('calls onSelectCluster when the card is clicked', () => {
    const onSelectCluster = vi.fn()
    renderCard({}, { onSelectCluster })
    const card = screen.getByRole('button', { name: /Select cluster/i })
    fireEvent.click(card)
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectCluster when Enter is pressed on the card', () => {
    const onSelectCluster = vi.fn()
    renderCard({}, { onSelectCluster })
    const card = screen.getByRole('button', { name: /Select cluster/i })
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectCluster when Space is pressed on the card', () => {
    const onSelectCluster = vi.fn()
    renderCard({}, { onSelectCluster })
    const card = screen.getByRole('button', { name: /Select cluster/i })
    fireEvent.keyDown(card, { key: ' ' })
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('shows remove button for unreachable kubeconfig clusters', () => {
    const onRemoveCluster = vi.fn()
    renderCard({ reachable: false, source: 'kubeconfig' }, { isConnected: true, onRemoveCluster })
    const removeBtn = screen.getByTestId('remove-cluster-button')
    expect(removeBtn).toBeTruthy()
  })

  it('does not show remove button when onRemoveCluster is not provided', () => {
    renderCard({ reachable: false, source: 'kubeconfig' }, { isConnected: true })
    expect(screen.queryByTestId('remove-cluster-button')).toBeNull()
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

  it('shows "-" for GPU when cluster is unreachable even if gpuInfo is present', () => {
    const gpuInfo: GPUInfo = { total: 4, allocated: 2, available: 2 }
    renderCard({ reachable: false, nodeCount: 0 }, { gpuInfo })
    // All 4 stat slots should show "-" because hasCachedData is false (nodeCount=0)
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(4)
  })
})
