/**
 * Navbar Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { github_login: 'testuser' }, logout: vi.fn(), isAuthenticated: true }),
}))

vi.mock('../../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({
    config: { collapsed: false },
    toggleCollapsed: vi.fn(),
    openMobileSidebar: vi.fn(),
  }),
}))

vi.mock('../../../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn(), isDark: true }),
}))

vi.mock('../../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: false }),
}))

vi.mock('../../../../hooks/useBranding', () => ({
  useBranding: () => ({ productName: 'Console', logoUrl: '' }),
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
})
