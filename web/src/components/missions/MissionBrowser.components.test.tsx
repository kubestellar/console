import React from 'react'
/**
 * Comprehensive render tests for remaining Mission Browser components
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock react-i18next for all components
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
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

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../lib/analytics', () => ({
  emitFixerGitHubLink: vi.fn(),
  emitNavigate: vi.fn(),
  emitEvent: vi.fn(),
  emitLogin: vi.fn(),
  analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(),
  emitCardExpanded: vi.fn(),
  emitCardRefreshed: vi.fn(),
  markErrorReported: vi.fn(),
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
        tokenError={null}
        missionFetchError={null}
        loadingRecommendations={false}
        searchProgress={{ step: 'Idle', found: 0, scanned: 0, detail: '' }}
        hasCluster={false}
        recommendations={[]}
        filteredRecommendations={[]}
        onSelectMission={vi.fn()}
        onImportMission={vi.fn()}
        onCopyLink={vi.fn()}
        loading={false}
        filteredEntries={[]}
        selectedPath=""
        selectedNode={null}
        viewMode="grid"
        onImportDirectoryEntry={vi.fn()}
        onToggleNode={vi.fn()}
        onSelectNode={vi.fn()}
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
        isActive={false}
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
