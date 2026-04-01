/**
 * SnoozedCards Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../hooks/useSnoozedCards', () => ({
  useSnoozedCards: () => ({ snoozedSwaps: [], dismissSwap: vi.fn(), unsnoozeSwap: vi.fn() }),
  formatTimeRemaining: () => '5m',
}))

vi.mock('../../../hooks/useSnoozedRecommendations', () => ({
  useSnoozedRecommendations: () => ({ snoozedRecommendations: [], dismissSnoozedRecommendation: vi.fn(), unsnooozeRecommendation: vi.fn() }),
  formatElapsedTime: () => '2m ago',
}))

vi.mock('../../../hooks/useSnoozedMissions', () => ({
  useSnoozedMissions: () => ({ snoozedMissions: [], dismissMission: vi.fn(), unsnoozeMission: vi.fn() }),
  formatTimeRemaining: (ms: number) => '10m',
}))

vi.mock('../../../hooks/useMissionSuggestions', () => ({}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

vi.mock('../../../lib/constants/network', () => ({
  POLL_INTERVAL_SLOW_MS: 30000,
}))

describe('SnoozedCards', () => {
  it('exports SnoozedCards component', async () => {
    const mod = await import('../SnoozedCards')
    expect(mod.SnoozedCards).toBeDefined()
  })

  it('renders without crashing when no snoozed items', async () => {
    const { SnoozedCards } = await import('../SnoozedCards')
    const { container } = render(<SnoozedCards />)
    expect(container).toBeTruthy()
  })
})
