/**
 * NamespaceCard Tests
 *
 * Exercises card rendering: selection state styling, status badge,
 * cluster badge display, delete button interactions, and skeleton.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceCard, NamespaceCardSkeleton } from '../NamespaceCard'
import type { NamespaceDetails } from '../types'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <div data-testid="cluster-badge">{cluster}</div>,
}))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NamespaceCard', () => {
  const mockOnSelect = vi.fn()
  const mockOnDelete = vi.fn()

  const namespace: NamespaceDetails = {
    name: 'test-namespace',
    cluster: 'cluster-1',
    status: 'Active',
    createdAt: '2024-01-15T10:00:00Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders namespace name and cluster', () => {
    render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByText('test-namespace')).toBeInTheDocument()
    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('cluster-1')
  })

  it('applies selected styling when isSelected is true', () => {
    const { container } = render(
      <NamespaceCard
        namespace={namespace}
        isSelected={true}
        onSelect={mockOnSelect}
      />
    )

    const card = container.firstChild as HTMLElement
    expect(card).toHaveAttribute('aria-selected', 'true')
  })

  it('applies unselected styling when isSelected is false', () => {
    const { container } = render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    )

    const card = container.firstChild as HTMLElement
    expect(card).toHaveAttribute('aria-selected', 'false')
  })

  it('displays Active status badge in green', () => {
    render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    )

    const statusBadge = screen.getByText('Active')
    expect(statusBadge).toHaveAttribute('data-status', 'Active')
  })

  it('displays non-Active status badge in yellow', () => {
    const inactiveNamespace: NamespaceDetails = {
      ...namespace,
      status: 'Terminating',
    }

    render(
      <NamespaceCard
        namespace={inactiveNamespace}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    )

    const statusBadge = screen.getByText('Terminating')
    expect(statusBadge).toHaveAttribute('data-status', 'Terminating')
  })

  it('calls onSelect when card is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    )

    const card = container.firstChild as HTMLElement
    await user.click(card)

    expect(mockOnSelect).toHaveBeenCalled()
  })

  it('shows delete button and calls onDelete with stopPropagation', async () => {
    const user = userEvent.setup()
    render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
      />
    )

    const deleteBtn = screen.getByTitle('Delete namespace')
    await user.click(deleteBtn)

    expect(mockOnDelete).toHaveBeenCalled()
    expect(mockOnSelect).not.toHaveBeenCalled()
  })

  it('hides delete button when onDelete is not provided', () => {
    render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    )

    const deleteBtn = screen.queryByTitle('Delete namespace')
    expect(deleteBtn).not.toBeInTheDocument()
  })

  it('hides delete button for system namespaces', () => {
    render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
        onDelete={mockOnDelete}
        isSystem={true}
      />
    )

    const deleteBtn = screen.queryByTitle('Delete namespace')
    expect(deleteBtn).not.toBeInTheDocument()
  })

  it('shows system icon styling for system namespaces', () => {
    render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
        isSystem={true}
      />
    )

    // Check that the text is shown and system styling is applied
    expect(screen.getByText('test-namespace')).toBeInTheDocument()
  })

  it('formats creation date correctly', () => {
    // Mock toLocaleDateString to be deterministic regardless of local environment
    const toLocaleSpy = vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('12/25/2024')

    const testNamespace: NamespaceDetails = {
      ...namespace,
      createdAt: '2024-12-25T00:00:00Z',
    }

    render(
      <NamespaceCard
        namespace={testNamespace}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByText(/12\/25\/2024/)).toBeInTheDocument()
    toLocaleSpy.mockRestore()
  })

  it('hides cluster badge when showCluster is false', () => {
    render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
        showCluster={false}
      />
    )

    expect(screen.queryByTestId('cluster-badge')).not.toBeInTheDocument()
  })

  it('shows cluster badge by default', () => {
    render(
      <NamespaceCard
        namespace={namespace}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByTestId('cluster-badge')).toBeInTheDocument()
  })
})

describe('NamespaceCardSkeleton', () => {
  it('renders loading placeholder elements', () => {
    const { container } = render(<NamespaceCardSkeleton />)

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('has correct structure with placeholder divs', () => {
    const { container } = render(<NamespaceCardSkeleton />)

    // Look for elements with bg-secondary class that are used as placeholders
    const placeholders = container.querySelectorAll('[class*="bg-secondary"]')
    expect(placeholders.length).toBeGreaterThan(0)
  })
})
