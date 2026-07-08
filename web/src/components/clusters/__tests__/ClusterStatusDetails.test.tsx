import React from 'react'
/**
 * ClusterStatusDetails Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ClusterInfo } from '../../../hooks/mcp/types'

vi.mock('lucide-react', () => ({
  AlertCircle: () => <span data-testid="alert-circle-icon" />,
  Clock: () => <span data-testid="clock-icon" />,
  Globe: () => <span data-testid="globe-icon" />,
  Lock: () => <span data-testid="lock-icon" />,
  ShieldAlert: () => <span data-testid="shield-alert-icon" />,
  WifiOff: () => <span data-testid="wifi-off-icon" />,
  XCircle: () => <span data-testid="x-circle-icon" />,
}))

vi.mock('../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../../lib/errorClassifier', () => ({
  formatLastSeen: (timestamp: string | Date | undefined) => {
    if (!timestamp) return 'never'
    return '5m ago'
  },
  getSuggestionForErrorType: (errorType: string) => {
    const suggestions: Record<string, string> = {
      auth: 'Re-authenticate with the cluster',
      certificate: 'Check certificate validity or trust settings',
      network: 'Check network connectivity and firewall settings',
      timeout: 'Check VPN connection or network connectivity',
    }
    return suggestions[errorType] || 'Check cluster connectivity and configuration'
  },
}))

vi.mock('../utils', () => ({
  getClusterHealthState: (cluster: ClusterInfo) => {
    if (cluster.neverConnected) return 'unknown'
    if (cluster.healthUnknown) return 'unknown'
    if (cluster.reachable === false) return 'unreachable'
    if (cluster.healthy === true) return 'healthy'
    if (cluster.healthy === false) return 'unhealthy'
    return 'unknown'
  },
  isClusterUnreachable: (cluster: ClusterInfo) => {
    return cluster.reachable === false || !!cluster.errorType
  },
}))

import { ClusterStatusDetails } from '../ClusterStatusDetails'

const createMockCluster = (overrides: Partial<ClusterInfo> = {}): ClusterInfo => ({
  name: 'test-cluster',
  server: 'https://test.example.com',
  healthy: true,
  namespaces: [],
  ...overrides,
})

describe('ClusterStatusDetails', () => {
  it('renders nothing when no diagnostic fields are present', () => {
    const cluster = createMockCluster({ healthy: true })
    const { container } = render(<ClusterStatusDetails cluster={cluster} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders unreachable reason with auth error', () => {
    const cluster = createMockCluster({
      reachable: false,
      errorType: 'auth',
      errorMessage: 'Authentication failed',
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText(/Unreachable: Auth/)).toBeInTheDocument()
    expect(screen.getByText('Authentication failed')).toBeInTheDocument()
    expect(screen.getByText(/Suggestion: Re-authenticate with the cluster/)).toBeInTheDocument()
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument()
  })

  it('renders unreachable reason with certificate error', () => {
    const cluster = createMockCluster({
      reachable: false,
      errorType: 'certificate',
      errorMessage: 'Certificate validation failed',
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText(/Unreachable: Certificate/)).toBeInTheDocument()
    expect(screen.getByText('Certificate validation failed')).toBeInTheDocument()
    expect(screen.getByTestId('shield-alert-icon')).toBeInTheDocument()
  })

  it('renders unreachable reason with network error', () => {
    const cluster = createMockCluster({
      reachable: false,
      errorType: 'network',
      errorMessage: 'Network unreachable',
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText(/Unreachable: Network/)).toBeInTheDocument()
    expect(screen.getByTestId('x-circle-icon')).toBeInTheDocument()
  })

  it('renders unreachable reason with timeout error', () => {
    const cluster = createMockCluster({
      reachable: false,
      errorType: 'timeout',
      errorMessage: 'Connection timeout',
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText(/Unreachable: Timeout/)).toBeInTheDocument()
    expect(screen.getByTestId('wifi-off-icon')).toBeInTheDocument()
  })

  it('renders unreachable reason with unknown error type', () => {
    const cluster = createMockCluster({
      reachable: false,
      errorMessage: 'Unknown error occurred',
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText(/Unreachable: Unknown/)).toBeInTheDocument()
    expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument()
  })

  it('renders never connected state', () => {
    const cluster = createMockCluster({
      neverConnected: true,
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText('Never connected')).toBeInTheDocument()
    expect(screen.getByText(/No successful health probe since startup/)).toBeInTheDocument()
  })

  it('renders health unknown state', () => {
    const cluster = createMockCluster({
      healthUnknown: true,
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText('Health unknown')).toBeInTheDocument()
    expect(screen.getByText(/No authoritative health signal yet/)).toBeInTheDocument()
  })

  it('renders external reachability when reachable', () => {
    const cluster = createMockCluster({
      externallyReachable: true,
      lastSeen: new Date().toISOString(),
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText('External reachability:')).toBeInTheDocument()
    expect(screen.getByText('Reachable')).toBeInTheDocument()
  })

  it('renders external reachability when not reachable', () => {
    const cluster = createMockCluster({
      externallyReachable: false,
      lastSeen: new Date().toISOString(),
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText('External reachability:')).toBeInTheDocument()
    expect(screen.getByText('Not reachable from outside')).toBeInTheDocument()
  })

  it('renders last seen timestamp', () => {
    const cluster = createMockCluster({
      lastSeen: new Date().toISOString(),
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText('Last seen:')).toBeInTheDocument()
    expect(screen.getByText('5m ago')).toBeInTheDocument()
    expect(screen.getByTestId('clock-icon')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const cluster = createMockCluster({
      lastSeen: new Date().toISOString(),
    })
    const { container } = render(
      <ClusterStatusDetails cluster={cluster} className="custom-class" />
    )
    
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('renders multiple fields together', () => {
    const cluster = createMockCluster({
      externallyReachable: true,
      lastSeen: new Date().toISOString(),
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    expect(screen.getByText('External reachability:')).toBeInTheDocument()
    expect(screen.getByText('Last seen:')).toBeInTheDocument()
  })

  it('prioritizes unreachable reason over never connected', () => {
    const cluster = createMockCluster({
      neverConnected: true,
      reachable: false,
      errorType: 'timeout',
      errorMessage: 'Connection timeout',
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    // Should show unreachable reason, not never connected
    expect(screen.getByText(/Unreachable: Timeout/)).toBeInTheDocument()
    expect(screen.queryByText('Never connected')).not.toBeInTheDocument()
  })

  it('prioritizes unreachable reason over health unknown', () => {
    const cluster = createMockCluster({
      healthUnknown: true,
      reachable: false,
      errorType: 'network',
      errorMessage: 'Network error',
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    // Should show unreachable reason, not health unknown
    expect(screen.getByText(/Unreachable: Network/)).toBeInTheDocument()
    expect(screen.queryByText('Health unknown')).not.toBeInTheDocument()
  })

  it('renders with status role and aria-label', () => {
    const cluster = createMockCluster({
      lastSeen: new Date().toISOString(),
    })
    render(<ClusterStatusDetails cluster={cluster} />)
    
    const statusPanel = screen.getByRole('status')
    expect(statusPanel).toHaveAttribute('aria-label', 'Cluster status details')
  })
})
