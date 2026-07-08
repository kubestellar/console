import React from 'react'
/**
 * NamespaceClusterGroup Tests
 *
 * Exercises collapse/expand, status indicators, namespace count,
 * offline badge, skeleton loading, and system namespace detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceClusterGroup } from '../NamespaceClusterGroup'
import type { NamespaceDetails } from '../types'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | Record<string, unknown>) => {
      if (typeof opts === 'string') return opts
      if (opts && typeof opts === 'object' && 'defaultValue' in opts) return opts.defaultValue as string
      return key
    },
  }),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../NamespaceCard', () => ({
  NamespaceCard: ({ namespace, onDelete, isSystem }: { namespace: NamespaceDetails; onDelete?: () => void; isSystem?: boolean }) => (
    <div data-testid={`ns-card-${namespace.name}`} data-system={isSystem}>
      {namespace.name}
      {onDelete && <button data-testid={`delete-${namespace.name}`} onClick={onDelete}>delete</button>}
    </div>
  ),
  NamespaceCardSkeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg data-testid="chevron-down" />,
  ChevronRight: () => <svg data-testid="chevron-right" />,
  WifiOff: () => <svg data-testid="wifi-off" />,
  Hourglass: () => <svg data-testid="hourglass" />,
}))

// ── Fixtures ───────────────────────────────────────────────────────────────

const makeNamespace = (name: string, cluster = 'cluster-1'): NamespaceDetails => ({
  name,
  cluster,
  status: 'Active',
  createdAt: '2024-01-01T00:00:00Z',
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NamespaceClusterGroup', () => {
  const defaultProps = {
    clusterName: 'cluster-1',
    namespaces: [makeNamespace('app-ns'), makeNamespace('dev-ns')],
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
    isLoading: false,
    hasData: true,
    isUnreachable: false,
    selectedNamespace: null,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders cluster name via ClusterBadge', () => {
    render(<NamespaceClusterGroup {...defaultProps} />)
    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('cluster-1')
  })

  it('displays namespace count with correct pluralization', () => {
    render(<NamespaceClusterGroup {...defaultProps} />)
    expect(screen.getByText('2 namespaces')).toBeInTheDocument()
  })

  it('displays singular "namespace" for count of 1', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        namespaces={[makeNamespace('only-one')]}
      />
    )
    expect(screen.getByText('1 namespace')).toBeInTheDocument()
  })

  it('calls onToggleCollapse when header button is clicked', async () => {
    const user = userEvent.setup()
    render(<NamespaceClusterGroup {...defaultProps} />)

    const btn = screen.getByRole('button', { name: /Collapse cluster-1/i })
    await user.click(btn)

    expect(defaultProps.onToggleCollapse).toHaveBeenCalled()
  })

  it('shows chevron-down when expanded', () => {
    render(<NamespaceClusterGroup {...defaultProps} isCollapsed={false} />)
    expect(screen.getByTestId('chevron-down')).toBeInTheDocument()
  })

  it('shows chevron-right when collapsed', () => {
    render(<NamespaceClusterGroup {...defaultProps} isCollapsed={true} />)
    expect(screen.getByTestId('chevron-right')).toBeInTheDocument()
  })

  it('hides namespace cards when collapsed', () => {
    render(<NamespaceClusterGroup {...defaultProps} isCollapsed={true} />)
    expect(screen.queryByTestId('ns-card-app-ns')).not.toBeInTheDocument()
  })

  it('shows namespace cards when expanded', () => {
    render(<NamespaceClusterGroup {...defaultProps} isCollapsed={false} />)
    expect(screen.getByTestId('ns-card-app-ns')).toBeInTheDocument()
    expect(screen.getByTestId('ns-card-dev-ns')).toBeInTheDocument()
  })

  it('shows offline icon when cluster is unreachable', () => {
    render(<NamespaceClusterGroup {...defaultProps} isUnreachable={true} />)
    expect(screen.getByTestId('wifi-off')).toBeInTheDocument()
    expect(screen.getByText('offline')).toBeInTheDocument()
  })

  it('shows loading indicator when loading without data', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        isLoading={true}
        hasData={false}
        namespaces={[]}
      />
    )
    expect(screen.getByText('loading...')).toBeInTheDocument()
  })

  it('shows skeleton cards when loading without data and expanded', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        isLoading={true}
        hasData={false}
        isCollapsed={false}
        namespaces={[]}
      />
    )
    const skeletons = screen.getAllByTestId('skeleton')
    expect(skeletons).toHaveLength(3)
  })

  it('shows access denied message for accessDenied status', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        clusterStatus="accessDenied"
        hasData={false}
        namespaces={[]}
      />
    )
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('shows unavailable message for unavailable status', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        clusterStatus="unavailable"
        hasData={false}
        namespaces={[]}
      />
    )
    expect(screen.getByText('Data unavailable')).toBeInTheDocument()
  })

  it('marks system namespaces (kube-*) correctly', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        namespaces={[makeNamespace('kube-system')]}
      />
    )
    const card = screen.getByTestId('ns-card-kube-system')
    expect(card).toHaveAttribute('data-system', 'true')
  })

  it('marks "default" namespace as system', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        namespaces={[makeNamespace('default')]}
      />
    )
    const card = screen.getByTestId('ns-card-default')
    expect(card).toHaveAttribute('data-system', 'true')
  })

  it('marks openshift-* namespaces as system', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        namespaces={[makeNamespace('openshift-monitoring')]}
      />
    )
    const card = screen.getByTestId('ns-card-openshift-monitoring')
    expect(card).toHaveAttribute('data-system', 'true')
  })

  it('does not provide onDelete for system namespaces', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        namespaces={[makeNamespace('kube-system')]}
      />
    )
    expect(screen.queryByTestId('delete-kube-system')).not.toBeInTheDocument()
  })

  it('provides onDelete for non-system namespaces', () => {
    render(
      <NamespaceClusterGroup
        {...defaultProps}
        namespaces={[makeNamespace('my-app')]}
      />
    )
    expect(screen.getByTestId('delete-my-app')).toBeInTheDocument()
  })
})
