/**
 * UserProfileDropdown Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const changeLanguage = vi.fn()
const safeSetItem = vi.fn()

const { demoModeState } = vi.hoisted(() => ({
  demoModeState: { isForced: false },
}))

const modalState = vi.hoisted(() => ({
  isOpen: false,
  open: vi.fn(),
  close: vi.fn(),
  toggle: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', resolvedLanguage: 'en', changeLanguage } }),
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
  LANGUAGE_STORAGE_KEY: 'i18nextLng',
  languages: [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'zh', name: '中文 (简体)', flag: '🇨🇳' },
  ],
}))

vi.mock('../../../lib/demoMode', () => ({
  get isDemoModeForced() {
    return demoModeState.isForced
  },
}))

const emitLanguageChanged = vi.fn()

vi.mock('../../../lib/analytics', () => ({
  emitLinkedInShare: vi.fn(),
  emitLanguageChanged,
}))

vi.mock('../../../lib/api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ oauthConfigured: false, backendUp: false }),
}))

vi.mock('../../../lib/utils/localStorage', () => ({
  safeSetItem,
}))

vi.mock('../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: () => null,
}))

vi.mock('../../setup/DeveloperSetupDialog', () => ({
  DeveloperSetupDialog: () => null,
}))

vi.mock('../../../lib/modals/ConfirmDialog', () => ({
  ConfirmDialog: ({ isOpen, onClose, onConfirm, title, message, confirmLabel }: {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmLabel?: string
  }) => (
    isOpen ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <span>{message}</span>
        <button onClick={onClose}>cancel-confirm</button>
        <button onClick={onConfirm}>{confirmLabel || 'confirm'}</button>
      </div>
    ) : null
  ),
}))

describe('UserProfileDropdown', () => {
  beforeEach(() => {
    modalState.isOpen = false
    changeLanguage.mockReset()
    changeLanguage.mockResolvedValue(undefined)
    safeSetItem.mockReset()
    emitLanguageChanged.mockReset()
    demoModeState.isForced = false
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

  it('shows the contributor rank once instead of duplicating it in the coins row', async () => {
    modalState.isOpen = true
    const { UserProfileDropdown } = await import('../UserProfileDropdown')
    render(
      <MemoryRouter>
        <UserProfileDropdown user={{ github_login: 'testuser', email: 'test@example.com', role: 'viewer' }} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Commander')).toHaveLength(1)
    expect(screen.queryByText('viewer')).toBeNull()
  })

  it('changes language and persists the selection', async () => {
    modalState.isOpen = true
    const { UserProfileDropdown } = await import('../UserProfileDropdown')
    render(
      <MemoryRouter>
        <UserProfileDropdown user={{ github_login: 'testuser', email: 'test@example.com', role: 'viewer' }} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('profile.language'))
    fireEvent.click(screen.getByText('中文 (简体)'))

    await waitFor(() => {
      expect(changeLanguage).toHaveBeenCalledWith('zh')
      expect(safeSetItem).toHaveBeenCalledWith('i18nextLng', 'zh')
      expect(emitLanguageChanged).toHaveBeenCalledWith('zh')
    })
  })

  it('opens a logout confirmation and waits for confirm before logging out', async () => {
    modalState.isOpen = true
    const onLogout = vi.fn()
    const { UserProfileDropdown } = await import('../UserProfileDropdown')
    render(
      <MemoryRouter>
        <UserProfileDropdown user={{ github_login: 'testuser', email: 'test@example.com', role: 'viewer' }} onLogout={onLogout} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'actions.signOut' }))

    expect(onLogout).not.toHaveBeenCalled()
    expect(await screen.findByTestId('confirm-dialog')).toBeInTheDocument()
    expect(screen.getByText('confirmDialog.logoutTitle')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'actions.logout' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
