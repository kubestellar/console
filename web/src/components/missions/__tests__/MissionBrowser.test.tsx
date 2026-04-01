/**
 * MissionBrowser unit tests
 *
 * Covers: smoke render, closed state, empty data handling,
 * expected UI elements when open, and Escape key behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MissionBrowser } from '../MissionBrowser'

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    token: null,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useClusterContext', () => ({
  useClusterContext: () => ({
    clusterContext: null,
  }),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
  },
}))

vi.mock('../../../lib/analytics', () => ({
  emitFixerBrowsed: vi.fn(),
  emitFixerViewed: vi.fn(),
  emitFixerImported: vi.fn(),
  emitFixerImportError: vi.fn(),
  emitFixerGitHubLink: vi.fn(),
  emitFixerLinkCopied: vi.fn(),
}))

vi.mock('../../../lib/missions/matcher', () => ({
  matchMissionsToCluster: vi.fn(() => []),
}))

vi.mock('../../../lib/missions/scanner/index', () => ({
  fullScan: vi.fn(() => ({ valid: true, findings: [], metadata: null })),
}))

vi.mock('../../../lib/missions/fileParser', () => ({
  parseFileContent: vi.fn(() => ({ type: 'structured', mission: {} })),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

vi.mock('../../ui/CollapsibleSection', () => ({
  CollapsibleSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="collapsible-section" data-title={title}>{children}</div>
  ),
}))

// Mock the browser sub-module with minimal stubs
vi.mock('../browser', () => ({
  TreeNodeItem: () => null,
  DirectoryListing: () => null,
  RecommendationCard: () => null,
  EmptyState: ({ message }: { message: string }) => <div data-testid="empty-state">{message}</div>,
  MissionFetchErrorBanner: ({ message }: { message: string }) => <div data-testid="fetch-error">{message}</div>,
  getMissionSlug: (m: { title?: string }) => (m.title || '').toLowerCase().replace(/\s+/g, '-'),
  getMissionShareUrl: () => 'https://example.com/missions/test',
  updateNodeInTree: vi.fn((nodes: unknown[]) => nodes),
  removeNodeFromTree: vi.fn((nodes: unknown[]) => nodes),
  missionCache: {
    installers: [],
    fixes: [],
    installersDone: true,
    fixesDone: true,
    fetchError: null,
    listeners: new Set(),
  },
  startMissionCacheFetch: vi.fn(),
  resetMissionCache: vi.fn(),
  fetchMissionContent: vi.fn().mockResolvedValue({ mission: {}, raw: '{}' }),
  BROWSER_TABS: [
    { id: 'recommended', label: 'Recommended', icon: '★' },
    { id: 'installers', label: 'Installers', icon: '📦' },
    { id: 'fixes', label: 'Fixes', icon: '🔧' },
  ],
  VirtualizedMissionGrid: () => null,
  getCachedRecommendations: vi.fn(() => null),
  setCachedRecommendations: vi.fn(),
}))

vi.mock('../ScanProgressOverlay', () => ({
  ScanProgressOverlay: () => null,
}))

vi.mock('../InstallerCard', () => ({
  InstallerCard: () => null,
}))

vi.mock('../FixerCard', () => ({
  FixerCard: () => null,
}))

vi.mock('../MissionDetailView', () => ({
  MissionDetailView: () => <div data-testid="mission-detail">Detail View</div>,
}))

vi.mock('../ImproveMissionDialog', () => ({
  ImproveMissionDialog: () => null,
}))

vi.mock('../UnstructuredFilePreview', () => ({
  UnstructuredFilePreview: () => null,
}))

// ── Tests ────────────────────────────────────────────────────────────────

describe('MissionBrowser', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onImport: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <MissionBrowser isOpen={false} onClose={vi.fn()} onImport={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders without crashing when isOpen is true', () => {
    expect(() =>
      render(<MissionBrowser {...defaultProps} />),
    ).not.toThrow()
  })

  it('shows the search input when open', () => {
    render(<MissionBrowser {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText(/Search/i)
    expect(searchInput).toBeInTheDocument()
  })

  it('renders tab buttons for each browser tab', () => {
    render(<MissionBrowser {...defaultProps} />)
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('Installers')).toBeInTheDocument()
    expect(screen.getByText('Fixes')).toBeInTheDocument()
  })

  it('renders the close button', () => {
    render(<MissionBrowser {...defaultProps} />)
    const closeButton = screen.getByTitle('Close (Esc)')
    expect(closeButton).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(<MissionBrowser {...defaultProps} onClose={onClose} />)

    const closeButton = screen.getByTitle('Close (Esc)')
    await userEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape key when no mission is selected', async () => {
    const onClose = vi.fn()
    render(<MissionBrowser {...defaultProps} onClose={onClose} />)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows empty state when no directory entries and recommended tab active', () => {
    render(<MissionBrowser {...defaultProps} />)
    // The empty state should be rendered for the file browser area
    const emptyStates = screen.getAllByTestId('empty-state')
    expect(emptyStates.length).toBeGreaterThanOrEqual(1)
  })

  it('handles undefined/empty initialMission gracefully', () => {
    expect(() =>
      render(<MissionBrowser {...defaultProps} initialMission={undefined} />),
    ).not.toThrow()

    expect(() =>
      render(<MissionBrowser {...defaultProps} initialMission="" />),
    ).not.toThrow()
  })
})
