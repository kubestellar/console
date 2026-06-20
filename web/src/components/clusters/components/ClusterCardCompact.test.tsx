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
  isClusterUnreachable: () => false,
}))

vi.mock('../../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: () => <div data-testid="cloud-provider-icon" />,
  detectCloudProvider: () => 'kubernetes',
  getProviderColor: () => '#326ce5',
}))

vi.mock('./ClusterTokenRefresh', () => ({
  isTokenExpired: () => false,
}))

vi.mock('../../ui/FlashingValue', () => ({
  FlashingValue: ({ value }: { value: unknown }) => <span>{String(value ?? '')}</span>,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: () => <div data-testid="status-badge" />,
}))

vi.mock('./ClusterGrid.common', () => ({
  RemoveClusterButton: () => <button data-testid="remove-cluster-button">Remove</button>,
  handleCardKeyDown: (callback: () => void) => (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      callback()
    }
  },
}))

import { ClusterCardCompact } from './ClusterCardCompact'

describe('ClusterCardCompact', () => {
  const mockCluster: ClusterInfo = {
    name: 'test-cluster',
    context: 'test-context',
    server: 'https://test.example.com',
    healthy: true,
    nodeCount: 3,
    namespaces: [],
    aliases: [],
  }

  const defaultProps = {
    cluster: mockCluster,
    isConnected: true,
    onSelectCluster: vi.fn(),
    onRemoveCluster: vi.fn(),
  }

  it('renders cluster card with cluster name', () => {
    const { getByText } = render(<ClusterCardCompact {...defaultProps} />)
    expect(getByText('test-context')).toBeTruthy()
  })

  it('calls onSelectCluster when clicked', () => {
    const onSelectCluster = vi.fn()
    const { container } = render(<ClusterCardCompact {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = container.querySelector('[role="button"]')
    fireEvent.click(card!)
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectCluster when Enter key is pressed', () => {
    const onSelectCluster = vi.fn()
    const { container } = render(<ClusterCardCompact {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = container.querySelector('[role="button"]')
    fireEvent.keyDown(card!, { key: 'Enter' })
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectCluster when Space key is pressed', () => {
    const onSelectCluster = vi.fn()
    const { container } = render(<ClusterCardCompact {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = container.querySelector('[role="button"]')
    fireEvent.keyDown(card!, { key: ' ' })
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('renders GPU info when provided', () => {
    const gpuInfo = { total: 4, allocated: 2 }
    const { container } = render(<ClusterCardCompact {...defaultProps} gpuInfo={gpuInfo} />)
    expect(container.textContent).toMatch(/4/)
  })

  it('renders drag handle when provided', () => {
    const dragHandle = <div data-testid="drag-handle">Drag</div>
    const { getByTestId } = render(<ClusterCardCompact {...defaultProps} dragHandle={dragHandle} />)
    expect(getByTestId('drag-handle')).toBeTruthy()
  })

  it('displays node count when available', () => {
    const { container } = render(<ClusterCardCompact {...defaultProps} />)
    expect(container.textContent).toMatch(/3/)
  })

  it('has accessible button role and label', () => {
    const { container } = render(<ClusterCardCompact {...defaultProps} />)
    const button = container.querySelector('[role="button"]')
    expect(button).toBeTruthy()
    expect(button?.getAttribute('aria-label')).toBe('Select cluster test-context')
    expect(button?.getAttribute('tabIndex')).toBe('0')
  })
})
