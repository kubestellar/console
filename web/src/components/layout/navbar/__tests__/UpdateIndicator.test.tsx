import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ hasUpdate: null, latestRelease: null, channel: null, autoUpdateStatus: null, latestMainSHA: null, skipVersion: null }),
}))

vi.mock('../../../../hooks/useFeatureHints', () => ({
  useFeatureHints: () => ({ data: [], isLoading: false, error: null }),
}))

import { UpdateIndicator } from '../UpdateIndicator'
import { ToastProvider } from '../../../ui/Toast'

describe('UpdateIndicator', () => {
  it('renders nothing when there is no update available', () => {
    // useVersionCheck is mocked to return hasUpdate=null + no release, so the
    // component should early-return null. Assert on the DOM, not on whether
    // render() succeeded — `container` is always truthy if render didn't throw.
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <UpdateIndicator />
        </ToastProvider>
      </MemoryRouter>
    )
    expect(container.firstChild).toBeNull()
  })
})
