/**
 * Settings Page Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/settings', hash: '' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { github_login: 'test', email: 'test@test.com' }, isAuthenticated: true }),
}))

vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
    themes: [{ id: 'dark', name: 'Dark' }],
    currentTheme: { id: 'dark', name: 'Dark', description: '' },
  }),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ totalTokens: 0, maxTokens: 10000 }),
}))

vi.mock('../../../hooks/useAIMode', () => ({
  useAIMode: () => ({ mode: 'balanced', setMode: vi.fn() }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: false, status: 'disconnected' }),
}))

vi.mock('../../../hooks/useAccessibility', () => ({
  useAccessibility: () => ({
    settings: { reduceMotion: false, highContrast: false },
    updateSettings: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ hasUpdate: false }),
}))

vi.mock('../../../hooks/usePredictionSettings', () => ({
  usePredictionSettings: () => ({ settings: {}, updateSettings: vi.fn() }),
}))

vi.mock('../../../hooks/usePersistedSettings', () => ({
  usePersistedSettings: () => ({
    syncStatus: 'idle',
    lastSynced: null,
  }),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  BANNER_DISMISS_MS: 5000,
  UI_FEEDBACK_TIMEOUT_MS: 2000,
  TOOLTIP_HIDE_DELAY_MS: 300,
} })

vi.mock('../../../config/routes', () => ({
  ROUTES: { SETTINGS: '/settings', HOME: '/' },
}))

vi.mock('../UpdateSettings', () => ({
  UpdateSettings: () => null,
}))

vi.mock('../sections', () => ({
  AISettingsSection: () => null,
  ProfileSection: () => null,
  AgentSection: () => null,
  GitHubTokenSection: () => null,
  TokenUsageSection: () => null,
  ThemeSection: () => null,
  AccessibilitySection: () => null,
  PermissionsSection: () => null,
  PredictionSettingsSection: () => null,
  WidgetSettingsSection: () => null,
  NotificationSettingsSection: () => null,
  PersistenceSection: () => null,
  LocalClustersSection: () => null,
  SettingsBackupSection: () => null,
  AnalyticsSection: () => null,
}))

vi.mock('../../../lib/cn', () => ({
  cn: (...args: string[]) => (args || []).filter(Boolean).join(' '),
}))

describe('Settings', () => {
  it('exports Settings component', async () => {
    const mod = await import('../Settings')
    expect(mod.Settings).toBeDefined()
    expect(typeof mod.Settings).toBe('function')
  })
})
