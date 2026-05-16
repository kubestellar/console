import type { DependencyList, ReactNode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCluster: vi.fn(), drillToNamespace: vi.fn(), drillToPod: vi.fn() }),
}))

async function loadLogsDrillDown() {
  const module = await import('../LogsDrillDown')
  return module.LogsDrillDown
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.doUnmock('react')
  vi.resetModules()
})

describe('LogsDrillDown', () => {
  it('renders without crashing', async () => {
    const LogsDrillDown = await loadLogsDrillDown()
    const { container } = render(<LogsDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1' }} />)
    expect(container).toBeTruthy()
  })

  it('shows an empty state when no visible log lines remain', async () => {
    vi.doMock('react', async () => {
      const actual = await vi.importActual<typeof import('react')>('react')
      let useMemoCallCount = 0

      return {
        ...actual,
        useMemo: <T,>(factory: () => T, deps?: DependencyList) => {
          useMemoCallCount += 1
          if (useMemoCallCount <= 2) {
            return [] as T
          }
          return actual.useMemo(factory, deps)
        },
      }
    })

    const LogsDrillDown = await loadLogsDrillDown()
    render(<LogsDrillDown data={{ cluster: 'c1', namespace: 'ns1', pod: 'pod1' }} />)

    expect(screen.getByText('drilldown.logs.noLogsMatchFilter')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'drilldown.logs.download' })).toBeDisabled()
  })
})
