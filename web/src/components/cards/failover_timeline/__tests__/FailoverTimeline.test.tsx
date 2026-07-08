import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../hooks/useDemoMode')>()),
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}
))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../useFailoverTimeline', () => ({
  useFailoverTimeline: () => ({
    data: {
      events: [
        {
          timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          eventType: 'cluster_down',
          cluster: 'member-ap-south',
          workload: '',
          details: 'Cluster transitioned to NotReady state',
          severity: 'critical',
        },
      ],
      activeClusters: 3,
      totalClusters: 4,
      lastFailover: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      lastCheckTime: new Date().toISOString(),
    },
    isRefreshing: false,
    error: false,
    showSkeleton: false,
    showEmptyState: false,
    lastRefresh: Date.now() - 30 * 1000,
  }),
}))

import { FailoverTimeline } from '../FailoverTimeline'

describe('FailoverTimeline', () => {
  it('renders a freshness indicator from cache refresh time', () => {
    const { container } = render(<FailoverTimeline />)
    expect(container).toBeTruthy()
    expect(screen.getByLabelText(/Last updated:/i)).toBeInTheDocument()
  })
})
