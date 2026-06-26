import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../KVCacheMonitorChart', () => ({
  default: () => <div data-testid="kvcache-chart">Chart</div>,
}))

import KVCacheMonitorDetailPanel from '../KVCacheMonitorDetailPanel'

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
