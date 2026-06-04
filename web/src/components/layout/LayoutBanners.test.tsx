import '@testing-library/jest-dom/vitest'
import { render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { tSpy, closeSpy, toggleSpy, openSpy, setIsOpenSpy } = vi.hoisted(() => ({
  tSpy: vi.fn((key: string) => `translated:${key}`),
  closeSpy: vi.fn(),
  toggleSpy: vi.fn(),
  openSpy: vi.fn(),
  setIsOpenSpy: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: tSpy,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('@/hooks/useModal', () => ({
  useModal: () => ({
    isOpen: false,
    close: closeSpy,
    toggle: toggleSpy,
    open: openSpy,
    setIsOpen: setIsOpenSpy,
  }),
}))

vi.mock('./AutonomousBanner', () => ({
  AutonomousBanner: () => <div>autonomous-banner</div>,
}))

import { useLayoutBanners } from './LayoutBanners'

function buildOptions() {
  return {
    autonomousBannerDismissed: true,
    hasInClusterAIBackend: false,
    isAuthenticatedNoAgent: false,
    isDemoMode: false,
    isDemoModeForced: false,
    isInClusterMode: false,
    isMobile: false,
    isOnline: true,
    demoBannerDismissed: false,
    offlineBannerDismissed: false,
    wasOffline: false,
    backendStatus: 'disconnected',
    agentStatus: 'disconnected',
    onDismissAutonomous: vi.fn(),
    onDismissOffline: vi.fn(),
    onOpenInClusterSetup: vi.fn(),
    onOpenSetup: vi.fn(),
    onToggleDemoMode: vi.fn(),
    onToggleDemoOrDismiss: vi.fn(),
  }
}

describe('useLayoutBanners', () => {
  beforeEach(() => {
    tSpy.mockClear()
    closeSpy.mockClear()
    toggleSpy.mockClear()
    openSpy.mockClear()
    setIsOpenSpy.mockClear()
  })

  it('renders translated offline banner copy from i18n keys', () => {
    const { result } = renderHook(() => useLayoutBanners(buildOptions()))
    const offlineBanner = result.current.visibleBanners.find((banner) => banner.id === 'offline')

    expect(offlineBanner).toBeDefined()

    render(<MemoryRouter>{offlineBanner?.content}</MemoryRouter>)

    expect(screen.getByText('translated:common.offline')).toBeInTheDocument()
    expect(screen.getByText('translated:layout.offlineInstallLabel')).toBeInTheDocument()
    expect(screen.getByText('translated:layout.offlineInstallRun')).toBeInTheDocument()
  })

  it('calls t with the offline banner translation keys', () => {
    renderHook(() => useLayoutBanners(buildOptions()))

    expect(tSpy).toHaveBeenCalledWith('common.offline')
    expect(tSpy).toHaveBeenCalledWith('layout.offlineInstallLabel')
    expect(tSpy).toHaveBeenCalledWith('layout.offlineInstallRun')
    expect(tSpy).toHaveBeenCalledWith('navigation.settings')
    expect(tSpy).toHaveBeenCalledWith('layout.switchTo')
    expect(tSpy).toHaveBeenCalledWith('layout.demo')
    expect(tSpy).toHaveBeenCalledWith('actions.dismiss')
  })
})
