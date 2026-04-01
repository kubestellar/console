/**
 * AgentStatusIndicator Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: false, status: 'disconnected' }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

describe('AgentStatusIndicator', () => {
  it('exports AgentStatusIndicator component', async () => {
    const mod = await import('../AgentStatusIndicator')
    expect(mod.AgentStatusIndicator).toBeDefined()
    expect(typeof mod.AgentStatusIndicator).toBe('function')
  })

  it('renders without crashing', async () => {
    const { AgentStatusIndicator } = await import('../AgentStatusIndicator')
    const { container } = render(<AgentStatusIndicator />)
    expect(container).toBeTruthy()
  })
})
