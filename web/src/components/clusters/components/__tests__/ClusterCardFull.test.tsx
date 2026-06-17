import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClusterCardFull } from '../ClusterCardFull'
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

describe('ClusterCardFull', () => {
  const defaultProps = {
    cluster: createMockCluster(),
    isConnected: true,
    permissionsLoading: false,
    isClusterAdmin: true,
    onSelectCluster: vi.fn(),
    onRenameCluster: vi.fn(),
    onRefreshCluster: vi.fn(),
    onRemoveCluster: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders cluster name', () => {
    render(<ClusterCardFull {...defaultProps} />)
    expect(screen.getByText('test-cluster')).toBeInTheDocument()
  })

  it('renders cluster stats', () => {
    const cluster = createMockCluster({
      nodeCount: 5,
      cpuCores: 20,
      podCount: 100,
    })
    const gpuInfo = createMockGPUInfo({ total: 8 })
    render(<ClusterCardFull {...defaultProps} cluster={cluster} gpuInfo={gpuInfo} />)
    
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('calls onSelectCluster when card is clicked', () => {
    const onSelectCluster = vi.fn()
    render(<ClusterCardFull {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = screen.getByRole('button', { name: /Select cluster test-context/i })
    fireEvent.click(card)
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onRefreshCluster when refresh button is clicked', () => {
    const onRefreshCluster = vi.fn()
    render(<ClusterCardFull {...defaultProps} onRefreshCluster={onRefreshCluster} />)
    const refreshButton = screen.getByRole('button', { name: /common.refreshClusterData/i })
    fireEvent.click(refreshButton)
    expect(onRefreshCluster).toHaveBeenCalledTimes(1)
  })

  it('disables refresh button when cluster is unreachable', () => {
    const cluster = createMockCluster({ healthy: false, unreachable: true })
    const onRefreshCluster = vi.fn()
    render(<ClusterCardFull {...defaultProps} cluster={cluster} onRefreshCluster={onRefreshCluster} />)
    const refreshButton = screen.getByRole('button', { name: /cluster.controlsDisabledOffline/i })
    expect(refreshButton).toBeDisabled()
  })

  it('renders drag handle when provided', () => {
    const dragHandle = <div data-testid="drag-handle">Drag</div>
    render(<ClusterCardFull {...defaultProps} dragHandle={dragHandle} />)
    expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
  })
})
