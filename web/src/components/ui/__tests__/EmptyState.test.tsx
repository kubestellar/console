import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Server } from 'lucide-react'
import { EmptyState } from '../EmptyState'

/**
 * #6423 — tests covering the Copilot review comments on PR #6413 EmptyState.
 * Verifies the discriminated-union props (button OR link, never both),
 * internal href navigation, and external href window opening.
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

  it('navigates when action uses an internal href', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={(
              <EmptyState
                title="Empty"
                action={{ label: 'Connect a cluster', href: '/clusters', icon: Server }}
              />
            )}
          />
          <Route path="/clusters" element={<div>Clusters page</div>} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /connect a cluster/i }))
    expect(screen.getByText('Clusters page')).toBeInTheDocument()
  })

  it('opens a new tab when action uses an external href', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderWithRouter(
      <EmptyState
        title="Empty"
        action={{ label: 'Docs', href: 'https://kubestellar.io/docs' }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /docs/i }))
    expect(openSpy).toHaveBeenCalledWith('https://kubestellar.io/docs', '_blank', 'noopener,noreferrer')

    openSpy.mockRestore()
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
