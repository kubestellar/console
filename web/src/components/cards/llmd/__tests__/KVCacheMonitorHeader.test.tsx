import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('lucide-react', () => ({
  Grid3x3: () => <span>Grid</span>,
  Gauge: () => <span>Gauge</span>,
  Activity: () => <span>Activity</span>,
}))

import KVCacheMonitorHeader from '../KVCacheMonitorHeader'

describe('KVCacheMonitorHeader', () => {
  const mockT = ((key: string, fallback?: string) => fallback || key) as any

  it('renders without crashing', () => {
    const { container } = render(
      <KVCacheMonitorHeader
        viewMode="gauges"
        aggregationMode="aggregated"
        selectedStack={null}
        isDemoMode={true}
        onViewModeToggle={vi.fn()}
        onAggregationModeChange={vi.fn()}
        t={mockT}
      />
    )
    expect(container).toBeTruthy()
  })

  it('renders with selected stack', () => {
    const stack = {
      cluster: 'test',
      namespace: 'llmd',
      name: 'test-stack',
      components: {
        prefill: [],
        decode: [],
        both: [],
      },
    }
    const { container } = render(
      <KVCacheMonitorHeader
        viewMode="heatmap"
        aggregationMode="disaggregated"
        selectedStack={stack as any}
        isDemoMode={false}
        onViewModeToggle={vi.fn()}
        onAggregationModeChange={vi.fn()}
        t={mockT}
      />
    )
    expect(container).toBeTruthy()
  })
})
