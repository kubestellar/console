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

vi.mock('../../../lib/modals', () => ({
  BaseModal: {
    Header: () => null,
    Content: () => null,
    Footer: () => null,
  },
}))

import { DashboardDeleteModal } from './DashboardDeleteModal'

describe('DashboardDeleteModal Component', () => {
  it('exports DashboardDeleteModal component', () => {
    expect(DashboardDeleteModal).toBeDefined()
    expect(typeof DashboardDeleteModal).toBe('function')
  })

  it('renders when open', () => {
    expect(() => render(<DashboardDeleteModal {...{
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        dashboardName: 'Test Dashboard',
      }} />)).not.toThrow()
  })

  it('renders when closed', () => {
    expect(() => render(<DashboardDeleteModal {...{
        isOpen: false,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        dashboardName: 'Test Dashboard',
      }} />)).not.toThrow()
  })
})
