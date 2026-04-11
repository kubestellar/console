import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Server } from 'lucide-react'
import { EmptyState } from '../EmptyState'

/**
 * #6423 — tests covering the Copilot review comments on PR #6413 EmptyState.
 * Verifies the discriminated-union props (button OR link, never both),
 * internal href -> <Link>, and external href -> <a target=_blank>.
 */

function renderWithRouter(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

describe('EmptyState', () => {
  it('renders title and optional description', () => {
    renderWithRouter(<EmptyState title="No services yet" description="Connect a cluster" />)
    expect(screen.getByText('No services yet')).toBeInTheDocument()
    expect(screen.getByText('Connect a cluster')).toBeInTheDocument()
  })

  it('renders the icon when provided', () => {
    renderWithRouter(
      <EmptyState title="Empty" icon={<svg data-testid="icon" />} />
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('omits the icon container when no icon is provided', () => {
    renderWithRouter(<EmptyState title="Empty" />)
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument()
  })

  it('renders action as a button and fires onClick', () => {
    const onClick = vi.fn()
    renderWithRouter(
      <EmptyState
        title="Empty"
        action={{ label: 'Add card', onClick }}
      />
    )
    const btn = screen.getByRole('button', { name: /add card/i })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders action with internal href as a react-router Link', () => {
    renderWithRouter(
      <EmptyState
        title="Empty"
        action={{ label: 'Connect a cluster', href: '/clusters', icon: Server }}
      />
    )
    const link = screen.getByRole('link', { name: /connect a cluster/i })
    // Link renders as an <a> with an href of the to prop.
    expect(link).toHaveAttribute('href', '/clusters')
    // Internal links should NOT open in a new tab.
    expect(link).not.toHaveAttribute('target')
  })

  it('renders action with external href as an anchor with target=_blank and rel=noopener', () => {
    renderWithRouter(
      <EmptyState
        title="Empty"
        action={{ label: 'Docs', href: 'https://kubestellar.io/docs' }}
      />
    )
    const link = screen.getByRole('link', { name: /docs/i })
    expect(link).toHaveAttribute('href', 'https://kubestellar.io/docs')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel') ?? '').toContain('noopener')
  })

  it('renders both primary and secondary actions', () => {
    renderWithRouter(
      <EmptyState
        title="Empty"
        action={{ label: 'Primary', onClick: vi.fn() }}
        secondaryAction={{ label: 'Secondary', onClick: vi.fn() }}
      />
    )
    expect(screen.getByRole('button', { name: /primary/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /secondary/i })).toBeInTheDocument()
  })
})
