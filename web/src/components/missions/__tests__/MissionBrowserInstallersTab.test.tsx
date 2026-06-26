import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { MissionExport } from '../../../lib/missions/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('../InstallerCard', () => ({
  InstallerCard: ({ mission, onSelect, onImport }: { mission: MissionExport; onSelect: () => void; onImport: () => void }) => (
    <div data-testid="installer-card" data-id={mission.id}>
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
  CNCF_CATEGORIES: ['All', 'Networking', 'Storage'],
  MATURITY_LEVELS: ['All', 'graduated', 'incubating', 'sandbox'],
}))

import { MissionBrowserInstallersTab } from '../MissionBrowserInstallersTab'

const INSTALLER: MissionExport = {
  id: 'install-1',
  title: 'Install Istio',
  description: 'Installs Istio service mesh',
  type: 'installer',
  source: 'community',
  content: '',
  tags: [],
  version: '1.0',
  author: 'test',
} as unknown as MissionExport

function renderInstallersTab(overrides: Partial<React.ComponentProps<typeof MissionBrowserInstallersTab>> = {}) {
  const props = {
    installerMissions: [],
    filteredInstallers: [],
    loadingInstallers: false,
    missionFetchError: null,
    installerSearch: '',
    onInstallerSearchChange: vi.fn(),
    globalSearchActive: false,
    globalSearchQuery: '',
    installerCategoryFilter: 'All',
    onInstallerCategoryFilterChange: vi.fn(),
    installerMaturityFilter: 'All',
    onInstallerMaturityFilterChange: vi.fn(),
    viewMode: 'grid' as const,
    onSelectMission: vi.fn(),
    onImportMission: vi.fn(),
    onCopyLink: vi.fn(),
    ...overrides,
  }
  return { ...render(<MissionBrowserInstallersTab {...props} />), props }
}

describe('MissionBrowserInstallersTab', () => {
  beforeEach(() => { vi.clearAllMocks() })

  // ── Search input ────────────────────────────────────────────────────────────

  it('renders search input with placeholder', () => {
    renderInstallersTab()
    expect(screen.getByPlaceholderText('Search installers…')).toBeInTheDocument()
  })

  it('shows current installerSearch value', () => {
    renderInstallersTab({ installerSearch: 'istio' })
    expect(screen.getByDisplayValue('istio')).toBeInTheDocument()
  })

  it('calls onInstallerSearchChange when typing', () => {
    const onInstallerSearchChange = vi.fn()
    renderInstallersTab({ onInstallerSearchChange })
    fireEvent.change(screen.getByPlaceholderText('Search installers…'), { target: { value: 'nginx' } })
    expect(onInstallerSearchChange).toHaveBeenCalledWith('nginx')
  })

  // ── Global search banner ────────────────────────────────────────────────────

  it('shows global search hint when global search is active and no local search', () => {
    renderInstallersTab({ globalSearchActive: true, globalSearchQuery: 'mesh', installerSearch: '' })
    expect(screen.getByText(/Filtered by global search/)).toBeInTheDocument()
    expect(screen.getByText(/mesh/)).toBeInTheDocument()
  })

  it('hides global search hint when local search is set', () => {
    renderInstallersTab({ globalSearchActive: true, globalSearchQuery: 'mesh', installerSearch: 'istio' })
    expect(screen.queryByText(/Filtered by global search/)).not.toBeInTheDocument()
  })

  // ── Category filter ─────────────────────────────────────────────────────────

  it('renders category dropdown with All Categories option', () => {
    renderInstallersTab()
    expect(screen.getByDisplayValue('All Categories')).toBeInTheDocument()
  })

  it('renders category options from CNCF_CATEGORIES', () => {
    renderInstallersTab()
    expect(screen.getByRole('option', { name: 'Networking' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Storage' })).toBeInTheDocument()
  })

  it('calls onInstallerCategoryFilterChange when category changes', () => {
    const onInstallerCategoryFilterChange = vi.fn()
    renderInstallersTab({ onInstallerCategoryFilterChange })
    fireEvent.change(screen.getByDisplayValue('All Categories'), { target: { value: 'Networking' } })
    expect(onInstallerCategoryFilterChange).toHaveBeenCalledWith('Networking')
  })

  // ── Maturity filter ─────────────────────────────────────────────────────────

  it('renders maturity dropdown with All Maturity option', () => {
    renderInstallersTab()
    expect(screen.getByDisplayValue('All Maturity')).toBeInTheDocument()
  })

  it('renders maturity options with capitalized labels', () => {
    renderInstallersTab()
    expect(screen.getByRole('option', { name: 'Graduated' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Incubating' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sandbox' })).toBeInTheDocument()
  })

  it('calls onInstallerMaturityFilterChange when maturity changes', () => {
    const onInstallerMaturityFilterChange = vi.fn()
    renderInstallersTab({ onInstallerMaturityFilterChange })
    fireEvent.change(screen.getByDisplayValue('All Maturity'), { target: { value: 'graduated' } })
    expect(onInstallerMaturityFilterChange).toHaveBeenCalledWith('graduated')
  })

  // ── Loading states ──────────────────────────────────────────────────────────

  it('shows loading spinner when loading and no filtered items', () => {
    renderInstallersTab({ loadingInstallers: true, filteredInstallers: [] })
    expect(screen.getByText('Loading CNCF installers…')).toBeInTheDocument()
  })

  it('shows progressive loading banner with count when loading with items', () => {
    renderInstallersTab({
      loadingInstallers: true,
      filteredInstallers: [INSTALLER],
      installerMissions: [INSTALLER],
    })
    expect(screen.getByText(/Loading… 1 found so far/)).toBeInTheDocument()
  })

  // ── Empty states ────────────────────────────────────────────────────────────

  it('shows "No installer missions found" when empty and not loading', () => {
    renderInstallersTab({ filteredInstallers: [], installerMissions: [], loadingInstallers: false })
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No installer missions found')
  })

  it('shows "No installers match your filters" when missions exist but filtered result empty', () => {
    renderInstallersTab({ filteredInstallers: [], installerMissions: [INSTALLER], loadingInstallers: false })
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No installers match your filters')
  })

  // ── Error banner ────────────────────────────────────────────────────────────

  it('shows error banner when fetch error present and no missions', () => {
    renderInstallersTab({ missionFetchError: 'Rate limited', installerMissions: [] })
    expect(screen.getByTestId('fetch-error')).toHaveTextContent('Rate limited')
  })

  it('hides error banner when missions are present', () => {
    renderInstallersTab({ missionFetchError: 'Rate limited', installerMissions: [INSTALLER] })
    expect(screen.queryByTestId('fetch-error')).not.toBeInTheDocument()
  })

  // ── Grid & cards ────────────────────────────────────────────────────────────

  it('renders virtualized grid when filteredInstallers is non-empty', () => {
    renderInstallersTab({ filteredInstallers: [INSTALLER], installerMissions: [INSTALLER] })
    expect(screen.getByTestId('virtualized-grid')).toBeInTheDocument()
    expect(screen.getByTestId('installer-card')).toBeInTheDocument()
  })

  it('calls onSelectMission when Select is clicked on installer card', () => {
    const onSelectMission = vi.fn()
    renderInstallersTab({ filteredInstallers: [INSTALLER], installerMissions: [INSTALLER], onSelectMission })
    fireEvent.click(screen.getByText('Select Install Istio'))
    expect(onSelectMission).toHaveBeenCalledWith(INSTALLER)
  })

  it('calls onImportMission when Import is clicked on installer card', () => {
    const onImportMission = vi.fn()
    renderInstallersTab({ filteredInstallers: [INSTALLER], installerMissions: [INSTALLER], onImportMission })
    fireEvent.click(screen.getByText('Import Install Istio'))
    expect(onImportMission).toHaveBeenCalledWith(INSTALLER)
  })

  // ── Count footer ────────────────────────────────────────────────────────────

  it('shows count footer when items loaded and not loading', () => {
    renderInstallersTab({
      filteredInstallers: [INSTALLER],
      installerMissions: [INSTALLER],
      loadingInstallers: false,
    })
    expect(screen.getByText('Showing 1 of 1 installer missions')).toBeInTheDocument()
  })

  it('shows loading count footer when still loading', () => {
    renderInstallersTab({
      filteredInstallers: [INSTALLER],
      installerMissions: [INSTALLER],
      loadingInstallers: true,
    })
    expect(screen.getByText('1 loaded…')).toBeInTheDocument()
  })
})
