/**
 * EmptyClusterState Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

describe('EmptyClusterState', () => {
  it('exports EmptyClusterState component', async () => {
    const mod = await import('../EmptyClusterState')
    expect(mod.EmptyClusterState).toBeDefined()
    expect(typeof mod.EmptyClusterState).toBe('function')
  })
})
