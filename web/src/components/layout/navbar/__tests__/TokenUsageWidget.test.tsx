/**
 * TokenUsageWidget Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({
    usage: {
      used: 1000,
      limit: 10000,
      resetDate: '2026-01-07T00:00:00.000Z',
      byCategory: { missions: 0, diagnose: 0, insights: 0, predictions: 0, other: 0 },
    },
    alertLevel: 'normal',
    percentage: 10,
    remaining: 9000,
    isDemoData: true,
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

describe('TokenUsageWidget', () => {
  it('exports TokenUsageWidget component', async () => {
    const mod = await import('../TokenUsageWidget')
    expect(mod.TokenUsageWidget).toBeDefined()
    expect(typeof mod.TokenUsageWidget).toBe('function')
  })

  it('renders without crashing', async () => {
    const { TokenUsageWidget } = await import('../TokenUsageWidget')
    const { container } = render(
      <MemoryRouter>
        <TokenUsageWidget />
      </MemoryRouter>
    )
    expect(container).toBeTruthy()
  })

  it('shows daily reset messaging in the dropdown', async () => {
    const { TokenUsageWidget } = await import('../TokenUsageWidget')
    render(
      <MemoryRouter>
        <TokenUsageWidget />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTestId('navbar-token-usage-btn'))

    expect(screen.getByText('layout.navbar.usedToday')).toBeInTheDocument()
    expect(screen.getByText('layout.navbar.resetsDaily')).toBeInTheDocument()
    expect(screen.getByText('layout.navbar.breakdownByFeatureToday')).toBeInTheDocument()
  })
})
