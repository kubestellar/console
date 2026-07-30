import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'actions.clearAll': 'Clear All',
        'missionBrowser.match': 'Match:',
        'missionBrowser.matchAny': 'Any',
        'missionBrowser.source': 'Source:',
        'missionBrowser.sourceAll': 'All',
        'missionBrowser.sourceCluster': '🎯 Cluster',
        'missionBrowser.sourceCommunity': '🌐 Community',
        'missionBrowser.category': 'Category:',
        'missionBrowser.class': 'Class:',
        'missionBrowser.maturity': 'Maturity:',
        'missionBrowser.difficulty': 'Difficulty:',
        'missionBrowser.cncf': 'CNCF:',
        'missionBrowser.cncfPlaceholder': 'e.g. Istio, Envoy…',
        'missionBrowser.tags': 'Tags:',
        'missionBrowser.clearTags': 'Clear tags',
        'missionBrowser.summary': 'Showing {{shown}} of {{total}} missions',
        'missionBrowser.filteredSummary': 'Showing {{shown}} of {{total}} missions (filtered)',
        'missionBrowser.noMissionsMatchFilters': 'No missions match your filters.',
        'missionBrowser.clearAllFiltersAction': 'Clear all filters',
      }
      let value = map[key] ?? key
      for (const [name, replacement] of Object.entries(options ?? {})) {
        value = value.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), String(replacement))
      }
      return value
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

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
    expect(screen.getByText('Showing 4 of 10 missions (filtered)')).toBeInTheDocument()
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

  it('offers a clear-filters action when filtering returns zero results', async () => {
    const user = userEvent.setup()
    const { props } = renderPanel({ filteredRecommendationsCount: 0 })

    expect(screen.getByText('No missions match your filters.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /clear all filters/i }))

    expect(props.onClearAllFilters).toHaveBeenCalled()
  })

  it('hides clear-all button when no active filters', () => {
    renderPanel({ activeFilterCount: 0, recommendationsTotal: 0 })
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })
})
