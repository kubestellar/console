import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({ config: {} }),
}))

vi.mock('../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: null }),
}))

vi.mock('../../../hooks/useNavigationHistory', () => ({
  useNavigationHistory: () => ({ data: [], isLoading: false, error: null }),
}))

vi.mock('../../../hooks/useLastRoute', () => ({
  useLastRoute: () => ({ data: [], isLoading: false, error: null }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: '' }),
}))

vi.mock('../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({ deduplicatedClusters: [] }),
}))

vi.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: null, wasOffline: null }),
}))

vi.mock('../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({ status: '', versionChanged: null, isInClusterMode: null }),
}))

vi.mock('../../../hooks/useDeepLink', () => ({
  useDeepLink: () => ({ data: [], isLoading: false, error: null }),
}))

vi.mock('../../../lib/cn', () => ({
  cn: vi.fn(),
}))

vi.mock('../../../hooks/useUpdateProgress', () => ({
  useUpdateProgress: () => ({ progress: null, dismiss: vi.fn() }),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

import { ContentLoadingSkeleton } from '../Layout'

describe('ContentLoadingSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><ContentLoadingSkeleton /></MemoryRouter>)
    expect(container).toBeTruthy()
  })
})
