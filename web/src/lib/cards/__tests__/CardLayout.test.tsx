/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CardHeaderActions, CardHeaderRow, CardStatGrid, CardStatHeader } from '../CardLayout'

describe('CardLayout helpers', () => {
  it('renders the shared header row classes', () => {
    const { container } = render(<CardHeaderRow data-testid="header-row" />)

    expect(screen.getByTestId('header-row')).toHaveClass('flex', 'flex-wrap', 'justify-between', 'mb-4')
    expect(container.firstChild).toBeInTheDocument()
  })

  it('merges custom classes for header actions', () => {
    render(<CardHeaderActions className="justify-end" data-testid="header-actions" />)

    expect(screen.getByTestId('header-actions')).toHaveClass('flex', 'items-center', 'gap-2', 'justify-end')
  })

  it('renders the shared stat grid and header wrappers', () => {
    render(
      <CardStatGrid className="@md:grid-cols-4 gap-2" data-testid="stat-grid">
        <CardStatHeader className="gap-1.5" data-testid="stat-header">
          <span>Content</span>
        </CardStatHeader>
      </CardStatGrid>
    )

    expect(screen.getByTestId('stat-grid')).toHaveClass('grid', 'grid-cols-2', '@md:grid-cols-4', 'gap-2', 'mb-4')
    expect(screen.getByTestId('stat-header')).toHaveClass('flex', 'items-center', 'mb-1', 'gap-1.5')
  })
})
