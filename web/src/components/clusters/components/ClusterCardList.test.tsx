import React from 'react'
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

vi.mock('../../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: () => <div data-testid="cloud-provider-icon" />,
  detectCloudProvider: () => 'kubernetes',
  getProviderColor: () => '#326ce5',
}))

vi.mock('../../ui/FlashingValue', () => ({
  FlashingValue: ({ value }: { value: unknown }) => <span>{String(value ?? '')}</span>,
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

import { ClusterCardList } from './ClusterCardList'

describe('ClusterCardList', () => {
  const mockCluster: ClusterInfo = {
    name: 'staging-cluster',
    context: 'staging-context',
    server: 'https://staging.example.com',
    healthy: true,
    nodeCount: 4,
    podCount: 20,
    namespaces: ['default'],
    aliases: [],
  }

  const defaultProps = {
    cluster: mockCluster,
    isConnected: true,
    permissionsLoading: false,
    isClusterAdmin: true,
    onSelectCluster: vi.fn(),
    onRefreshCluster: vi.fn(),
    onRemoveCluster: vi.fn(),
  }

  it('renders cluster card in list layout', () => {
    const { getByText } = render(<ClusterCardList {...defaultProps} />)
    expect(getByText('staging-context')).toBeTruthy()
  })

  it('calls onSelectCluster when clicked', () => {
    const onSelectCluster = vi.fn()
    const { container } = render(<ClusterCardList {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = container.querySelector('[role="button"]')
    fireEvent.click(card!)
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onRefreshCluster when refresh button is clicked', () => {
    const onRefreshCluster = vi.fn()
    const { getByLabelText } = render(<ClusterCardList {...defaultProps} onRefreshCluster={onRefreshCluster} />)
    const refreshButton = getByLabelText('common.refresh')
    fireEvent.click(refreshButton)
    expect(onRefreshCluster).toHaveBeenCalledTimes(1)
  })

  it('renders GPU info when provided', () => {
    const gpuInfo = { total: 6, allocated: 3 }
    const { container } = render(<ClusterCardList {...defaultProps} gpuInfo={gpuInfo} />)
    expect(container.textContent).toContain('6')
  })

  it('renders drag handle when provided', () => {
    const dragHandle = <div data-testid="drag-handle">Drag</div>
    const { getByTestId } = render(<ClusterCardList {...defaultProps} dragHandle={dragHandle} />)
    expect(getByTestId('drag-handle')).toBeTruthy()
  })

  it('displays node and pod counts', () => {
    const { container } = render(<ClusterCardList {...defaultProps} />)
    expect(container.textContent).toContain('4')
    expect(container.textContent).toContain('20')
  })

  it('renders local cluster controls for supported providers', () => {
    const clusterWithLocalProvider = {
      ...mockCluster,
      distribution: 'kind',
    }
    const { getByTestId } = render(
      <ClusterCardList {...defaultProps} cluster={clusterWithLocalProvider} />
    )
    expect(getByTestId('local-cluster-controls')).toBeTruthy()
  })

  it('does not render remove button when cluster is reachable', () => {
    // RemoveClusterButton only renders when isConnected && unreachable
    const { queryByTestId } = render(<ClusterCardList {...defaultProps} />)
    expect(queryByTestId('remove-cluster-button')).toBeNull()
  })

  it('has accessible button role and label', () => {
    const { container } = render(<ClusterCardList {...defaultProps} />)
    const button = container.querySelector('[role="button"]')
    expect(button).toBeTruthy()
    expect(button?.getAttribute('aria-label')).toBe('Select cluster staging-context')
    expect(button?.getAttribute('tabIndex')).toBe('0')
  })

  it('renders cloud provider icon', () => {
    const { getAllByTestId } = render(<ClusterCardList {...defaultProps} />)
    expect(getAllByTestId('cloud-provider-icon').length).toBeGreaterThan(0)
  })
})
