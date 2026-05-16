import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

const mockUseCardLoadingState = vi.fn()
const mockUseNightlyE2EData = vi.fn()

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => {
    mockUseCardLoadingState(opts)
    return { showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false }
  },
}))

vi.mock('../../../../hooks/useNightlyE2EData', () => ({
  useNightlyE2EData: () => mockUseNightlyE2EData(),
}))

vi.mock('../../../../hooks/useAIMode', () => ({
  useAIMode: () => ({ shouldSummarize: null }),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: null }),
}))

import NightlyE2EStatus from '../NightlyE2EStatus'

describe('NightlyE2EStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseNightlyE2EData.mockReturnValue({ guides: [], isDemoFallback: false, isFailed: false, consecutiveFailures: 0, isLoading: false, isRefreshing: false })
  })

  it('renders without crashing', () => {
    const { container } = render(<NightlyE2EStatus />)
    expect(container).toBeTruthy()
  })

  it('passes isRefreshing through to useCardLoadingState', () => {
    mockUseNightlyE2EData.mockReturnValue({ guides: [], isDemoFallback: false, isFailed: false, consecutiveFailures: 0, isLoading: false, isRefreshing: true })

    render(<NightlyE2EStatus />)

    expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({ isRefreshing: true }))
  })
})
