/**
 * TokenUsageWidget Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { used: 1000, limit: 10000 }, alertLevel: 'normal', percentage: 10, remaining: 9000, isDemoData: true }),
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
})
