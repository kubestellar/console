/**
 * RewardsPanel component smoke tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
  emitLinkedInShare: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../hooks/useRewards', () => ({
  useRewards: () => ({
    totalCoins: 0,
    earnedAchievements: [],
    recentEvents: [],
    hasEarnedAction: () => false,
    getActionCount: () => 0,
    githubRewards: [],
    githubPoints: 0,
    refreshGitHubRewards: vi.fn(),
  }),
  REWARD_ACTIONS: [],
  ACHIEVEMENTS: [],
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

describe('RewardsPanel', () => {
  it('exports RewardsPanel component', async () => {
    const mod = await import('../RewardsPanel')
    expect(mod.RewardsPanel).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})
