import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterStatusDetails } from './ClusterStatusDetails'
import type { ClusterInfo } from '../../hooks/mcp/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('ClusterStatusDetails', () => {
  it('returns null when cluster has no diagnostic fields', () => {
    const cluster = {
      name: 'test-cluster',
      healthy: true,
      reachable: true,
      errorType: undefined,
      errorMessage: undefined,
      lastSeen: undefined,
      externallyReachable: undefined,
      neverConnected: false,
    } as ClusterInfo

    const { container } = render(<ClusterStatusDetails cluster={cluster} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders unreachable reason with auth error', () => {
    const cluster = {
      name: 'test-cluster',
      reachable: false,
      errorType: 'auth',
      errorMessage: 'authentication failed',
    } as ClusterInfo

    render(<ClusterStatusDetails cluster={cluster} />)
    expect(screen.getByText(/Unreachable: Auth/)).toBeInTheDocument()
    expect(screen.getByText('authentication failed')).toBeInTheDocument()
  })

  it('renders unreachable reason with network error', () => {
    const cluster = {
      name: 'test-cluster',
      reachable: false,
      errorType: 'network',
      errorMessage: 'connection refused',
    } as ClusterInfo

    render(<ClusterStatusDetails cluster={cluster} />)
    expect(screen.getByText(/Unreachable: Network/)).toBeInTheDocument()
  })

  it('renders never connected status', () => {
    const cluster = {
      name: 'test-cluster',
      neverConnected: true,
    } as ClusterInfo

    render(<ClusterStatusDetails cluster={cluster} />)
    expect(screen.getByText('Never connected')).toBeInTheDocument()
  })

  it('renders external reachability when reachable', () => {
    const cluster = {
      name: 'test-cluster',
      externallyReachable: true,
    } as ClusterInfo

    render(<ClusterStatusDetails cluster={cluster} />)
    expect(screen.getByText('External reachability:')).toBeInTheDocument()
    expect(screen.getByText('Reachable')).toBeInTheDocument()
  })

  it('renders last seen timestamp', () => {
    const cluster = {
      name: 'test-cluster',
      lastSeen: '2026-06-17T10:00:00Z',
    } as ClusterInfo

    render(<ClusterStatusDetails cluster={cluster} />)
    expect(screen.getByText('Last seen:')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const cluster = {
      name: 'test-cluster',
      lastSeen: '2026-06-17T10:00:00Z',
    } as ClusterInfo

    const { container } = render(
      <ClusterStatusDetails cluster={cluster} className="custom-class" />,
    )
    const statusDiv = container.querySelector('.custom-class')
    expect(statusDiv).toBeInTheDocument()
  })
})
