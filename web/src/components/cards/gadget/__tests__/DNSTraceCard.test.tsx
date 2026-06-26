import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

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

vi.mock('../../../../hooks/useGadget', () => ({
  useCachedDNSTraces: () => ({ data: [], isLoading: false, isRefreshing: false, isDemoData: false, isFailed: false, consecutiveFailures: 0 }),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false }),
  useCardDemoState: () => ({ shouldUseDemoData: null }),
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false }),
}))

import { DNSTraceCard } from '../DNSTraceCard'

describe('DNSTraceCard', () => {
  it('renders without crashing', () => {
    const { container } = render(<DNSTraceCard />)
    expect(container).toBeTruthy()
  })
})
