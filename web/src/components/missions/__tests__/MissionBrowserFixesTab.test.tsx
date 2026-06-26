import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { MissionExport } from '../../../lib/missions/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('../FixerCard', () => ({
  FixerCard: ({ mission, onSelect, onImport }: { mission: MissionExport; onSelect: () => void; onImport: () => void }) => (
    <div data-testid="fixer-card" data-id={mission.id}>
      <button onClick={onSelect}>Select {mission.title}</button>
      <button onClick={onImport}>Import {mission.title}</button>
    </div>
  ),
}))

vi.mock('../browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../browser')>()
  return {
    ...actual,
    EmptyState: ({ message }: { message: string }) => <div data-testid="empty-state">{message}</div>,
    MissionFetchErrorBanner: ({ message }: { message: string }) => <div data-testid="fetch-error">{message}</div>,
    VirtualizedMissionGrid: ({ items, renderItem }: { items: MissionExport[]; renderItem: (m: MissionExport) => React.ReactNode }) => (
      <div data-testid="virtualized-grid">{items.map(renderItem)}</div>
    ),
  }
})

vi.mock('../missionBrowserConstants', () => ({
  CATEGORY_FILTERS: ['All', 'Troubleshoot', 'Deploy'],
}))

import { MissionBrowserFixesTab } from '../MissionBrowserFixesTab'

const MISSION: MissionExport = {
  id: 'fix-1',
  title: 'Fix NetworkPolicy',
  description: 'Fixes networking issues',
  type: 'fixer',
  source: 'community',
  content: '',
  tags: [],
  version: '1.0',
  author: 'test',
} as unknown as MissionExport

function renderFixesTab(overrides: Partial<React.ComponentProps<typeof MissionBrowserFixesTab>> = {}) {
  const props = {
    fixerMissions: [],
    filteredFixers: [],
    loadingFixers: false,
    missionFetchError: null,
    fixerSearch: '',
    onFixerSearchChange: vi.fn(),
    globalSearchActive: false,
    globalSearchQuery: '',
    fixerTypeFilter: 'All',
    onFixerTypeFilterChange: vi.fn(),
    viewMode: 'grid' as const,
    onSelectMission: vi.fn(),
    onImportMission: vi.fn(),
    onCopyLink: vi.fn(),
    ...overrides,
  }
  return { ...render(<MissionBrowserFixesTab {...props} />), props }
}

describe('MissionBrowserFixesTab', () => {
  beforeEach(() => { vi.clearAllMocks() })

  // ── Search input ────────────────────────────────────────────────────────────

  it('renders search input with placeholder', () => {
    renderFixesTab()
    expect(screen.getByPlaceholderText('Search fixes…')).toBeInTheDocument()
  })

  it('shows current fixerSearch value in input', () => {
    renderFixesTab({ fixerSearch: 'network' })
    expect(screen.getByDisplayValue('network')).toBeInTheDocument()
  })

  it('calls onFixerSearchChange when typing in search', () => {
    const onFixerSearchChange = vi.fn()
    renderFixesTab({ onFixerSearchChange })
    fireEvent.change(screen.getByPlaceholderText('Search fixes…'), { target: { value: 'dns' } })
    expect(onFixerSearchChange).toHaveBeenCalledWith('dns')
  })

  // ── Global search active banner ─────────────────────────────────────────────

  it('shows global search filter hint when global search active and no local search', () => {
    renderFixesTab({ globalSearchActive: true, globalSearchQuery: 'istio', fixerSearch: '' })
    expect(screen.getByText(/Filtered by global search/)).toBeInTheDocument()
    expect(screen.getByText(/istio/)).toBeInTheDocument()
  })

  it('hides global search hint when local fixerSearch is set', () => {
    renderFixesTab({ globalSearchActive: true, globalSearchQuery: 'istio', fixerSearch: 'dns' })
    expect(screen.queryByText(/Filtered by global search/)).not.toBeInTheDocument()
  })

  it('hides global search hint when globalSearchActive is false', () => {
    renderFixesTab({ globalSearchActive: false, globalSearchQuery: 'istio' })
    expect(screen.queryByText(/Filtered by global search/)).not.toBeInTheDocument()
  })

  // ── Type filter select ──────────────────────────────────────────────────────

  it('renders type filter dropdown with All Types option', () => {
    renderFixesTab()
    expect(screen.getByDisplayValue('All Types')).toBeInTheDocument()
  })

  it('renders category options from CATEGORY_FILTERS', () => {
    renderFixesTab()
    const select = screen.getByDisplayValue('All Types')
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Troubleshoot' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Deploy' })).toBeInTheDocument()
  })

  it('calls onFixerTypeFilterChange when filter changes', () => {
    const onFixerTypeFilterChange = vi.fn()
    renderFixesTab({ onFixerTypeFilterChange })
    fireEvent.change(screen.getByDisplayValue('All Types'), { target: { value: 'Deploy' } })
    expect(onFixerTypeFilterChange).toHaveBeenCalledWith('Deploy')
  })

  // ── Loading state ───────────────────────────────────────────────────────────

  it('shows loading spinner when loading and no filtered items', () => {
    renderFixesTab({ loadingFixers: true, filteredFixers: [] })
    expect(screen.getByText('Loading fixes…')).toBeInTheDocument()
  })

  it('shows progressive loading banner with count when loading with some items', () => {
    renderFixesTab({
      loadingFixers: true,
      filteredFixers: [MISSION],
      fixerMissions: [MISSION],
    })
    expect(screen.getByText(/Loading… 1 found so far/)).toBeInTheDocument()
  })

  // ── Empty states ────────────────────────────────────────────────────────────

  it('shows "No fixer missions found" when no items and not loading', () => {
    renderFixesTab({ filteredFixers: [], fixerMissions: [], loadingFixers: false })
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No fixer missions found')
  })

  it('shows "No fixes match your filters" when missions exist but filtered result empty', () => {
    renderFixesTab({ filteredFixers: [], fixerMissions: [MISSION], loadingFixers: false })
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No fixes match your filters')
  })

  // ── Error banner ────────────────────────────────────────────────────────────

  it('shows error banner when missionFetchError is set and no missions', () => {
    renderFixesTab({ missionFetchError: 'Network timeout', fixerMissions: [] })
    expect(screen.getByTestId('fetch-error')).toHaveTextContent('Network timeout')
  })

  it('hides error banner when missions are present even with error', () => {
    renderFixesTab({ missionFetchError: 'Network timeout', fixerMissions: [MISSION] })
    expect(screen.queryByTestId('fetch-error')).not.toBeInTheDocument()
  })

  // ── Mission grid & cards ────────────────────────────────────────────────────

  it('renders the virtualized grid when filteredFixers is non-empty', () => {
    renderFixesTab({ filteredFixers: [MISSION], fixerMissions: [MISSION] })
    expect(screen.getByTestId('virtualized-grid')).toBeInTheDocument()
    expect(screen.getByTestId('fixer-card')).toBeInTheDocument()
  })

  it('calls onSelectMission when Select is clicked on a fixer card', () => {
    const onSelectMission = vi.fn()
    renderFixesTab({ filteredFixers: [MISSION], fixerMissions: [MISSION], onSelectMission })
    fireEvent.click(screen.getByText('Select Fix NetworkPolicy'))
    expect(onSelectMission).toHaveBeenCalledWith(MISSION)
  })

  it('calls onImportMission when Import is clicked on a fixer card', () => {
    const onImportMission = vi.fn()
    renderFixesTab({ filteredFixers: [MISSION], fixerMissions: [MISSION], onImportMission })
    fireEvent.click(screen.getByText('Import Fix NetworkPolicy'))
    expect(onImportMission).toHaveBeenCalledWith(MISSION)
  })

  // ── Count footer ────────────────────────────────────────────────────────────

  it('shows count footer when filteredFixers is non-empty and not loading', () => {
    renderFixesTab({
      filteredFixers: [MISSION],
      fixerMissions: [MISSION],
      loadingFixers: false,
    })
    expect(screen.getByText('Showing 1 of 1 fixer missions')).toBeInTheDocument()
  })

  it('shows loading count footer when loading with items', () => {
    renderFixesTab({
      filteredFixers: [MISSION],
      fixerMissions: [MISSION],
      loadingFixers: true,
    })
    expect(screen.getByText('1 loaded…')).toBeInTheDocument()
  })

  it('hides count footer when filteredFixers is empty', () => {
    renderFixesTab({ filteredFixers: [], fixerMissions: [] })
    expect(screen.queryByText(/Showing.*fixer missions/)).not.toBeInTheDocument()
  })
})
