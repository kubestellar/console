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
vi.mock('../../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../hooks/useDemoMode')>()),
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}
))

vi.mock('../../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(), markErrorReported: vi.fn(),
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

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  ComposedChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

import { KVCacheMonitorVisualization } from '../KVCacheMonitorChart'

describe('KVCacheMonitorChart', () => {
  const mockT = ((key: string, fallback?: string) => fallback || key) as any

  it('renders without crashing with empty data', () => {
    const { container } = render(
      <KVCacheMonitorVisualization
        gaugeRefs={{ current: {} }}
        isDemoData={true}
        isExpanded={false}
        onGaugeClick={vi.fn()}
        selectedPod={null}
        stats={[]}
        t={mockT}
        viewMode="gauges"
      />
    )
    expect(container).toBeTruthy()
  })

  it('renders with pod history data', () => {
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
    const { container } = render(
      <KVCacheMonitorVisualization
        gaugeRefs={{ current: {} }}
        isDemoData={false}
        isExpanded={false}
        onGaugeClick={vi.fn()}
        selectedPod="pod-0"
        stats={stats}
        t={mockT}
        viewMode="gauges"
      />
    )
    expect(container).toBeTruthy()
  })
})
