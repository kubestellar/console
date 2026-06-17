import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { ClusterInfo } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../utils', () => ({
  isClusterHealthy: () => true,
  isClusterLoading: () => false,
  isClusterUnreachable: () => false,
}))

vi.mock('../../../lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

vi.mock('../../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: () => <div data-testid="cloud-provider-icon" />,
  detectCloudProvider: () => 'kubernetes',
  getProviderColor: () => '#326ce5',
  getProviderLabel: () => 'Kubernetes',
  getConsoleUrl: () => null,
}))

vi.mock('../../ui/FlashingValue', () => ({
  FlashingValue: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../charts/StatusIndicator', () => ({
  StatusIndicator: () => <div data-testid="status-indicator" />,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: () => <div data-testid="status-badge" />,
}))

vi.mock('./ClusterTokenRefresh', () => ({
  isTokenExpired: () => false,
  useClusterRefreshSpin: () => false,
}))

vi.mock('./ClusterAuthBadges', () => ({
  ClusterAuthBadges: () => <div data-testid="cluster-auth-badges" />,
  ClusterIAMRefreshHint: () => null,
}))

vi.mock('./LocalClusterControls', () => ({
  LocalClusterControls: () => <div data-testid="local-cluster-controls" />,
}))

vi.mock('./ClusterGrid.common', () => ({
  ActionTooltipWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RemoveClusterButton: () => <button data-testid="remove-cluster-button">Remove</button>,
  handleCardKeyDown: (callback: () => void) => (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      callback()
    }
  },
}))

import { ClusterCardFull } from './ClusterCardFull'

describe('ClusterCardFull', () => {
  const mockCluster: ClusterInfo = {
    name: 'prod-cluster',
    context: 'prod-context',
    server: 'https://prod.example.com',
    healthy: true,
    nodeCount: 5,
    namespaces: ['default', 'kube-system'],
    aliases: [],
  }

  const defaultProps = {
    cluster: mockCluster,
    isConnected: true,
    permissionsLoading: false,
    isClusterAdmin: true,
    onSelectCluster: vi.fn(),
    onRenameCluster: vi.fn(),
    onRefreshCluster: vi.fn(),
    onRemoveCluster: vi.fn(),
  }

  it('renders cluster card with full details', () => {
    const { getByText } = render(<ClusterCardFull {...defaultProps} />)
    expect(getByText('prod-context')).toBeTruthy()
  })

  it('calls onSelectCluster when card is clicked', () => {
    const onSelectCluster = vi.fn()
    const { container } = render(<ClusterCardFull {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = container.querySelector('[role="button"]')
    fireEvent.click(card!)
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onRenameCluster when rename button is clicked', () => {
    const onRenameCluster = vi.fn()
    const { getByTestId } = render(<ClusterCardFull {...defaultProps} onRenameCluster={onRenameCluster} />)
    const renameButton = getByTestId('rename-cluster-button')
    fireEvent.click(renameButton)
    expect(onRenameCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onRefreshCluster when refresh button is clicked', () => {
    const onRefreshCluster = vi.fn()
    const { getByTestId } = render(<ClusterCardFull {...defaultProps} onRefreshCluster={onRefreshCluster} />)
    const refreshButton = getByTestId('refresh-cluster-button')
    fireEvent.click(refreshButton)
    expect(onRefreshCluster).toHaveBeenCalledTimes(1)
  })

  it('prevents card click when action buttons are clicked', () => {
    const onSelectCluster = vi.fn()
    const onRenameCluster = vi.fn()
    const { getByTestId } = render(
      <ClusterCardFull {...defaultProps} onSelectCluster={onSelectCluster} onRenameCluster={onRenameCluster} />
    )
    const renameButton = getByTestId('rename-cluster-button')
    fireEvent.click(renameButton)
    expect(onRenameCluster).toHaveBeenCalledTimes(1)
    expect(onSelectCluster).not.toHaveBeenCalled()
  })

  it('renders GPU info when provided', () => {
    const gpuInfo = { total: 8, allocated: 4 }
    const { container } = render(<ClusterCardFull {...defaultProps} gpuInfo={gpuInfo} />)
    expect(container.textContent).toMatch(/4.*\/.*8/)
  })

  it('renders drag handle when provided', () => {
    const dragHandle = <div data-testid="drag-handle">Drag</div>
    const { getByTestId } = render(<ClusterCardFull {...defaultProps} dragHandle={dragHandle} />)
    expect(getByTestId('drag-handle')).toBeTruthy()
  })

  it('displays node count and namespace count', () => {
    const { container } = render(<ClusterCardFull {...defaultProps} />)
    expect(container.textContent).toMatch(/5/)
    expect(container.textContent).toMatch(/2/)
  })

  it('renders remove button when onRemoveCluster is provided', () => {
    const { getByTestId } = render(<ClusterCardFull {...defaultProps} />)
    expect(getByTestId('remove-cluster-button')).toBeTruthy()
  })

  it('does not render remove button when onRemoveCluster is not provided', () => {
    const { queryByTestId } = render(
      <ClusterCardFull {...defaultProps} onRemoveCluster={undefined} />
    )
    expect(queryByTestId('remove-cluster-button')).toBeNull()
  })

  it('has accessible button role and label', () => {
    const { container } = render(<ClusterCardFull {...defaultProps} />)
    const button = container.querySelector('[role="button"]')
    expect(button).toBeTruthy()
    expect(button?.getAttribute('aria-label')).toBe('Select cluster prod-context')
    expect(button?.getAttribute('tabIndex')).toBe('0')
  })

  it('renders cloud provider icon', () => {
    const { getByTestId } = render(<ClusterCardFull {...defaultProps} />)
    expect(getByTestId('cloud-provider-icon')).toBeTruthy()
  })
})
