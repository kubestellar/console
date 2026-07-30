import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
    expect(() => {
      DashboardDeleteModal({
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        dashboardName: 'Test Dashboard',
      })
    }).not.toThrow()
  })

  it('renders when closed', () => {
    expect(() => {
      DashboardDeleteModal({
        isOpen: false,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        dashboardName: 'Test Dashboard',
      })
    }).not.toThrow()
  })
})
