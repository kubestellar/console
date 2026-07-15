import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/components/cards/cardRegistry', () => ({
  getRegisteredCardTypes: vi.fn(() => ['pod_issues', 'node_status', 'dynamic_card']),
  getCardComponent: vi.fn(() => null),
  DEMO_DATA_CARDS: new Set<string>(['pod_issues']),
}))

vi.mock('@/components/cards/CardWrapper', () => ({
  CardWrapper: ({ children, cardId }: { children: React.ReactNode; cardId: string }) => (
    <div data-testid={`card-wrapper-${cardId}`}>{children}</div>
  ),
}))

vi.mock('@/components/acmm/ACMMProvider', () => ({
  ACMMProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/formatCardTitle', () => ({
  formatCardTitle: (type: string) => type,
}))

import { AllCardsPerfTest } from './AllCardsPerfTest'

describe('AllCardsPerfTest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as Window & { __TTFI_MANIFEST__?: unknown }).__TTFI_MANIFEST__
  })

  afterEach(() => {
    delete (window as Window & { __TTFI_MANIFEST__?: unknown }).__TTFI_MANIFEST__
  })

  it('renders the ttfi-manifest element', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <AllCardsPerfTest />
        </MemoryRouter>,
      )
    })
    expect(screen.getByTestId('ttfi-manifest')).toBeInTheDocument()
  })

  it('ttfi-manifest has correct batch and total-cards attributes', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <AllCardsPerfTest />
        </MemoryRouter>,
      )
    })
    const manifest = screen.getByTestId('ttfi-manifest')
    // dynamic_card is filtered out, so 2 cards remain
    expect(manifest).toHaveAttribute('data-ttfi-total-cards', '2')
    expect(manifest).toHaveAttribute('data-ttfi-batch', '0')
  })

  it('populates window.__TTFI_MANIFEST__ after mount', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <AllCardsPerfTest />
        </MemoryRouter>,
      )
    })
    const ttfi = (window as Window & { __TTFI_MANIFEST__?: { totalCards: number } }).__TTFI_MANIFEST__
    expect(ttfi).toBeDefined()
    expect(ttfi!.totalCards).toBe(2)
  })

  it('renders missing-card markers when card component is null', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <AllCardsPerfTest />
        </MemoryRouter>,
      )
    })
    // All cards have null components (getCardComponent returns null), so missing markers appear
    expect(screen.getAllByText(/Missing card component:/).length).toBeGreaterThan(0)
  })
})
