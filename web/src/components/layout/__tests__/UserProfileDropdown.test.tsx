/**
 * UserProfileDropdown Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const modalState = vi.hoisted(() => ({
  isOpen: false,
  open: vi.fn(),
  close: vi.fn(),
  toggle: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => modalState,
}))

vi.mock('../../../hooks/useRewards', () => ({
  useRewards: () => ({
    totalCoins: 1200,
    githubPoints: 900,
    localCoins: 200,
    bonusPoints: 100,
    awardCoins: vi.fn(),
  }),
  REWARD_ACTIONS: {
    linkedin_share: { coins: 200 },
  },
}))

vi.mock('../../../types/rewards', () => ({
  getContributorLevel: () => ({
    current: {
      name: 'Commander',
      bgClass: 'bg-purple-900',
      textClass: 'text-purple-400',
    },
    next: null,
    progress: 100,
    coinsToNext: 0,
  }),
}))

vi.mock('../../../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ channel: 'stable', installMethod: 'web', hasUpdate: false }),
}))

vi.mock('../../../lib/i18n', () => ({
  languages: [{ code: 'en', name: 'English', flag: '🇺🇸' }],
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoModeForced: () => true,
}))

vi.mock('../../../lib/analytics', () => ({
  emitLinkedInShare: vi.fn(),
  emitLanguageChanged: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ oauthConfigured: false, backendUp: false }),
}))

vi.mock('../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: () => null,
}))

vi.mock('../../setup/DeveloperSetupDialog', () => ({
  DeveloperSetupDialog: () => null,
}))

describe('UserProfileDropdown', () => {
  beforeEach(() => {
    modalState.isOpen = false
  })

  it('exports UserProfileDropdown', async () => {
    const mod = await import('../UserProfileDropdown')
    expect(mod.UserProfileDropdown).toBeDefined()
    expect(typeof mod.UserProfileDropdown).toBe('function')
  })

  it('renders with user data', async () => {
    const { UserProfileDropdown } = await import('../UserProfileDropdown')
    const user = { github_login: 'testuser', email: 'test@example.com', role: 'admin' }
    const { container } = render(
      <MemoryRouter>
        <UserProfileDropdown user={user} onLogout={vi.fn()} />
      </MemoryRouter>
    )
    expect(container).toBeTruthy()
  })

  it('renders with null user', async () => {
    const { UserProfileDropdown } = await import('../UserProfileDropdown')
    const { container } = render(
      <MemoryRouter>
        <UserProfileDropdown user={null} onLogout={vi.fn()} />
      </MemoryRouter>
    )
    expect(container).toBeTruthy()
  })

  it('removes the dedicated email row from the open dropdown', async () => {
    modalState.isOpen = true
    const { UserProfileDropdown } = await import('../UserProfileDropdown')
    render(
      <MemoryRouter>
        <UserProfileDropdown user={{ github_login: 'testuser', email: 'test@example.com', role: 'viewer' }} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.queryByText('profile.email')).toBeNull()
    expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0)
  })

  it('shows the contributor rank instead of the raw role', async () => {
    modalState.isOpen = true
    const { UserProfileDropdown } = await import('../UserProfileDropdown')
    render(
      <MemoryRouter>
        <UserProfileDropdown user={{ github_login: 'testuser', email: 'test@example.com', role: 'viewer' }} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Commander').length).toBeGreaterThan(0)
    expect(screen.queryByText('viewer')).toBeNull()
  })
})
