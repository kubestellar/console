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
    render(<ClusterCardList {...defaultProps} cluster={cluster} />)
    
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('calls onSelectCluster when card is clicked', () => {
    const onSelectCluster = vi.fn()
    render(<ClusterCardList {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = screen.getByRole('button', { name: /Select cluster test-context/i })
    fireEvent.click(card)
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onRefreshCluster when refresh button is clicked', () => {
    const onRefreshCluster = vi.fn()
    render(<ClusterCardList {...defaultProps} onRefreshCluster={onRefreshCluster} />)
    const refreshButton = screen.getByRole('button', { name: /common.refreshClusterData/i })
    fireEvent.click(refreshButton)
    expect(onRefreshCluster).toHaveBeenCalledTimes(1)
  })

  it('disables refresh button when cluster is unreachable', () => {
    const cluster = createMockCluster({ healthy: false, reachable: false, errorType: 'network' })
    render(<ClusterCardList {...defaultProps} cluster={cluster} />)
    const refreshButton = screen.getAllByRole('button', { name: /cluster.controlsDisabledOffline/i }).find(el => el.tagName === 'BUTTON')!
    expect(refreshButton).toBeDisabled()
  })

  it('renders drag handle when provided', () => {
    const dragHandle = <div data-testid="drag-handle">Drag</div>
    render(<ClusterCardList {...defaultProps} dragHandle={dragHandle} />)
    expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
  })
})
