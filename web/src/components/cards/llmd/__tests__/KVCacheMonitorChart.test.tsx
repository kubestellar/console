import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
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

import KVCacheMonitorChart from '../KVCacheMonitorChart'

describe('KVCacheMonitorChart', () => {
  const mockT = ((key: string, fallback?: string) => fallback || key) as any

  it('renders without crashing with empty data', () => {
    const { container } = render(
      <KVCacheMonitorChart
        podHistory={{}}
        selectedPod={null}
        selectedMetrics={['util']}
        t={mockT}
      />
    )
    expect(container).toBeTruthy()
  })

  it('renders with pod history data', () => {
    const podHistory = {
      'pod-0': {
        util: [50, 60, 70],
        hitRate: [90, 91, 92],
      },
    }
    const { container } = render(
      <KVCacheMonitorChart
        podHistory={podHistory}
        selectedPod="pod-0"
        selectedMetrics={['util', 'hitRate']}
        t={mockT}
      />
    )
    expect(container).toBeTruthy()
  })
})
