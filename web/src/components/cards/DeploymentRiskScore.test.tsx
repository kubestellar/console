import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => false, getDemoMode: () => false, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => false, hasRealToken: () => true, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useDemoMode')>()),
  getDemoMode: () => false, default: () => false,
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => true, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => false, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../hooks/useArgoCD', () => ({
  useArgoCDApplications: () => ({
    applications: [],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    isDemoData: false,
  }),
}))

vi.mock('../../hooks/useKyverno', () => ({
  useKyverno: () => ({
    policies: [],
    policyReports: [],
    clusterStatuses: [],
    isLoading: false,
    isFailed: false,
  }),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedAllPods: () => ({
    pods: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  }),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false }),
}))

import DeploymentRiskScore from './DeploymentRiskScore'

describe('DeploymentRiskScore', () => {
  it('renders without crashing', () => {
    const { container } = render(<DeploymentRiskScore />)
    expect(container).toBeTruthy()
  })

  it('renders the card root element', () => {
    const { container } = render(<DeploymentRiskScore />)
    expect(container.firstChild).toBeTruthy()
  })
})
