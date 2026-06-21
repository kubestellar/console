/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InstallCTAFlow } from './InstallCTAFlow'

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; project?: string }) => options?.defaultValue ?? options?.project ?? key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({
    startMission: vi.fn(),
    openSidebar: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({
    status: 'disconnected',
  }),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
  }),
}))

describe('InstallCTAFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subscribes to demo mode changes', () => {
    render(<InstallCTAFlow cardType="knative_services" title="Knative Services" />)

    expect(mockUseDemoMode).toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
