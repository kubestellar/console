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
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

import { NightlySummaryPanel, GuideDetailPanel } from '../NightlyE2EDetailPanel'

describe('NightlyE2EDetailPanel', () => {
  it('renders without crashing when no guide selected', () => {
    const { container } = render(
      <NightlySummaryPanel guides={[]} />
    )
    expect(container).toBeTruthy()
  })

  it('renders with selected guide', () => {
    const guide = {
      guide: 'llama-3-70b',
      acronym: 'L3',
      model: 'llama-3-70b',
      gpuType: 'H100',
      gpuCount: 4,
      platform: 'OCP' as const,
      repo: 'test/repo',
      workflowFile: 'test.yml',
      runs: [],
      passRate: 0.95,
      trend: 'up' as const,
      latestConclusion: 'success',
    }
    const { container } = render(
      <GuideDetailPanel
        guide={guide as any}
        hoveredRun={null}
        onRunHover={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})
