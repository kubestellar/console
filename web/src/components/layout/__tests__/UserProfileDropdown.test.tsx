/// <reference types="@testing-library/jest-dom/vitest" />
import type { ComponentProps, ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserProfileDropdown } from '../UserProfileDropdown'

const { changeLanguage, safeSetItem, emitLanguageChanged, demoModeState } = vi.hoisted(() => ({
  changeLanguage: vi.fn(),
  safeSetItem: vi.fn(),
  emitLanguageChanged: vi.fn(),
  demoModeState: { isForced: false },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en', changeLanguage },
  }),
}))

vi.mock('../../../hooks/useKeyboardNav', async () => {
  const React = await import('react')
  const { moveFocusByKey } = await vi.importActual<typeof import('../../../lib/a11y/rovingFocus')>('../../../lib/a11y/rovingFocus')

  return {
    useKeyboardNav: ({
      selector = '[role="menuitem"]:not([disabled])',
      onEscape,
    }: {
      selector?: string
      onEscape?: () => void
    } = {}) => {
      const containerRef = React.useRef<HTMLElement | null>(null)
      const getItems = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>(selector) ?? [])
        .filter((item) => !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true')

      return {
        containerRef,
        focusMatchingItem: () => {
          const firstItem = getItems()[0] ?? null
          firstItem?.focus()
          return firstItem
        },
        focusLastItem: () => {
          const items = getItems()
          const lastItem = items[items.length - 1] ?? null
          lastItem?.focus()
          return lastItem
        },
        handleKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onEscape?.()
            return
          }
          moveFocusByKey(event, { selector, orientation: 'vertical' })
        },
      }
    },
  }
})

vi.mock('../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
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

vi.mock('../../../lib/analytics', () => ({
  emitLinkedInShare: vi.fn(),
  emitLanguageChanged,
}))

vi.mock('../../../lib/api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ oauthConfigured: true, backendUp: true }),
  authFetch: vi.fn(),
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
        <button type="button" onClick={onClose}>cancel-confirm</button>
        <button type="button" onClick={onConfirm}>{confirmLabel || 'confirm'}</button>
      </div>
    ) : null
  ),
}))

const TEST_USER = {
  github_login: 'testuser',
  email: 'test@example.com',
  role: 'viewer',
  slack_id: 'U123456',
}

function renderDropdown(overrides: Partial<ComponentProps<typeof UserProfileDropdown>> = {}) {
  render(
    <UserProfileDropdown
      user={TEST_USER}
      onLogout={vi.fn()}
      onPreferences={vi.fn()}
      {...overrides}
    />,
  )
}

async function openDropdown() {
  const user = userEvent.setup()
  await user.click(screen.getByTestId('navbar-profile-btn'))
  await screen.findByTestId('navbar-profile-dropdown')
  return user
}

function getMenuItems() {
  return within(screen.getByTestId('navbar-profile-dropdown')).getAllByRole('menuitem')
}

describe('UserProfileDropdown', () => {
  beforeEach(() => {
    changeLanguage.mockReset()
    changeLanguage.mockResolvedValue(undefined)
    safeSetItem.mockReset()
    emitLanguageChanged.mockReset()
    demoModeState.isForced = false
  })

  it('renders with null user', () => {
    renderDropdown({ user: null })
    expect(screen.queryByTestId('navbar-profile-btn')).not.toBeInTheDocument()
  })

  it('shows the contributor rank once instead of duplicating it in the coins row', async () => {
    renderDropdown()
    await openDropdown()

    expect(screen.getAllByText('Commander')).toHaveLength(1)
    expect(screen.queryByText(TEST_USER.role)).toBeNull()
  })

  it('changes language and persists the selection', async () => {
    renderDropdown()
    const user = await openDropdown()

    await user.click(screen.getByText('profile.language'))
    await user.click(screen.getByText('中文 (简体)'))

    await waitFor(() => {
      expect(changeLanguage).toHaveBeenCalledWith('zh')
      expect(safeSetItem).toHaveBeenCalledWith('i18nextLng', 'zh')
      expect(emitLanguageChanged).toHaveBeenCalledWith('zh')
    })
  })

  it('opens a logout confirmation and waits for confirm before logging out', async () => {
    const onLogout = vi.fn()
    renderDropdown({ onLogout })
    const user = await openDropdown()

    await user.click(screen.getByRole('menuitem', { name: 'actions.signOut' }))

    expect(onLogout).not.toHaveBeenCalled()
    expect(await screen.findByTestId('confirm-dialog')).toBeInTheDocument()
    expect(screen.getByText('confirmDialog.logoutTitle')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'actions.logout' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  describe('keyboard navigation', () => {
    it('moves focus to the next menu item on ArrowDown', async () => {
      renderDropdown()
      const user = await openDropdown()
      const items = getMenuItems()

      items[0].focus()
      await user.keyboard('{ArrowDown}')

      expect(items[1]).toHaveFocus()
    })

    it('moves focus to the previous menu item on ArrowUp', async () => {
      renderDropdown()
      const user = await openDropdown()
      const items = getMenuItems()

      items[1].focus()
      await user.keyboard('{ArrowUp}')

      expect(items[0]).toHaveFocus()
    })

    it('moves focus to the first menu item on Home', async () => {
      renderDropdown()
      const user = await openDropdown()
      const items = getMenuItems()

      items[items.length - 1].focus()
      await user.keyboard('{Home}')

      expect(items[0]).toHaveFocus()
    })

    it('moves focus to the last menu item on End', async () => {
      renderDropdown()
      const user = await openDropdown()
      const items = getMenuItems()

      items[0].focus()
      await user.keyboard('{End}')

      expect(items[items.length - 1]).toHaveFocus()
    })

    it('closes the dropdown on Escape', async () => {
      renderDropdown()
      const user = await openDropdown()
      const items = getMenuItems()

      items[0].focus()
      await user.keyboard('{Escape}')

      expect(screen.queryByTestId('navbar-profile-dropdown')).not.toBeInTheDocument()
    })

    it('wraps focus from the last menu item back to the first', async () => {
      renderDropdown()
      const user = await openDropdown()
      const items = getMenuItems()

      items[items.length - 1].focus()
      await user.keyboard('{ArrowDown}')

      expect(items[0]).toHaveFocus()
    })
  })
})
