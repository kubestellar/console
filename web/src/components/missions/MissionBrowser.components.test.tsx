/**
 * Comprehensive render tests for remaining Mission Browser components
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock react-i18next for all components
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'missions.browser.title': 'Mission Browser',
        'missions.browser.close': 'Close',
        'missions.browser.loading': 'Loading missions...',
        'missions.browser.noResults': 'No missions found',
        'actions.confirm': 'Confirm',
        'actions.cancel': 'Cancel',
      }
      return map[key] ?? key
    },
  }),
}))

// Mock router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/' }),
}))

describe('MissionBrowserFilterPanel', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('renders without errors', async () => {
    const { MissionBrowserFilterPanel } = await import('./MissionBrowserFilterPanel')
    const { container } = render(
      <MissionBrowserFilterPanel
        activeTab="installers"
        installerFilters={{
          categories: [],
          maturity: [],
          difficulty: [],
          installMethods: [],
        }}
        onInstallerFiltersChange={vi.fn()}
        fixerFilters={{ types: [], categories: [], tags: [] }}
        onFixerFiltersChange={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('MissionBrowserFixesTab', () => {
  it('renders without errors', async () => {
    const { MissionBrowserFixesTab } = await import('./MissionBrowserFixesTab')
    const { container } = render(
      <MissionBrowserFixesTab
        missions={[]}
        onImport={vi.fn()}
        onSelect={vi.fn()}
        viewMode="grid"
        searchQuery=""
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('MissionBrowserInstallersTab', () => {
  it('renders without errors', async () => {
    const { MissionBrowserInstallersTab } = await import('./MissionBrowserInstallersTab')
    const { container } = render(
      <MissionBrowserInstallersTab
        missions={[]}
        onImport={vi.fn()}
        onSelect={vi.fn()}
        viewMode="grid"
        searchQuery=""
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('MissionBrowserRecommendedTab', () => {
  it('renders without errors', async () => {
    const { MissionBrowserRecommendedTab } = await import('./MissionBrowserRecommendedTab')
    const { container } = render(
      <MissionBrowserRecommendedTab
        installers={[]}
        fixers={[]}
        onImport={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('MissionBrowserScheduleActionTab', () => {
  it('renders without errors', async () => {
    const { MissionBrowserScheduleActionTab } = await import('./MissionBrowserScheduleActionTab')
    const { container } = render(
      <MissionBrowserScheduleActionTab
        onClose={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('MissionContentContext', () => {
  it('exports MissionContentProvider', async () => {
    const module = await import('./MissionContentContext')
    expect(module.MissionContentProvider).toBeDefined()
  })

  it('exports useMissionContent hook', async () => {
    const module = await import('./MissionContentContext')
    expect(module.useMissionContent).toBeDefined()
  })
})
