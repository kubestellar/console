import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MissionBrowserFilterPanel } from './MissionBrowserFilterPanel'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const mockFacetCounts = {
  clusterMatched: 10,
  community: 50,
  missionClass: new Map([['installer', 20], ['fixer', 15]]),
  maturity: new Map([['stable', 25], ['beta', 10]]),
  difficulty: new Map([['beginner', 15], ['intermediate', 20]]),
  topTags: [
    { tag: 'kubernetes', count: 30 },
    { tag: 'monitoring', count: 20 },
  ],
}

describe('MissionBrowserFilterPanel', () => {
  it('renders without errors', () => {
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
        facetCounts={mockFacetCounts}
        recommendationsTotal={100}
        filteredRecommendationsCount={50}
      />
    )
    expect(container).toBeTruthy()
  })

  it('displays active filter count when filters are applied', () => {
    render(
      <MissionBrowserFilterPanel
        activeFilterCount={3}
        onClearAllFilters={vi.fn()}
        minMatchPercent={50}
        onMinMatchPercentChange={vi.fn()}
        matchSourceFilter="cluster"
        onMatchSourceFilterChange={vi.fn()}
        categoryFilter="Monitoring"
        onCategoryFilterChange={vi.fn()}
        missionClassFilter="installer"
        onMissionClassFilterChange={vi.fn()}
        maturityFilter="stable"
        onMaturityFilterChange={vi.fn()}
        difficultyFilter="beginner"
        onDifficultyFilterChange={vi.fn()}
        cncfFilter=""
        onCncfFilterChange={vi.fn()}
        selectedTags={new Set()}
        onTagToggle={vi.fn()}
        onClearTags={vi.fn()}
        facetCounts={mockFacetCounts}
        recommendationsTotal={100}
        filteredRecommendationsCount={25}
      />
    )
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('calls onClearAllFilters when clear button is clicked', () => {
    const onClearAllFilters = vi.fn()
    render(
      <MissionBrowserFilterPanel
        activeFilterCount={2}
        onClearAllFilters={onClearAllFilters}
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
        facetCounts={mockFacetCounts}
        recommendationsTotal={100}
        filteredRecommendationsCount={50}
      />
    )
    const clearButton = screen.getAllByRole('button').find(btn => btn.textContent?.includes('actions.clearAll'))
    clearButton?.click()
    expect(onClearAllFilters).toHaveBeenCalled()
  })
})
