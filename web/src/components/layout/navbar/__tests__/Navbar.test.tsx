/**
 * Navbar Component Tests
 */
import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let isMobileMock = false

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../../lib/safeLazy', () => ({
  safeLazy: () => (() => null),
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { github_login: 'testuser' }, logout: vi.fn(), isAuthenticated: true }),
}))

vi.mock('../../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({
    config: { collapsed: false, isMobileOpen: false },
    toggleCollapsed: vi.fn(),
    openMobileSidebar: vi.fn(),
    closeMobileSidebar: vi.fn(),
    toggleMobileSidebar: vi.fn(),
  }),
}))

vi.mock('../../../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn(), setTheme: vi.fn(), isDark: true }),
}))

vi.mock('../../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: isMobileMock }),
}))

vi.mock('../../../../hooks/useBranding', () => ({
  useBranding: () => ({ appName: 'Console', docsUrl: 'https://example.com/docs' }),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({
    missions: [{ id: 'mission-1', status: 'waiting_input' }],
    isSidebarOpen: false,
    openSidebar: vi.fn(),
  }),
}))

vi.mock('../../../ui/LogoWithStar', () => ({
  LogoWithStar: () => <div data-testid="logo">Logo</div>,
}))

vi.mock('../../../ui/AlertBadge', () => ({
  AlertBadge: () => null,
}))

vi.mock('../../../feedback', () => ({
  FeatureRequestButton: () => null,
}))

vi.mock('../../UserProfileDropdown', () => ({
  UserProfileDropdown: () => null,
}))

vi.mock('../TokenUsageWidget', () => ({
  TokenUsageWidget: () => null,
}))

vi.mock('../ClusterFilterPanel', () => ({
  ClusterFilterPanel: () => null,
}))

vi.mock('../AgentStatusIndicator', () => ({
  AgentStatusIndicator: () => null,
}))

vi.mock('../UpdateIndicator', () => ({
  UpdateIndicator: () => null,
}))

vi.mock('../StreakBadge', () => ({
  StreakBadge: () => null,
}))

vi.mock('../LearnDropdown', () => ({
  LearnDropdown: () => null,
}))

vi.mock('../ActiveUsersWidget', () => ({
  ActiveUsersWidget: () => null,
}))

describe('Navbar', () => {
  afterEach(() => {
    isMobileMock = false
  })

  it('exports Navbar component', async () => {
    const mod = await import('../Navbar')
    expect(mod.Navbar).toBeDefined()
    expect(typeof mod.Navbar).toBe('function')
  })

  it('renders the AI missions launcher in the navbar when the sidebar is closed', async () => {
    isMobileMock = false
    const { Navbar } = await import('../Navbar')

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('navbar-ai-missions-btn')).toBeInTheDocument()
    expect(screen.getByText('missionSidebar.aiMissions')).toBeInTheDocument()
  })

  it('keeps a mobile search trigger visible on small viewports', async () => {
    isMobileMock = true
    const { Navbar } = await import('../Navbar')

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    )

    const trigger = screen.getByTestId('navbar-mobile-search-btn')
    expect(trigger).toBeInTheDocument()

    fireEvent.click(trigger)

    expect(screen.getByTestId('navbar-mobile-search-close')).toBeInTheDocument()
  })
})
