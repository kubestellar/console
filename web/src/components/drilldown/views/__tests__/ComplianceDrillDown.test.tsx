import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseTrestle, mockUseGlobalFilters } = vi.hoisted(() => ({
  mockUseTrestle: vi.fn(),
  mockUseGlobalFilters: vi.fn(),
}))

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

vi.mock('../../../../hooks/useTrestle', () => ({
  useTrestle: () => mockUseTrestle(),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}))

import ComplianceDrillDown from '../ComplianceDrillDown'

describe('ComplianceDrillDown', () => {
  beforeEach(() => {
    mockUseTrestle.mockReturnValue({ statuses: {} })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [] })
  })

  it('renders without crashing', () => {
    const { container } = render(<ComplianceDrillDown data={{ filterStatus: '' }} />)
    expect(container).toBeTruthy()
  })

  it('shows the same aggregate totals passed from the stats overview', () => {
    render(<ComplianceDrillDown data={{ passing: 165, failing: 42, warning: 8, totalChecks: 215 }} />)

    expect(screen.getByText('Compliance Overview')).toBeTruthy()
    expect(screen.getByText('215')).toBeTruthy()
    expect(screen.getByText('165')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('8')).toBeTruthy()
  })

  it('normalizes dashboard status aliases to trestle status filters', () => {
    mockUseTrestle.mockReturnValue({
      statuses: {
        'cluster-a': {
          installed: true,
          controlResults: [
            { controlId: 'AC-1', title: 'Passing control', status: 'pass', severity: 'low' },
            { controlId: 'AC-2', title: 'Failing control', status: 'fail', severity: 'high' },
          ],
        },
      },
    })

    render(<ComplianceDrillDown data={{ filterStatus: 'passing' }} />)

    expect(screen.getByText('Passing control')).toBeTruthy()
    expect(screen.queryByText('Failing control')).toBeNull()
  })
})
