import React from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { DashboardEmptyState } from './DashboardEmptyState'

describe('DashboardEmptyState Component', () => {
  it('exports DashboardEmptyState component', () => {
    expect(DashboardEmptyState).toBeDefined()
    expect(typeof DashboardEmptyState).toBe('function')
  })

  it('renders with required props', () => {
    const props = {
      onAddCard: vi.fn(),
      onOpenTemplates: vi.fn(),
    }
    expect(() => {
      DashboardEmptyState(props)
    }).not.toThrow()
  })

  it('renders with connection status', () => {
    expect(() => {
      DashboardEmptyState({
        onAddCard: vi.fn(),
        onOpenTemplates: vi.fn(),
        connectionStatus: 'connected',
      })
    }).not.toThrow()
  })
})
