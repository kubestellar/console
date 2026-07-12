import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceClusterGroup } from '../NamespaceClusterGroup'
import type { NamespaceDetails } from '../types'

/**
 * NamespaceClusterGroup Component Tests
 * 
 * Tests collapsible cluster groups: expand/collapse interactions,
 * status indicators (loading, offline, access denied, unavailable),
 * namespace rendering, and skeleton display.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <div data-testid="cluster-badge">{cluster}</div>,
}))

vi.mock('../NamespaceCard', () => ({
  NamespaceCard: ({ namespace, onSelect, onDelete }: {
    namespace: NamespaceDetails
    onSelect: () => void
    onDelete?: () => void
  }) => (
    <div data-testid="namespace-card">
      <span>{namespace.name}</span>
      <button onClick={onSelect}>Select</button>
      {onDelete && <button onClick={onDelete}>Delete</button>}
    </div>
  ),
  NamespaceCardSkeleton: () => <div data-testid="namespace-skeleton">Loading...</div>,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) => {
      if (typeof options === 'string') return options
      return options?.defaultValue || key
    },
  }),
}))

// ── Test Data ──────────────────────────────────────────────────────────────

const mockNamespaces: NamespaceDetails[] = [
  { name: 'default', cluster: 'cluster-1', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
  { name: 'kube-system', cluster: 'cluster-1', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
  { name: 'my-app', cluster: 'cluster-1', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
]

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NamespaceClusterGroup', () => {
  const mockOnToggleCollapse = vi.fn()
  const mockOnSelect = vi.fn()
  const mockOnDelete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders cluster name and namespace count when expanded', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={mockNamespaces}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        hasData={true}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('cluster-1')
    expect(screen.getByText('3 namespaces')).toBeInTheDocument()
  })

  it('shows singular "namespace" for count of 1', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={[mockNamespaces[0]]}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        hasData={true}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText('1 namespace')).toBeInTheDocument()
  })

  it('toggles collapse state when header is clicked', async () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={mockNamespaces}
        isCollapsed={true}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        hasData={true}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    const collapseButton = screen.getByRole('button', { name: /Expand cluster-1/i })
    await userEvent.click(collapseButton)

    expect(mockOnToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('hides namespace cards when collapsed', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={mockNamespaces}
        isCollapsed={true}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        hasData={true}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.queryByTestId('namespace-card')).not.toBeInTheDocument()
  })

  it('shows namespace cards when expanded', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={mockNamespaces}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        hasData={true}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    const namespaceCards = screen.getAllByTestId('namespace-card')
    expect(namespaceCards).toHaveLength(3)
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('kube-system')).toBeInTheDocument()
    expect(screen.getByText('my-app')).toBeInTheDocument()
  })

  it('shows offline indicator when cluster is unreachable', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={[]}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        hasData={false}
        isUnreachable={true}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText('offline')).toBeInTheDocument()
    expect(screen.getByTitle('Cluster offline')).toBeInTheDocument()
  })

  it('shows "Access denied" status when cluster denies access', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={[]}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        clusterStatus="accessDenied"
        hasData={false}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('shows "Data unavailable" status when cluster is unavailable', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={[]}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        clusterStatus="unavailable"
        hasData={false}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText('Data unavailable')).toBeInTheDocument()
  })

  it('shows loading skeletons when loading without data', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={[]}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={true}
        hasData={false}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    const skeletons = screen.getAllByTestId('namespace-skeleton')
    expect(skeletons).toHaveLength(3)
  })

  it('shows loading indicator in header when loading', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={[]}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={true}
        hasData={false}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText('loading...')).toBeInTheDocument()
  })

  it('shows authorization error message when access is denied', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={[]}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        clusterStatus="accessDenied"
        hasData={false}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText(/Authorization failed for namespace access/i)).toBeInTheDocument()
  })

  it('shows unavailable message when data is unavailable', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={[]}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        clusterStatus="unavailable"
        hasData={false}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText(/Namespace data is unavailable/i)).toBeInTheDocument()
  })

  it('calls onSelect when namespace card is selected', async () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={mockNamespaces}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        hasData={true}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    const selectButtons = screen.getAllByRole('button', { name: 'Select' })
    await userEvent.click(selectButtons[0])

    expect(mockOnSelect).toHaveBeenCalledWith(mockNamespaces[0])
  })

  it('calls onDelete when namespace delete button is clicked', async () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={mockNamespaces}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={false}
        hasData={true}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    await userEvent.click(deleteButtons[0])

    // mockNamespaces[0] ('default') and [1] ('kube-system') are system namespaces
    // and don't render Delete buttons; the first Delete belongs to mockNamespaces[2].
    expect(mockOnDelete).toHaveBeenCalledWith(mockNamespaces[2])
  })

  it('does not show skeletons when loading with existing data', () => {
    render(
      <NamespaceClusterGroup
        clusterName="cluster-1"
        namespaces={mockNamespaces}
        isCollapsed={false}
        onToggleCollapse={mockOnToggleCollapse}
        isLoading={true}
        hasData={true}
        isUnreachable={false}
        selectedNamespace={null}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.queryByTestId('namespace-skeleton')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('namespace-card')).toHaveLength(3)
  })
})
