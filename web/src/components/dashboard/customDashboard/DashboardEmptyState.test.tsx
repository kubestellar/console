import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
}),
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
    expect(() => render(<DashboardEmptyState {...{
        onAddCard: vi.fn(),
        onOpenTemplates: vi.fn(),
        connectionStatus: 'connected',
      }} />)).not.toThrow()
  })
})
