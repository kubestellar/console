import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

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

vi.mock('lucide-react', () => ({
  Grid3X3: () => <span>Grid</span>,
  Gauge: () => <span>Gauge</span>,
  Activity: () => <span>Activity</span>,
  CircleDot: () => <span>CircleDot</span>,
  Database: () => <span>Database</span>,
}))

import { KVCacheMonitorHeader } from '../KVCacheMonitorHeader'
import type { CardsCommonTFunction } from '../KVCacheMonitor.types'
import type { LLMdStack } from '../../../../hooks/useStackDiscovery'

describe('KVCacheMonitorHeader', () => {
  const mockT = ((key: string, fallback?: string) => fallback || key) as CardsCommonTFunction

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
        selectedStack={stack as LLMdStack}
        isDemoMode={false}
        onViewModeToggle={vi.fn()}
        onAggregationModeChange={vi.fn()}
        t={mockT}
      />
    )
    expect(container).toBeTruthy()
  })
})