import React, { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardErrorBoundary } from '../CardErrorBoundary'

const mockCardErrorFallback = vi.fn(
  ({ children, cardId }: { children: React.ReactNode; cardId: string }) => (
    <div data-testid="card-error-fallback" data-card-id={cardId}>
      {children}
    </div>
  ),
)

vi.mock('../CardErrorFallback', () => ({
  CardErrorFallback: (props: { children: React.ReactNode; cardId: string }) => mockCardErrorFallback(props),
}))

describe('CardErrorBoundary', () => {
  it('renders a flex container and forwards card content to CardErrorFallback', () => {
    const containerRef = createRef<HTMLDivElement>()

    render(
      <CardErrorBoundary containerRef={containerRef} cardId="cluster_health">
        <p>card body</p>
      </CardErrorBoundary>,
    )

    expect(containerRef.current).toBeInstanceOf(HTMLDivElement)
    expect(containerRef.current).toHaveClass('flex', 'flex-1', 'min-h-0', 'flex-col')
    expect(screen.getByTestId('card-error-fallback')).toBeInTheDocument()
    expect(screen.getByTestId('card-error-fallback')).toHaveAttribute('data-card-id', 'cluster_health')
    expect(screen.getByText('card body')).toBeInTheDocument()
    expect(mockCardErrorFallback).toHaveBeenCalledTimes(1)
  })
})
