/**
 * ActiveUsersWidget Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useActiveUsers', () => ({
  useActiveUsers: () => ({ viewerCount: 5, hasError: false, isLoading: false }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

describe('ActiveUsersWidget', () => {
  it('exports ActiveUsersWidget component', async () => {
    const mod = await import('../ActiveUsersWidget')
    expect(mod.ActiveUsersWidget).toBeDefined()
    expect(typeof mod.ActiveUsersWidget).toBe('function')
  })

  it('renders without crashing', async () => {
    const { ActiveUsersWidget } = await import('../ActiveUsersWidget')
    const { container } = render(<ActiveUsersWidget />)
    expect(container).toBeTruthy()
  })
})
