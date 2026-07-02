import React from 'react'
/**
 * Render tests for MissionBrowser and MissionBrowserSidebar
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../hooks/useClusterContext', () => ({
  useClusterContext: () => ({
    clusterContext: { activeCluster: 'test-cluster' },
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', name: 'Test User' },
    isAuthenticated: true,
  }),
}))

vi.mock('./browser', () => ({
  BROWSER_TABS: [
    { id: 'recommended', label: 'Recommended', icon: '⭐' },
    { id: 'installers', label: 'Installers', icon: '📦' },
  ],
  missionCache: { installersDone: true, fixesDone: true },
  resetMissionCache: vi.fn(),
}))

vi.mock('./useMissionRecommendations', () => ({
  useMissionRecommendations: () => ({
    recommendations: [],
    installerMissions: [],
    fixerMissions: [],
    loadingRecommendations: false,
    loadingInstallers: false,
    loadingFixers: false,
    tokenError: null,
    missionFetchError: null,
    searchProgress: { step: '', message: '', done: true },
    hasCluster: true,
  }),
}))

vi.mock('./MissionBrowserContent', () => ({
  MissionBrowserContent: () => <div data-testid="mission-browser-content">Content</div>,
}))

describe('MissionBrowser', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  // TODO: This test requires complex mocking setup that needs to be revisited
  // The useMissionRecommendations hook is not being properly mocked due to dynamic import
  it.skip('renders without errors', async () => {
    vi.doMock('./useMissionRecommendations', () => ({
      useMissionRecommendations: () => ({
        recommendations: [],
        installerMissions: [],
        fixerMissions: [],
        loadingRecommendations: false,
        loadingInstallers: false,
        loadingFixers: false,
        tokenError: null,
        missionFetchError: null,
        searchProgress: { step: '', message: '', done: true },
        hasCluster: true,
      }),
    }))
    const { MissionBrowser } = await import('./MissionBrowser')
    const { container } = render(
      <MissionBrowser
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  }, 15000)

  it('does not render when closed', async () => {
    const { MissionBrowser } = await import('./MissionBrowser')
    const { container } = render(
      <MissionBrowser
        isOpen={false}
        onClose={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('MissionBrowserSidebar', () => {
  it('renders without errors', async () => {
    const { MissionBrowserSidebar } = await import('./MissionBrowserSidebar')
    const { container } = render(
      <MissionBrowserSidebar
        onNavigate={vi.fn()}
        selectedPath=""
      />
    )
    expect(container).toBeTruthy()
  })
})
