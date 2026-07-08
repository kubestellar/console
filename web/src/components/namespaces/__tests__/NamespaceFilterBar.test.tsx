import React from 'react'
/**
 * NamespaceFilterBar Tests
 *
 * Exercises search input, group-by toggle buttons, and callback behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceFilterBar } from '../NamespaceFilterBar'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key }),
}))

vi.mock('lucide-react', () => ({
  Search: () => <svg data-testid="search-icon" />,
  Layers: () => <svg data-testid="layers-icon" />,
  Server: () => <svg data-testid="server-icon" />,
}))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NamespaceFilterBar', () => {
  const mockOnSearchChange = vi.fn()
  const mockOnGroupByChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders search input with current value', () => {
    render(
      <NamespaceFilterBar
        searchQuery="test-ns"
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('test-ns')
  })

  it('calls onSearchChange when typing in input', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'kube-system' } })

    expect(mockOnSearchChange).toHaveBeenCalledWith('kube-system')
  })

  it('renders both group-by toggle buttons', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    expect(screen.getByTitle('Group by cluster')).toBeInTheDocument()
    expect(screen.getByTitle('Group by type (user/system)')).toBeInTheDocument()
  })

  it('applies active styling to cluster button when groupBy is cluster', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const clusterBtn = screen.getByTitle('Group by cluster')
    expect(clusterBtn.className).toContain('bg-blue-500/20')
    expect(clusterBtn.className).toContain('text-blue-400')
  })

  it('applies active styling to type button when groupBy is type', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="type"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    const typeBtn = screen.getByTitle('Group by type (user/system)')
    expect(typeBtn.className).toContain('bg-blue-500/20')
    expect(typeBtn.className).toContain('text-blue-400')
  })

  it('calls onGroupByChange with "cluster" when cluster button clicked', async () => {
    const user = userEvent.setup()
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="type"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    await user.click(screen.getByTitle('Group by cluster'))
    expect(mockOnGroupByChange).toHaveBeenCalledWith('cluster')
  })

  it('calls onGroupByChange with "type" when type button clicked', async () => {
    const user = userEvent.setup()
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    await user.click(screen.getByTitle('Group by type (user/system)'))
    expect(mockOnGroupByChange).toHaveBeenCalledWith('type')
  })

  it('renders search icon', () => {
    render(
      <NamespaceFilterBar
        searchQuery=""
        onSearchChange={mockOnSearchChange}
        groupBy="cluster"
        onGroupByChange={mockOnGroupByChange}
      />
    )

    expect(screen.getByTestId('search-icon')).toBeInTheDocument()
  })
})
