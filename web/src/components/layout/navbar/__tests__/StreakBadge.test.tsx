/**
 * StreakBadge Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useVisitStreak', () => ({
  useVisitStreak: () => ({ streak: 3, isNewDay: false }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

describe('StreakBadge', () => {
  it('exports StreakBadge component', async () => {
    const mod = await import('../StreakBadge')
    expect(mod.StreakBadge).toBeDefined()
    expect(typeof mod.StreakBadge).toBe('function')
  })

  it('renders without crashing', async () => {
    const { StreakBadge } = await import('../StreakBadge')
    const { container } = render(<StreakBadge />)
    expect(container).toBeTruthy()
  })
})
