import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { MissionExport, MissionMatch, BrowseEntry } from '../../../lib/missions/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('../../lib/analytics', () => ({ emitFixerGitHubLink: vi.fn() }))
vi.mock('../../../lib/analytics', () => ({ emitFixerGitHubLink: vi.fn() }))

const { mockResetMissionCache } = vi.hoisted(() => ({
  mockResetMissionCache: vi.fn(),
}))
vi.mock('../browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../browser')>()
  return {
    ...actual,
    EmptyState: ({ message }: { message: string }) => <div data-testid="empty-state">{message}</div>,
    MissionFetchErrorBanner: ({ message }: { message: string }) => <div data-testid="fetch-error">{message}</div>,
    VirtualizedMissionGrid: ({ items, renderItem }: { items: unknown[]; renderItem: (m: unknown) => React.ReactNode }) => (
      <div data-testid="virtualized-grid">{items.map((item, i) => <div key={i}>{renderItem(item)}</div>)}</div>
    ),
    RecommendationCard: ({ match, onSelect }: { match: MissionMatch; onSelect: () => void }) => (
      <div data-testid="recommendation-card">
        <button onClick={onSelect}>Select {match.mission.title}</button>
      </div>
    ),
    DirectoryListing: ({ entries, onSelect }: { entries: BrowseEntry[]; onSelect: (e: BrowseEntry) => void }) => (
      <div data-testid="directory-listing">
        {entries.map((e) => (
          <button key={e.path} onClick={() => onSelect(e)}>{e.name}</button>
        ))}
      </div>
    ),
    buildDirectoryEntryNode: vi.fn((entry) => ({ ...entry, id: entry.path, source: 'community', loaded: false })),
    resetMissionCache: mockResetMissionCache,
    CollapsibleSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
      <div data-testid="collapsible-section">
        <span>{title}</span>
        {children}
      </div>
    ),
  }
})

vi.mock('../../ui/CollapsibleSection', () => ({
  CollapsibleSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="collapsible-section">
      <span>{title}</span>
      {children}
    </div>
  ),
}))

import { MissionBrowserRecommendedTab } from '../MissionBrowserRecommendedTab'

const MISSION: MissionExport = {
  id: 'fix-1',
  title: 'Fix DNS',
  description: 'Fixes DNS',
  type: 'fixer',
  source: 'community',
  content: '',
  tags: [],
  version: '1.0',
  author: 'test',
} as unknown as MissionExport

const MATCH: MissionMatch = { mission: MISSION, score: 0.9, reason: 'cluster match' } as unknown as MissionMatch

const DIR_ENTRY: BrowseEntry = {
  name: 'networking',
  path: 'fixes/networking',
  type: 'directory',
} as BrowseEntry

const DEFAULT_PROGRESS = { step: 'Done', detail: '', found: 0, scanned: 0 }

function renderRecommendedTab(overrides: Partial<React.ComponentProps<typeof MissionBrowserRecommendedTab>> = {}) {
  const props = {
    tokenError: null,
    missionFetchError: null,
    loadingRecommendations: false,
    searchProgress: DEFAULT_PROGRESS,
    hasCluster: false,
    recommendations: [],
    filteredRecommendations: [],
    onSelectMission: vi.fn(),
    onImportMission: vi.fn(),
    onCopyLink: vi.fn(),
    loading: false,
    filteredEntries: [],
    selectedPath: null,
    selectedNode: null,
    viewMode: 'grid' as const,
    onImportDirectoryEntry: vi.fn(),
    onToggleNode: vi.fn(),
    onSelectNode: vi.fn(),
    ...overrides,
  }
  return { ...render(<MissionBrowserRecommendedTab {...props} />), props }
}

describe('MissionBrowserRecommendedTab', () => {
  beforeEach(() => { vi.clearAllMocks() })

  // ── Token error banners ─────────────────────────────────────────────────────

  it('shows rate limit warning when tokenError is rate_limited', () => {
    renderRecommendedTab({ tokenError: 'rate_limited' })
    expect(screen.getByText('GitHub API rate limit reached')).toBeInTheDocument()
  })

  it('shows invalid token warning when tokenError is token_invalid', () => {
    renderRecommendedTab({ tokenError: 'token_invalid' })
    expect(screen.getByText('GitHub token is invalid or expired')).toBeInTheDocument()
  })

  it('shows no token banner when tokenError is null', () => {
    renderRecommendedTab({ tokenError: null })
    expect(screen.queryByText('GitHub API rate limit reached')).not.toBeInTheDocument()
    expect(screen.queryByText('GitHub token is invalid or expired')).not.toBeInTheDocument()
  })

  it('shows GitHub token creation link in rate limit banner', () => {
    renderRecommendedTab({ tokenError: 'rate_limited' })
    expect(screen.getByText('Create a GitHub personal access token')).toBeInTheDocument()
  })

  // ── Fetch error banner ──────────────────────────────────────────────────────

  it('shows fetch error when present with no recommendations', () => {
    renderRecommendedTab({
      missionFetchError: 'Connection refused',
      recommendations: [],
      loadingRecommendations: false,
    })
    expect(screen.getByTestId('fetch-error')).toHaveTextContent('Connection refused')
  })

  it('hides fetch error when loading recommendations', () => {
    renderRecommendedTab({
      missionFetchError: 'Connection refused',
      loadingRecommendations: true,
      recommendations: [],
    })
    expect(screen.queryByTestId('fetch-error')).not.toBeInTheDocument()
  })

  it('hides fetch error when recommendations are present', () => {
    renderRecommendedTab({
      missionFetchError: 'Connection refused',
      recommendations: [MATCH],
      filteredRecommendations: [MATCH],
    })
    expect(screen.queryByTestId('fetch-error')).not.toBeInTheDocument()
  })

  // ── Recommendations section ─────────────────────────────────────────────────

  it('renders CollapsibleSection with "Recommended for Your Cluster" when hasCluster', () => {
    renderRecommendedTab({
      recommendations: [MATCH],
      filteredRecommendations: [MATCH],
      hasCluster: true,
    })
    expect(screen.getByText('Recommended for Your Cluster')).toBeInTheDocument()
  })

  it('renders CollapsibleSection with "Explore CNCF Fixes" when no cluster', () => {
    renderRecommendedTab({
      recommendations: [MATCH],
      filteredRecommendations: [MATCH],
      hasCluster: false,
    })
    expect(screen.getByText('Explore CNCF Fixes')).toBeInTheDocument()
  })

  it('renders recommendation cards for filteredRecommendations', () => {
    renderRecommendedTab({
      recommendations: [MATCH],
      filteredRecommendations: [MATCH],
    })
    expect(screen.getByTestId('recommendation-card')).toBeInTheDocument()
  })

  it('calls onSelectMission when a recommendation card is selected', () => {
    const onSelectMission = vi.fn()
    renderRecommendedTab({
      recommendations: [MATCH],
      filteredRecommendations: [MATCH],
      onSelectMission,
    })
    fireEvent.click(screen.getByText('Select Fix DNS'))
    expect(onSelectMission).toHaveBeenCalledWith(MISSION)
  })

  it('shows no recommendations section when recommendations list is empty', () => {
    renderRecommendedTab({ recommendations: [], filteredRecommendations: [] })
    expect(screen.queryByTestId('collapsible-section')).not.toBeInTheDocument()
  })

  // ── Loading state ───────────────────────────────────────────────────────────

  it('shows Connecting step text when loadingRecommendations and step is Connecting', () => {
    renderRecommendedTab({
      loadingRecommendations: true,
      recommendations: [MATCH],
      filteredRecommendations: [],
      searchProgress: { step: 'Connecting', detail: '', found: 0, scanned: 0 },
    })
    expect(screen.getByText('Connecting to knowledge base…')).toBeInTheDocument()
  })

  it('shows scanned count when found > 0 during loading', () => {
    renderRecommendedTab({
      loadingRecommendations: true,
      recommendations: [MATCH],
      filteredRecommendations: [],
      searchProgress: { step: 'Scanning', detail: 'fixes/', found: 5, scanned: 10 },
    })
    expect(screen.getByText(/5 found · 10 scanned/)).toBeInTheDocument()
  })

  // ── Directory listing ───────────────────────────────────────────────────────

  it('shows loading spinner when loading=true', () => {
    const { container } = renderRecommendedTab({ loading: true })
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders DirectoryListing when filteredEntries is non-empty', () => {
    renderRecommendedTab({ filteredEntries: [DIR_ENTRY], loading: false })
    expect(screen.getByTestId('directory-listing')).toBeInTheDocument()
    expect(screen.getByText('networking')).toBeInTheDocument()
  })

  it('calls onToggleNode and onSelectNode when a directory entry is clicked', () => {
    const onToggleNode = vi.fn()
    const onSelectNode = vi.fn()
    renderRecommendedTab({
      filteredEntries: [DIR_ENTRY],
      loading: false,
      onToggleNode,
      onSelectNode,
    })
    fireEvent.click(screen.getByText('networking'))
    expect(onToggleNode).toHaveBeenCalled()
    expect(onSelectNode).toHaveBeenCalled()
  })

  it('shows "No files in this directory" when selectedPath set but no entries', () => {
    renderRecommendedTab({ filteredEntries: [], selectedPath: 'fixes/networking', loading: false })
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No files in this directory')
  })

  it('shows "Select a folder" message when no selectedPath and no entries', () => {
    renderRecommendedTab({ filteredEntries: [], selectedPath: null, loading: false })
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Select a folder from the sidebar to browse missions')
  })

  // ── Browse on GitHub link ───────────────────────────────────────────────────

  it('shows Browse on GitHub link when not loading', () => {
    renderRecommendedTab({ loading: false })
    expect(screen.getByText('Browse all fixes on GitHub')).toBeInTheDocument()
  })

  it('hides Browse on GitHub link when loading', () => {
    renderRecommendedTab({ loading: true })
    expect(screen.queryByText('Browse all fixes on GitHub')).not.toBeInTheDocument()
  })
})
