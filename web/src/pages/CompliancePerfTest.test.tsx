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

import { CompliancePerfTest } from './CompliancePerfTest'

describe('CompliancePerfTest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as Window & { __COMPLIANCE_MANIFEST__?: unknown }).__COMPLIANCE_MANIFEST__
    delete (window as Window & { __COMPLIANCE_SET_BATCH__?: unknown }).__COMPLIANCE_SET_BATCH__
  })

  afterEach(() => {
    delete (window as Window & { __COMPLIANCE_MANIFEST__?: unknown }).__COMPLIANCE_MANIFEST__
    delete (window as Window & { __COMPLIANCE_SET_BATCH__?: unknown }).__COMPLIANCE_SET_BATCH__
  })

  it('renders the compliance-manifest element', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <CompliancePerfTest />
        </MemoryRouter>,
      )
    })
    expect(screen.getByTestId('compliance-manifest')).toBeInTheDocument()
  })

  it('compliance-manifest has correct batch and total-cards attributes', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <CompliancePerfTest />
        </MemoryRouter>,
      )
    })
    const manifest = screen.getByTestId('compliance-manifest')
    // dynamic_card is filtered out, so 2 cards remain
    expect(manifest).toHaveAttribute('data-compliance-total-cards', '2')
    expect(manifest).toHaveAttribute('data-compliance-batch', '0')
  })

  it('populates window.__COMPLIANCE_MANIFEST__ after mount', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <CompliancePerfTest />
        </MemoryRouter>,
      )
    })
    const manifest = (window as Window & { __COMPLIANCE_MANIFEST__?: { totalCards: number } }).__COMPLIANCE_MANIFEST__
    expect(manifest).toBeDefined()
    expect(manifest!.totalCards).toBe(2)
  })

  it('registers window.__COMPLIANCE_SET_BATCH__ after mount', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <CompliancePerfTest />
        </MemoryRouter>,
      )
    })
    expect(typeof (window as Window & { __COMPLIANCE_SET_BATCH__?: unknown }).__COMPLIANCE_SET_BATCH__).toBe('function')
  })

  it('renders missing-card markers when card component is null', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <CompliancePerfTest />
        </MemoryRouter>,
      )
    })
    expect(screen.getAllByText(/Missing card component:/).length).toBeGreaterThan(0)
  })
})
