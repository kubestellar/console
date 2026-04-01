/**
 * UpdateIndicator Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({
    hasUpdate: false,
    latestRelease: null,
    channel: 'stable',
    autoUpdateStatus: 'idle',
    latestMinor: null,
    latestMajor: null,
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

describe('UpdateIndicator', () => {
  it('exports UpdateIndicator component', async () => {
    const mod = await import('../UpdateIndicator')
    expect(mod.UpdateIndicator).toBeDefined()
    expect(typeof mod.UpdateIndicator).toBe('function')
  })

  it('renders without crashing', async () => {
    const { UpdateIndicator } = await import('../UpdateIndicator')
    const { container } = render(
      <MemoryRouter>
        <UpdateIndicator />
      </MemoryRouter>
    )
    expect(container).toBeTruthy()
  })
})
