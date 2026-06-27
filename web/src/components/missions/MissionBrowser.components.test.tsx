import React from 'react'
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
        activeFilterCount={0}
        onClearAllFilters={vi.fn()}
        minMatchPercent={0}
        onMinMatchPercentChange={vi.fn()}
        matchSourceFilter="all"
        onMatchSourceFilterChange={vi.fn()}
        categoryFilter=""
        onCategoryFilterChange={vi.fn()}
        missionClassFilter=""
        onMissionClassFilterChange={vi.fn()}
        maturityFilter=""
        onMaturityFilterChange={vi.fn()}
        difficultyFilter=""
        onDifficultyFilterChange={vi.fn()}
        cncfFilter=""
        onCncfFilterChange={vi.fn()}
        selectedTags={new Set()}
        onTagToggle={vi.fn()}
        onClearTags={vi.fn()}
        facetCounts={{
          clusterMatched: 0,
          community: 0,
          missionClass: new Map(),
          maturity: new Map(),
          difficulty: new Map(),
          topTags: [],
        }}
        recommendationsTotal={0}
        filteredRecommendationsCount={0}
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
        fixerMissions={[]}
        filteredFixers={[]}
        loadingFixers={false}
        missionFetchError={null}
        fixerSearch=""
        onFixerSearchChange={vi.fn()}
        globalSearchActive={false}
        globalSearchQuery=""
        fixerTypeFilter=""
        onFixerTypeFilterChange={vi.fn()}
        viewMode="grid"
        onSelectMission={vi.fn()}
        onImportMission={vi.fn()}
        onCopyLink={vi.fn()}
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
        installerMissions={[]}
        filteredInstallers={[]}
        loadingInstallers={false}
        missionFetchError={null}
        installerSearch=""
        onInstallerSearchChange={vi.fn()}
        globalSearchActive={false}
        globalSearchQuery=""
        installerCategoryFilter=""
        onInstallerCategoryFilterChange={vi.fn()}
        installerMaturityFilter=""
        onInstallerMaturityFilterChange={vi.fn()}
        viewMode="grid"
        onSelectMission={vi.fn()}
        onImportMission={vi.fn()}
        onCopyLink={vi.fn()}
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
