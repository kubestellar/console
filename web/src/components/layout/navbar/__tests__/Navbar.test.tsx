/**
 * Navbar Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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
    toggleMobileSidebar: vi.fn(),
  }),
}))

vi.mock('../../../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn(), setTheme: vi.fn(), isDark: true }),
}))

vi.mock('../../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: false }),
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
  it('exports Navbar component', async () => {
    const mod = await import('../Navbar')
    expect(mod.Navbar).toBeDefined()
    expect(typeof mod.Navbar).toBe('function')
  })

  it('renders the AI missions launcher in the navbar when the sidebar is closed', async () => {
    const { Navbar } = await import('../Navbar')

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('navbar-ai-missions-btn')).toBeInTheDocument()
    expect(screen.getByText('missionSidebar.aiMissions')).toBeInTheDocument()
  })
})
