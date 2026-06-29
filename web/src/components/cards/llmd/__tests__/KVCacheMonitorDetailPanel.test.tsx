import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }))
vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(), markErrorReported: vi.fn(),
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

vi.mock('../KVCacheMonitorChart', () => ({
  default: () => <div data-testid="kvcache-chart">Chart</div>,
}))

import { KVCacheMonitorDetailPanel } from '../KVCacheMonitorDetailPanel'

describe('KVCacheMonitorDetailPanel', () => {
  const mockT = ((key: string, fallback?: string) => fallback || key) as any

  it('renders nothing when no selected pod', () => {
    const { container } = render(
      <KVCacheMonitorDetailPanel
        selectedPod={null}
        panelPosition={null}
        stats={[]}
        podHistory={{}}
        selectedMetrics={['util']}
        onToggleMetric={vi.fn()}
        onClose={vi.fn()}
        isDemoData={false}
        t={mockT}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders panel when pod is selected', () => {
    const stats = [
      {
        cluster: 'test',
        namespace: 'default',
        podName: 'pod-0',
        utilizationPercent: 75,
        hitRate: 0.9,
        evictionRate: 0.01,
        totalCapacityGB: 80,
        usedGB: 60,
        lastUpdated: new Date(),
      },
    ]
    const { getByTestId } = render(
      <KVCacheMonitorDetailPanel
        selectedPod="pod-0"
        panelPosition={{ x: 100, y: 100 }}
        stats={stats}
        podHistory={{ 'pod-0': { util: [75], hitRate: [90] } }}
        selectedMetrics={['util']}
        onToggleMetric={vi.fn()}
        onClose={vi.fn()}
        isDemoData={false}
        t={mockT}
      />
    )
    expect(getByTestId('kvcache-chart')).toBeTruthy()
  })
})
