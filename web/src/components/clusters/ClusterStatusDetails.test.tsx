import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ClusterInfo } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../utils', () => ({
  getClusterHealthState: () => 'healthy',
  isClusterUnreachable: () => false,
}))

vi.mock('../../../lib/errorClassifier', () => ({
  formatLastSeen: () => 'Just now',
  getSuggestionForErrorType: () => 'Check your connection',
}))

import { ClusterStatusDetails } from './ClusterStatusDetails'

describe('ClusterStatusDetails', () => {
  const mockCluster: ClusterInfo = {
    name: 'test-cluster',
    context: 'test-context',
    server: 'https://test.example.com',
    healthy: true,
    namespaces: [],
    aliases: [],
  }

  it('renders without crashing', () => {
    const { container } = render(<ClusterStatusDetails cluster={mockCluster} />)
    expect(container).toBeTruthy()
  })

  it('displays error type when present', () => {
    const clusterWithError = {
      ...mockCluster,
      errorType: 'auth' as const,
      healthy: false,
    }
    const { container } = render(<ClusterStatusDetails cluster={clusterWithError} />)
    expect(container.textContent).toMatch(/Auth/)
  })

  it('displays certificate error icon for certificate errors', () => {
    const clusterWithCertError = {
      ...mockCluster,
      errorType: 'certificate' as const,
      healthy: false,
    }
    const { container } = render(<ClusterStatusDetails cluster={clusterWithCertError} />)
    expect(container).toBeTruthy()
  })

  it('displays network error icon for network errors', () => {
    const clusterWithNetError = {
      ...mockCluster,
      errorType: 'network' as const,
      healthy: false,
    }
    const { container } = render(<ClusterStatusDetails cluster={clusterWithNetError} />)
    expect(container).toBeTruthy()
  })

  it('displays timeout error icon for timeout errors', () => {
    const clusterWithTimeoutError = {
      ...mockCluster,
      errorType: 'timeout' as const,
      healthy: false,
    }
    const { container } = render(<ClusterStatusDetails cluster={clusterWithTimeoutError} />)
    expect(container).toBeTruthy()
  })

  it('applies custom className when provided', () => {
    const { container } = render(<ClusterStatusDetails cluster={mockCluster} className="custom-class" />)
    expect(container.querySelector('.custom-class')).toBeTruthy()
  })

  it('shows unreachable reason when cluster is unreachable', () => {
    const unreachableCluster = {
      ...mockCluster,
      reachable: false,
      unreachableReason: 'Network timeout',
    }
    const { container } = render(<ClusterStatusDetails cluster={unreachableCluster} />)
    expect(container.textContent).toMatch(/Network timeout/)
  })

  it('shows external reachability status', () => {
    const externalCluster = {
      ...mockCluster,
      externalReachable: true,
    }
    const { container } = render(<ClusterStatusDetails cluster={externalCluster} />)
    expect(container).toBeTruthy()
  })

  it('shows last seen timestamp when available', () => {
    const clusterWithLastSeen = {
      ...mockCluster,
      lastSeen: new Date().toISOString(),
    }
    const { container } = render(<ClusterStatusDetails cluster={clusterWithLastSeen} />)
    expect(container.textContent).toMatch(/Just now/)
  })

  it('shows suggestion for error type when available', () => {
    const clusterWithError = {
      ...mockCluster,
      errorType: 'auth' as const,
      healthy: false,
    }
    const { container } = render(<ClusterStatusDetails cluster={clusterWithError} />)
    expect(container.textContent).toMatch(/Check your connection/)
  })
})
