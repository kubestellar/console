import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClusterCardList } from '../ClusterCardList'
import type { ClusterInfo, GPUInfo } from '../../../../hooks/mcp/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const createMockCluster = (overrides?: Partial<ClusterInfo>): ClusterInfo => ({
  name: 'test-cluster',
  server: 'https://test.example.com',
  context: 'test-context',
  namespaces: [],
  user: 'test-user',
  healthy: true,
  nodeCount: 3,
  cpuCores: 12,
  podCount: 50,
  ...overrides,
})

const createMockGPUInfo = (overrides?: Partial<GPUInfo>): GPUInfo => ({
  total: 4,
  allocated: 2,
  free: 2,
  ...overrides,
})

describe('ClusterCardList', () => {
  const defaultProps = {
    cluster: createMockCluster(),
    isConnected: true,
    permissionsLoading: false,
    isClusterAdmin: true,
    onSelectCluster: vi.fn(),
    onRefreshCluster: vi.fn(),
    onRemoveCluster: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders cluster name', () => {
    render(<ClusterCardList {...defaultProps} />)
    expect(screen.getByText('test-context')).toBeInTheDocument()
  })

  it('renders cluster stats', () => {
    const cluster = createMockCluster({
      nodeCount: 5,
      cpuCores: 20,
      podCount: 100,
    })
    const gpuInfo = createMockGPUInfo({ total: 8, allocated: 6 })
    render(<ClusterCardList {...defaultProps} cluster={cluster} gpuInfo={gpuInfo} />)
    
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('displays healthy status indicator for healthy cluster', () => {
    const cluster = createMockCluster({ healthy: true })
    render(<ClusterCardList {...defaultProps} cluster={cluster} />)
    expect(screen.getByRole('button', { name: /Select cluster test-context/i })).toBeInTheDocument()
  })

  it('displays unreachable icon for offline cluster', () => {
    const cluster = createMockCluster({ healthy: false, reachable: false })
    const { container } = render(<ClusterCardList {...defaultProps} cluster={cluster} />)
    expect(container.querySelector('[class*="lucide-wifi-off"]')).toBeTruthy()
  })

  it('displays token expired icon when token is expired', () => {
    const cluster = createMockCluster({ errorType: 'auth' })
    const { container } = render(<ClusterCardList {...defaultProps} cluster={cluster} />)
    expect(container.querySelector('[class*="lucide-key-round"]')).toBeTruthy()
  })

  it('calls onSelectCluster when card is clicked', () => {
    const onSelectCluster = vi.fn()
    render(<ClusterCardList {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = screen.getByRole('button', { name: /Select cluster test-context/i })
    fireEvent.click(card)
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectCluster on Enter key press', () => {
    const onSelectCluster = vi.fn()
    render(<ClusterCardList {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = screen.getByRole('button', { name: /Select cluster test-context/i })
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onRefreshCluster when refresh button is clicked', () => {
    const onRefreshCluster = vi.fn()
    render(<ClusterCardList {...defaultProps} onRefreshCluster={onRefreshCluster} />)
    const refreshButton = screen.getAllByRole('button', { name: /common\.refresh/i }).find(el => el.tagName === 'BUTTON')!
    fireEvent.click(refreshButton)
    expect(onRefreshCluster).toHaveBeenCalledTimes(1)
  })

  it('disables refresh button when cluster is unreachable', () => {
    const cluster = createMockCluster({ healthy: false, reachable: false })
    const onRefreshCluster = vi.fn()
    render(<ClusterCardList {...defaultProps} cluster={cluster} onRefreshCluster={onRefreshCluster} />)
    const refreshButton = screen.getAllByRole('button', { name: /cluster\.controlsDisabledOffline/i }).find(el => el.tagName === 'BUTTON')!
    expect(refreshButton).toBeDisabled()
  })

  it('displays current cluster star icon', () => {
    const cluster = createMockCluster({ isCurrent: true })
    const { container } = render(<ClusterCardList {...defaultProps} cluster={cluster} />)
    expect(container.querySelector('[class*="lucide-star"]')).toBeTruthy()
  })

  it('displays alias badge when cluster has aliases', () => {
    const cluster = createMockCluster({ aliases: ['alias1', 'alias2'] })
    render(<ClusterCardList {...defaultProps} cluster={cluster} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders drag handle when provided', () => {
    const dragHandle = <div data-testid="drag-handle">Drag</div>
    render(<ClusterCardList {...defaultProps} dragHandle={dragHandle} />)
    expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
  })

  it('displays loading state for initial load', () => {
    const cluster = createMockCluster({
      nodeCount: undefined,
      cpuCores: undefined,
      podCount: undefined,
      loading: true,
    })
    render(<ClusterCardList {...defaultProps} cluster={cluster} />)
    // Loading indicator should be present — multiple fields show '-'
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1)
  })
})
