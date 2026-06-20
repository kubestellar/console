import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClusterCardCompact } from '../ClusterCardCompact'
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

describe('ClusterCardCompact', () => {
  const defaultProps = {
    cluster: createMockCluster(),
    isConnected: true,
    onSelectCluster: vi.fn(),
    onRemoveCluster: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders cluster name', () => {
    render(<ClusterCardCompact {...defaultProps} />)
    expect(screen.getByText('test-context')).toBeInTheDocument()
  })

  it('renders cluster stats (nodes, CPU, pods, GPU)', () => {
    const cluster = createMockCluster({
      nodeCount: 5,
      cpuCores: 20,
      podCount: 100,
    })
    const gpuInfo = createMockGPUInfo({ total: 8 })
    render(<ClusterCardCompact {...defaultProps} cluster={cluster} gpuInfo={gpuInfo} />)
    
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('displays healthy indicator for healthy cluster', () => {
    const cluster = createMockCluster({ healthy: true })
    const { container } = render(<ClusterCardCompact {...defaultProps} cluster={cluster} />)
    const healthyIndicator = container.querySelector('.bg-green-400')
    expect(healthyIndicator).toBeInTheDocument()
  })

  it('displays unreachable icon for offline cluster', () => {
    const cluster = createMockCluster({ healthy: false, unreachable: true })
    const { container } = render(<ClusterCardCompact {...defaultProps} cluster={cluster} />)
    expect(container.querySelector('[class*="WifiOff"]')).toBeTruthy()
  })

  it('displays alert icon for unhealthy cluster', () => {
    const cluster = createMockCluster({ healthy: false, unreachable: false })
    const { container } = render(<ClusterCardCompact {...defaultProps} cluster={cluster} />)
    expect(container.querySelector('[class*="AlertCircle"]')).toBeTruthy()
  })

  it('displays token expired icon when token is expired', () => {
    const cluster = createMockCluster({ tokenExpiry: new Date('2020-01-01').toISOString() })
    const { container } = render(<ClusterCardCompact {...defaultProps} cluster={cluster} />)
    expect(container.querySelector('[class*="KeyRound"]')).toBeTruthy()
  })

  it('displays current cluster star icon', () => {
    const cluster = createMockCluster({ isCurrent: true })
    const { container } = render(<ClusterCardCompact {...defaultProps} cluster={cluster} />)
    expect(container.querySelector('[class*="Star"]')).toBeTruthy()
  })

  it('displays alias badge when cluster has aliases', () => {
    const cluster = createMockCluster({ aliases: ['alias1', 'alias2'] })
    render(<ClusterCardCompact {...defaultProps} cluster={cluster} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('calls onSelectCluster when card is clicked', () => {
    const onSelectCluster = vi.fn()
    render(<ClusterCardCompact {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = screen.getByRole('button', { name: /Select cluster test-context/i })
    fireEvent.click(card)
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectCluster when Enter key is pressed', () => {
    const onSelectCluster = vi.fn()
    render(<ClusterCardCompact {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = screen.getByRole('button', { name: /Select cluster test-context/i })
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectCluster when Space key is pressed', () => {
    const onSelectCluster = vi.fn()
    render(<ClusterCardCompact {...defaultProps} onSelectCluster={onSelectCluster} />)
    const card = screen.getByRole('button', { name: /Select cluster test-context/i })
    fireEvent.keyDown(card, { key: ' ' })
    expect(onSelectCluster).toHaveBeenCalledTimes(1)
  })

  it('displays remove button for unreachable kubeconfig clusters', () => {
    const cluster = createMockCluster({
      reachable: false,
      errorType: 'network',
      source: 'kubeconfig',
    })
    render(<ClusterCardCompact {...defaultProps} cluster={cluster} />)
    expect(screen.getByTestId('remove-cluster-button')).toBeInTheDocument()
  })

  it('does not display remove button for healthy clusters', () => {
    const cluster = createMockCluster({ healthy: true, unreachable: false })
    render(<ClusterCardCompact {...defaultProps} cluster={cluster} />)
    expect(screen.queryByTestId('remove-cluster-button')).not.toBeInTheDocument()
  })

  it('displays dash for stats when cluster data is not loaded', () => {
    const cluster = createMockCluster({
      nodeCount: undefined,
      cpuCores: undefined,
      podCount: undefined,
    })
    render(<ClusterCardCompact {...defaultProps} cluster={cluster} />)
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('renders drag handle when provided', () => {
    const dragHandle = <div data-testid="drag-handle">Drag</div>
    render(<ClusterCardCompact {...defaultProps} dragHandle={dragHandle} />)
    expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
  })

  it('displays GPU count of 0 when no GPUs are present', () => {
    const cluster = createMockCluster({ nodeCount: 3, cpuCores: 12, podCount: 50 })
    render(<ClusterCardCompact {...defaultProps} cluster={cluster} gpuInfo={undefined} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
