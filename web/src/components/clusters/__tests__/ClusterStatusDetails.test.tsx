/**
 * ClusterStatusDetails Component Tests
 *
 * Tests the compact diagnostic panel that surfaces unreachable reason,
 * external reachability, and last-seen timestamp for a cluster.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ClusterInfo } from '../../../hooks/mcp/types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/errorClassifier', () => ({
  formatLastSeen: (ts: string) => `seen:${ts}`,
  getSuggestionForErrorType: (type: string) => `suggestion-for-${type}`,
}))

vi.mock('./utils', () => ({
  getClusterHealthState: vi.fn((c: ClusterInfo) => {
    if (c.neverConnected) return 'unknown'
    if (c.healthUnknown) return 'unknown'
    if (c.reachable === false) return 'unreachable'
    if (c.healthy === true) return 'healthy'
    return 'loading'
  }),
  isClusterUnreachable: vi.fn((c: ClusterInfo) => {
    if (c.reachable === false) return true
    if (c.errorType && ['timeout', 'network', 'certificate', 'auth'].includes(c.errorType)) return true
    return false
  }),
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { ClusterStatusDetails } from '../ClusterStatusDetails'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'test-cluster',
    context: 'test-context',
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ClusterStatusDetails', () => {
  it('returns null when no diagnostic data is available', () => {
    const { container } = render(
      <ClusterStatusDetails cluster={makeCluster({ healthy: true, reachable: true })} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders unreachable status for auth error', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ reachable: false, errorType: 'auth' })}
      />,
    )
    expect(screen.getByText(/Unreachable: Auth/i)).toBeTruthy()
  })

  it('renders unreachable status for certificate error', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ reachable: false, errorType: 'certificate' })}
      />,
    )
    expect(screen.getByText(/Unreachable: Certificate/i)).toBeTruthy()
  })

  it('renders unreachable status for network error', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ reachable: false, errorType: 'network' })}
      />,
    )
    expect(screen.getByText(/Unreachable: Network/i)).toBeTruthy()
  })

  it('renders unreachable status for timeout error', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ reachable: false, errorType: 'timeout' })}
      />,
    )
    expect(screen.getByText(/Unreachable: Timeout/i)).toBeTruthy()
  })

  it('renders unreachable status with Unknown label when no errorType', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ reachable: false, errorMessage: 'some error' })}
      />,
    )
    expect(screen.getByText(/Unreachable: Unknown/i)).toBeTruthy()
  })

  it('displays the suggestion for a known error type', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ reachable: false, errorType: 'network' })}
      />,
    )
    expect(screen.getByText(/suggestion-for-network/i)).toBeTruthy()
  })

  it('displays the errorMessage when present', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ reachable: false, errorType: 'auth', errorMessage: 'token expired' })}
      />,
    )
    expect(screen.getByText('token expired')).toBeTruthy()
  })

  it('renders never connected status', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ neverConnected: true })}
      />,
    )
    expect(screen.getByText('Never connected')).toBeTruthy()
  })

  it('renders health unknown status', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ healthUnknown: true })}
      />,
    )
    expect(screen.getByText('Health unknown')).toBeTruthy()
  })

  it('displays "Reachable" when externallyReachable is true', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ externallyReachable: true })}
      />,
    )
    expect(screen.getByText('Reachable')).toBeTruthy()
    expect(screen.getByText(/External reachability:/i)).toBeTruthy()
  })

  it('displays "Not reachable from outside" when externallyReachable is false', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ externallyReachable: false })}
      />,
    )
    expect(screen.getByText('Not reachable from outside')).toBeTruthy()
  })

  it('renders last seen timestamp via formatLastSeen', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({ lastSeen: '2024-01-01T00:00:00Z' })}
      />,
    )
    expect(screen.getByText('seen:2024-01-01T00:00:00Z')).toBeTruthy()
    expect(screen.getByText(/Last seen:/i)).toBeTruthy()
  })

  it('handles multiple diagnostic fields together', () => {
    render(
      <ClusterStatusDetails
        cluster={makeCluster({
          reachable: false,
          errorType: 'timeout',
          externallyReachable: false,
          lastSeen: '2024-06-01T12:00:00Z',
        })}
      />,
    )
    expect(screen.getByText(/Unreachable: Timeout/i)).toBeTruthy()
    expect(screen.getByText('Not reachable from outside')).toBeTruthy()
    expect(screen.getByText('seen:2024-06-01T12:00:00Z')).toBeTruthy()
  })

  it('applies a custom className to the container', () => {
    const { container } = render(
      <ClusterStatusDetails
        cluster={makeCluster({ lastSeen: '2024-01-01T00:00:00Z' })}
        className="my-custom-class"
      />,
    )
    expect((container.firstChild as HTMLElement).className).toContain('my-custom-class')
  })

  it('has the correct ARIA role and label', () => {
    const { container } = render(
      <ClusterStatusDetails
        cluster={makeCluster({ lastSeen: '2024-01-01T00:00:00Z' })}
      />,
    )
    const el = container.firstChild as HTMLElement
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-label')).toBe('Cluster status details')
  })
})
