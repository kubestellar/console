/**
 * UserProfileDropdown Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useRewards', () => ({
  useRewards: () => ({ points: 100, history: [] }),
  REWARD_ACTIONS: {},
}))

vi.mock('../../../types/rewards', () => ({
  getContributorLevel: () => ({ name: 'Bronze', threshold: 0 }),
}))

vi.mock('../../../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ hasUpdate: false }),
}))

vi.mock('../../../lib/i18n', () => ({
  languages: [{ code: 'en', name: 'English' }],
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoModeForced: () => true,
}))

vi.mock('../../../lib/analytics', () => ({
  emitLinkedInShare: vi.fn(),
  emitLanguageChanged: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ configured: false, backendUp: false }),
}))

vi.mock('../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: () => null,
}))

vi.mock('../../setup/DeveloperSetupDialog', () => ({
  DeveloperSetupDialog: () => null,
}))

describe('UserProfileDropdown', () => {
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
})
