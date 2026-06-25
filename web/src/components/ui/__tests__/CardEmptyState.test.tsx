import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardEmptyState } from '../CardEmptyState'
import { AlertTriangle } from 'lucide-react'

describe('CardEmptyState', () => {
  it('renders children', () => {
    render(
      <CardEmptyState>
        <p>No data available</p>
      </CardEmptyState>
    )
    expect(screen.getByText('No data available')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(
      <CardEmptyState icon={<AlertTriangle data-testid="icon" />}>
        <p>Error message</p>
      </CardEmptyState>
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <CardEmptyState className="custom-class">
        <p>Content</p>
      </CardEmptyState>
    )
    const element = container.firstChild
    expect(element).toHaveClass('custom-class')
  })

  it('has default card empty state classes', () => {
    const { container } = render(
      <CardEmptyState>
        <p>Content</p>
      </CardEmptyState>
    )
    const element = container.firstChild
    expect(element).toHaveClass('h-full')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('flex-col')
    expect(element).toHaveClass('items-center')
    expect(element).toHaveClass('justify-center')
    expect(element).toHaveClass('min-h-card')
    expect(element).toHaveClass('text-muted-foreground')
  })
})
