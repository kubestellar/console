/**
 * Unit tests for useSettingsTabs.
 *
 * This hook was extracted from Settings.tsx in PR #21902. Settings.test.tsx
 * already covers it indirectly via component rendering; this file adds
 * focused renderHook coverage of the hook's own contract, with the many
 * downstream data hooks it composes mocked out (mirroring the mocks used
 * by Settings.test.tsx):
 *
 *   - default activeSection and showRestoredToast
 *   - the showRestoredToast-then-auto-dismiss flow when settings were
 *     restored from a backup file
 *   - handleNavClick updating activeSection and navigating to the #hash
 *   - passthrough of the underlying theme/token/AI-mode/accessibility state
 *
 * Addresses #21906 (coverage gap for hooks extracted in #21902).
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/settings', hash: '' }),
  useNavigate: () => navigate,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { github_login: 'test' }, refreshUser: vi.fn(), isLoading: false }),
}))

vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({ themeId: 'dark', setTheme: vi.fn(), themes: [], currentTheme: { id: 'dark' } }),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0 }, updateSettings: vi.fn(), resetUsage: vi.fn(), isDemoData: false }),
}))

vi.mock('../../../hooks/useAIMode', () => ({
  useAIMode: () => ({ mode: 'balanced', setMode: vi.fn(), description: '' }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ health: 'ok', isConnected: true, refresh: vi.fn() }),
}))

vi.mock('../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({ isInClusterMode: false }),
}))

vi.mock('../../../hooks/useAccessibility', () => ({
  useAccessibility: () => ({
    colorBlindMode: false, setColorBlindMode: vi.fn(),
    reduceMotion: false, setReduceMotion: vi.fn(),
    highContrast: false, setHighContrast: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ forceCheck: vi.fn() }),
}))

vi.mock('../../../hooks/usePredictionSettings', () => ({
  usePredictionSettings: () => ({ settings: {}, updateSettings: vi.fn(), resetSettings: vi.fn() }),
}))

let mockRestoredFromFile = false
vi.mock('../../../hooks/usePersistedSettings', () => ({
  usePersistedSettings: () => ({
    restoredFromFile: mockRestoredFromFile,
    syncStatus: 'idle',
    lastSaved: null,
    filePath: null,
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
  }),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, BANNER_DISMISS_MS: 3000, UI_FEEDBACK_TIMEOUT_MS: 2000, TOOLTIP_HIDE_DELAY_MS: 50 }
})

vi.mock('../Settings.parts', () => ({
  SETTINGS_NAV: [{ items: [{ id: 'ai-mode-settings' }, { id: 'profile-settings' }] }],
}))

import { useSettingsTabs } from '../useSettingsTabs'

describe('useSettingsTabs', () => {
  beforeEach(() => {
    mockRestoredFromFile = false
    navigate.mockClear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults activeSection to ai-mode-settings and hides the restored toast', () => {
    const { result } = renderHook(() => useSettingsTabs())
    expect(result.current.activeSection).toBe('ai-mode-settings')
    expect(result.current.showRestoredToast).toBe(false)
  })

  it('shows the restored-from-file toast and auto-dismisses it after BANNER_DISMISS_MS', () => {
    mockRestoredFromFile = true
    const { result } = renderHook(() => useSettingsTabs())
    expect(result.current.showRestoredToast).toBe(true)

    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.showRestoredToast).toBe(false)
  })

  it('handleNavClick updates activeSection and pushes the #hash via navigate', () => {
    const { result } = renderHook(() => useSettingsTabs())
    act(() => { result.current.handleNavClick('profile-settings') })
    expect(result.current.activeSection).toBe('profile-settings')
    expect(navigate).toHaveBeenCalledWith('#profile-settings', { replace: true })
  })

  it('passes through theme, token usage, and accessibility state unchanged', () => {
    const { result } = renderHook(() => useSettingsTabs())
    expect(result.current.themeId).toBe('dark')
    expect(result.current.usage).toEqual({ total: 0 })
    expect(result.current.colorBlindMode).toBe(false)
    expect(result.current.isInClusterMode).toBe(false)
  })
})
