/**
 * TokenUsageWidget Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockUseTokenUsage = vi.fn(() => ({
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
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => mockUseTokenUsage(),
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

  it('shows unattributed usage when total exceeds the category sum', async () => {
    mockUseTokenUsage.mockReturnValue({
      usage: {
        used: 201684,
        limit: 500000,
        resetDate: '2026-01-07T00:00:00.000Z',
        byCategory: { missions: 900, diagnose: 400, insights: 200, predictions: 100, other: 0 },
      },
      alertLevel: 'normal',
      percentage: 40,
      remaining: 298316,
      isDemoData: false,
    })

    const { TokenUsageWidget } = await import('../TokenUsageWidget')
    render(
      <MemoryRouter>
        <TokenUsageWidget />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTestId('navbar-token-usage-btn'))

    expect(screen.getByText('layout.navbar.tokenCategories.unattributed')).toBeInTheDocument()
    expect(screen.getByText('layout.navbar.unattributedHelp')).toBeInTheDocument()
    expect(screen.getByText('201,684')).toBeInTheDocument()
    expect(screen.getByText('200k')).toBeInTheDocument()
  })
})
