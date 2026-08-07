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

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../../charts/LazyEChart', () => ({
  LazyEChart: () => <div data-testid="lazy-echart" />,
}))

vi.mock('../../../../hooks/useBenchmarkData', () => ({
  useCachedBenchmarkReports: () => ({ data: [], isLoading: false, error: null }),
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import ParetoFrontier from '../ParetoFrontier'

describe('ParetoFrontier', () => {
  it('renders without crashing', () => {
    const { container } = render(<ParetoFrontier />)
    expect(container).toBeTruthy()
  })

  it('renders with a specific chart config', () => {
    const { container } = render(<ParetoFrontier config={{ chartType: 'throughput' }} />)
    expect(container).toBeTruthy()
  })
})
