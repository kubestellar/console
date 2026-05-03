import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MissionBrowserFilterPanel } from '../MissionBrowserFilterPanel'

function renderPanel(overrides: Partial<ComponentProps<typeof MissionBrowserFilterPanel>> = {}) {
  const props: ComponentProps<typeof MissionBrowserFilterPanel> = {
    activeFilterCount: 2,
    onClearAllFilters: vi.fn(),
    minMatchPercent: 0,
    onMinMatchPercentChange: vi.fn(),
    matchSourceFilter: 'all',
    onMatchSourceFilterChange: vi.fn(),
    categoryFilter: 'All',
    onCategoryFilterChange: vi.fn(),
    missionClassFilter: 'All',
    onMissionClassFilterChange: vi.fn(),
    maturityFilter: 'All',
    onMaturityFilterChange: vi.fn(),
    difficultyFilter: 'All',
    onDifficultyFilterChange: vi.fn(),
    cncfFilter: '',
    onCncfFilterChange: vi.fn(),
    selectedTags: new Set(),
    onTagToggle: vi.fn(),
    onClearTags: vi.fn(),
    facetCounts: {
      clusterMatched: 3,
      community: 4,
      missionClass: new Map([['installer', 2]]),
      maturity: new Map([['sandbox', 5]]),
      difficulty: new Map([['easy', 3]]),
      topTags: [{ tag: 'security', count: 2 }],
    },
    recommendationsTotal: 10,
    filteredRecommendationsCount: 4,
    ...overrides,
  }

  return { props, ...render(<MissionBrowserFilterPanel {...props} />) }
}

describe('MissionBrowserFilterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders summary and clear-all when filters are active', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
    expect(screen.getByText(/Showing\s+4\s+of\s+10\s+missions/)).toBeInTheDocument()
  })

  it('calls callbacks for match/source/category controls', async () => {
    const user = userEvent.setup()
    const { props } = renderPanel()

    await user.click(screen.getByRole('button', { name: '≥25%' }))
    await user.click(screen.getByRole('button', { name: /🎯 Cluster \(3\)/ }))
    await user.click(screen.getByRole('button', { name: 'Deploy' }))

    expect(props.onMinMatchPercentChange).toHaveBeenCalledWith(25)
    expect(props.onMatchSourceFilterChange).toHaveBeenCalledWith('cluster')
    expect(props.onCategoryFilterChange).toHaveBeenCalledWith('Deploy')
  })

  it('updates cncf text input and tag actions', async () => {
    const user = userEvent.setup()
    const { props } = renderPanel({ selectedTags: new Set(['security']) })

    fireEvent.change(screen.getByPlaceholderText('e.g. Istio, Envoy…'), { target: { value: 'istio' } })
    await user.click(screen.getByRole('button', { name: /security/i }))
    await user.click(screen.getByRole('button', { name: /clear tags/i }))

    expect(props.onCncfFilterChange).toHaveBeenCalledWith('istio')
    expect(props.onTagToggle).toHaveBeenCalledWith('security')
    expect(props.onClearTags).toHaveBeenCalled()
  })

  it('hides clear-all button when no active filters', () => {
    renderPanel({ activeFilterCount: 0, recommendationsTotal: 0 })
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })
})
