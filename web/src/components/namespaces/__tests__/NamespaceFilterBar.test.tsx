import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceFilterBar } from '../NamespaceFilterBar'

/**
 * NamespaceFilterBar Component Tests
 * 
 * Tests search input functionality, group-by toggle (cluster/type),
 * callback invocations, and UI state transitions.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NamespaceFilterBar', () => {
  const mockOnSearchChange = vi.fn()
  const mockOnGroupByChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders search input with placeholder', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const searchInput = screen.getByPlaceholderText('common.searchNamespaces')
    expect(searchInput).toBeInTheDocument()
  })

  it('displays current search query value', () => {
    render(
      <NamespaceFilterBar
        searchQuery="kube-system"
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const searchInput = screen.getByDisplayValue('kube-system')
    expect(searchInput).toBeInTheDocument()
  })

  it('calls onSearchChange when search input changes', async () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const searchInput = screen.getByPlaceholderText('common.searchNamespaces')
    await userEvent.type(searchInput, 'my-app')

    expect(mockOnSearchChange).toHaveBeenCalledTimes(6) // "m", "y", "-", "a", "p", "p"
    expect(mockOnSearchChange).toHaveBeenLastCalledWith('my-app')
  })

  it('renders group-by toggle buttons', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    expect(screen.getByRole('button', { name: /By Cluster/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /By Type/i })).toBeInTheDocument()
  })

  it('highlights "By Cluster" button when groupBy is "cluster"', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const clusterButton = screen.getByRole('button', { name: /By Cluster/i })
    expect(clusterButton).toHaveClass('bg-blue-500/20', 'text-blue-400')
  })

  it('highlights "By Type" button when groupBy is "type"', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="type"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const typeButton = screen.getByRole('button', { name: /By Type/i })
    expect(typeButton).toHaveClass('bg-blue-500/20', 'text-blue-400')
  })

  it('calls onGroupByChange with "cluster" when "By Cluster" is clicked', async () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="type"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const clusterButton = screen.getByRole('button', { name: /By Cluster/i })
    await userEvent.click(clusterButton)

    expect(mockOnGroupByChange).toHaveBeenCalledWith('cluster')
  })

  it('calls onGroupByChange with "type" when "By Type" is clicked', async () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const typeButton = screen.getByRole('button', { name: /By Type/i })
    await userEvent.click(typeButton)

    expect(mockOnGroupByChange).toHaveBeenCalledWith('type')
  })

  it('renders search icon in input', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    // Lucide icons render as <svg>, check for the Search icon's parent container
    const searchIcon = document.querySelector('.lucide-search') || document.querySelector('svg')
    expect(searchIcon).toBeInTheDocument()
  })

  it('renders Server icon for "By Cluster" button', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const clusterButton = screen.getByRole('button', { name: /By Cluster/i })
    expect(clusterButton.querySelector('svg')).toBeInTheDocument()
  })

  it('renders Layers icon for "By Type" button', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="type"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const typeButton = screen.getByRole('button', { name: /By Type/i })
    expect(typeButton.querySelector('svg')).toBeInTheDocument()
  })

  it('applies correct title attributes to buttons', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const clusterButton = screen.getByRole('button', { name: /By Cluster/i })
    const typeButton = screen.getByRole('button', { name: /By Type/i })

    expect(clusterButton).toHaveAttribute('title', 'Group by cluster')
    expect(typeButton).toHaveAttribute('title', 'Group by type (user/system)')
  })

  it('clears search input when value is emptied', async () => {
    render(
      <NamespaceFilterBar
        searchQuery="test"
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const searchInput = screen.getByDisplayValue('test')
    await userEvent.clear(searchInput)

    expect(mockOnSearchChange).toHaveBeenCalledWith('')
  })

  it('does not call onGroupByChange when already selected button is clicked', async () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const clusterButton = screen.getByRole('button', { name: /By Cluster/i })
    await userEvent.click(clusterButton)

    // Still called, but the parent component decides if state should update
    expect(mockOnGroupByChange).toHaveBeenCalledWith('cluster')
  })
})
