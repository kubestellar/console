import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardErrorBoundary } from '../CardErrorBoundary'

vi.mock('../CardErrorFallback', () => ({
  CardErrorFallback: ({ children, cardId }: { children: React.ReactNode; cardId: string }) => (
    <div data-testid="card-error-fallback" data-card-id={cardId}>{children}</div>
  ),
}))

describe('CardErrorBoundary', () => {
  const containerRef = { current: null }

  it('renders children', () => {
    render(
      <CardErrorBoundary containerRef={containerRef} cardId="test-card">
        <span>Child content</span>
      </CardErrorBoundary>
    )
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('passes cardId to CardErrorFallback', () => {
    render(
      <CardErrorBoundary containerRef={containerRef} cardId="my-card">
        <span>inner</span>
      </CardErrorBoundary>
    )
    expect(screen.getByTestId('card-error-fallback')).toHaveAttribute('data-card-id', 'my-card')
  })

  it('wraps content in a flex container div', () => {
    const { container } = render(
      <CardErrorBoundary containerRef={containerRef} cardId="card">
        <span>test</span>
      </CardErrorBoundary>
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.tagName).toBe('DIV')
    expect(wrapper.className).toContain('flex')
  })
})
