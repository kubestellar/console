/**
 * MissionBrowser unit tests
 *
 * Covers: smoke render, closed state, empty data handling,
 * expected UI elements when open, and Escape key behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MissionBrowser } from '../MissionBrowser'
import type { TreeNode } from '../browser'

const browserMockState = vi.hoisted(() => ({
  missionCache: {
    installers: [] as any[],
    fixes: [] as any[],
    installersDone: true,
    fixesDone: true,
    fetchError: null as string | null,
    listeners: new Set<() => void>(),
  },
  fetchMissionContent: vi.fn(async (mission: any) => ({ mission, raw: JSON.stringify(mission) })),
  fetchTreeChildren: vi.fn(async () => []),
}))

const toastMockState = vi.hoisted(() => ({
  showToast: vi.fn(),
}))

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
  matchMissionsToCluster: vi.fn((missions: any[]) => missions.map((mission) => ({
    mission,
    score: 2,
    matchPercent: 85,
    matchReasons: ['Matched'],
  }))),
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
    showToast: toastMockState.showToast,
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
  RecommendationCard: ({ match, onSelect, onImport, compact }: { match: any; onSelect: () => void; onImport?: () => void; compact?: boolean }) => (
    <div>
      <button type="button" onClick={onSelect} data-testid="recommendation-card" data-compact={compact ? 'true' : 'false'}>
        {match.mission.title}
      </button>
      {onImport && (
        <button type="button" onClick={onImport} data-testid={`recommendation-import-${match.mission.title}`}>
          Import {match.mission.title}
        </button>
      )}
    </div>
  ),
  EmptyState: ({ message }: { message: string }) => <div data-testid="empty-state">{message}</div>,
  MissionFetchErrorBanner: ({ message }: { message: string }) => <div data-testid="fetch-error">{message}</div>,
  getMissionSlug: (m: { title?: string }) => (m.title || '').toLowerCase().replace(/\s+/g, '-'),
  getMissionShareUrl: () => 'https://example.com/missions/test',
  getKubaraConfig: vi.fn().mockResolvedValue({ repoOwner: 'kubara-io', repoName: 'kubara', catalogPath: 'go-binary/templates/embedded/managed-service-catalog/helm' }),
  updateNodeInTree: vi.fn((nodes: any[], nodeId: string, updates: any) => {
    const apply = (items: any[]): any[] => items.map((node) => {
      if (node.id === nodeId) return { ...node, ...updates }
      if (node.children) return { ...node, children: apply(node.children) }
      return node
    })
    return apply(nodes)
  }),
  removeNodeFromTree: vi.fn((nodes: any[], nodeId: string) => {
    const prune = (items: any[]): any[] => items
      .filter((node) => node.id !== nodeId)
      .map((node) => node.children ? { ...node, children: prune(node.children) } : node)
    return prune(nodes)
  }),
  missionCache: browserMockState.missionCache,
  startMissionCacheFetch: vi.fn(),
  resetMissionCache: vi.fn(),
  fetchMissionContent: browserMockState.fetchMissionContent,
  fetchTreeChildren: browserMockState.fetchTreeChildren,
  fetchDirectoryEntries: vi.fn().mockResolvedValue([]),
  fetchNodeFileContent: vi.fn().mockResolvedValue(null),
  BROWSER_TABS: [
    { id: 'recommended', label: 'Recommended', icon: '★' },
    { id: 'installers', label: 'Installers', icon: '📦' },
    { id: 'fixes', label: 'Fixes', icon: '🔧' },
  ],
  VirtualizedMissionGrid: ({ items, renderItem, viewMode }: { items: any[]; renderItem: (item: any) => React.ReactNode; viewMode?: 'grid' | 'list' }) => (
    <div data-testid="virtualized-mission-grid" data-view-mode={viewMode ?? 'grid'}>
      {items.map((item, index) => <div key={item.mission?.title ?? index}>{renderItem(item)}</div>)}
    </div>
  ),
  getCachedRecommendations: vi.fn(() => null),
  setCachedRecommendations: vi.fn(),
}))

vi.mock('../MissionBrowserSidebar', () => ({
  MissionBrowserSidebar: ({
    treeNodes,
    selectedPath,
    expandedNodes,
    onSelectNode,
    onFileSelect,
  }: {
    treeNodes: TreeNode[]
    selectedPath: string | null
    expandedNodes: Set<string>
    onSelectNode: (node: TreeNode) => void
    onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
  }) => {
    const renderNodes = (nodes: TreeNode[]) => nodes.map((node) => (
      <div key={node.id}>
        <button type="button" data-testid={`tree-node-${node.id}`} onClick={() => onSelectNode(node)}>
          {node.name}
        </button>
        {node.children ? renderNodes(node.children) : null}
      </div>
    ))

    return (
      <div
        data-testid="mission-sidebar"
        data-selected-path={selectedPath ?? ''}
        data-expanded={Array.from(expandedNodes).sort().join('|')}
      >
        <input data-testid="mission-file-input" type="file" onChange={onFileSelect} />
        {renderNodes(treeNodes)}
      </div>
    )
  },
}))

vi.mock('../ScanProgressOverlay', () => ({
  ScanProgressOverlay: ({ isScanning, result, onComplete }: { isScanning: boolean; result: { valid: boolean; findings: unknown[]; metadata: unknown } | null; onComplete: (result: { valid: boolean; findings: unknown[]; metadata: unknown }) => void }) => (
    isScanning && result
      ? <button type="button" data-testid="scan-complete" onClick={() => onComplete(result)}>Complete scan</button>
      : null
  ),
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

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })

  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const maxMatch = query.match(/max-width:\s*(\d+)px/)
    const minMatch = query.match(/min-width:\s*(\d+)px/)
    const maxWidth = maxMatch ? Number(maxMatch[1]) : Number.POSITIVE_INFINITY
    const minWidth = minMatch ? Number(minMatch[1]) : 0
    const matches = width >= minWidth && width <= maxWidth

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
  }) as typeof window.matchMedia
}

describe('MissionBrowser', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onImport: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    toastMockState.showToast.mockReset()
    setViewportWidth(1280)
    browserMockState.missionCache.installers = []
    browserMockState.missionCache.fixes = []
    browserMockState.missionCache.installersDone = true
    browserMockState.missionCache.fixesDone = true
    browserMockState.missionCache.fetchError = null
    browserMockState.missionCache.listeners.clear()
    browserMockState.fetchMissionContent.mockImplementation(async (mission: any) => ({ mission, raw: JSON.stringify(mission) }))
    browserMockState.fetchTreeChildren.mockImplementation(async () => [])
  })

  const addRecommendedMission = () => {
    browserMockState.missionCache.fixes = [
      {
        version: 'kc-mission-v1',
        title: 'Recommended fix',
        description: 'Recommended description',
        type: 'repair',
        tags: ['networking'],
        steps: [{ title: 'Apply fix', description: 'Run the recommended repair step.' }],
        metadata: { maturity: 'graduated', projectVersion: '1.0.0' },
      },
    ]
  }

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

  it('reopens an imported local file after navigating away', async () => {
    const user = userEvent.setup()
    render(<MissionBrowser {...defaultProps} />)

    const localFile = new File(['{"title":"Local mission"}'], 'local-mission.json', {
      type: 'application/json',
    })

    await user.upload(screen.getByTestId('mission-file-input'), localFile)
    await waitFor(() => {
      expect(screen.getByTestId('mission-detail')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('tree-node-kubara'))
    await waitFor(() => {
      expect(screen.queryByTestId('mission-detail')).not.toBeInTheDocument()
    })

    await user.click(screen.getByTestId('tree-node-local/local-mission.json'))
    await waitFor(() => {
      expect(screen.getByTestId('mission-detail')).toBeInTheDocument()
    })
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

  it('switches recommended missions to list layout when list view is selected', async () => {
    addRecommendedMission()
    render(<MissionBrowser {...defaultProps} />)

    expect(screen.getByTestId('virtualized-mission-grid')).toHaveAttribute('data-view-mode', 'grid')
    expect(screen.getByTestId('recommendation-card')).toHaveAttribute('data-compact', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'List view' }))

    await waitFor(() => {
      expect(screen.getByTestId('virtualized-mission-grid')).toHaveAttribute('data-view-mode', 'list')
      expect(screen.getByTestId('recommendation-card')).toHaveAttribute('data-compact', 'true')
    })
  })

  it('collapses filters by default on small screens', async () => {
    const user = userEvent.setup()
    setViewportWidth(390)

    render(<MissionBrowser {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'missions.browser.showFilters' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'missions.browser.showFilters' }))

    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
  })

  it('shows a success toast and keeps the browser open after import', async () => {
    const onClose = vi.fn()
    const onImport = vi.fn()

    addRecommendedMission()
    render(<MissionBrowser {...defaultProps} onClose={onClose} onImport={onImport} />)

    await userEvent.click(screen.getByTestId('recommendation-import-Recommended fix'))
    await userEvent.click(await screen.findByTestId('scan-complete'))

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledTimes(1)
      expect(onClose).not.toHaveBeenCalled()
      expect(toastMockState.showToast).toHaveBeenCalledWith('missions.browser.importSuccess', 'success')
      expect(screen.getByTestId('mission-browser')).toBeInTheDocument()
    })
  })

  it('handles undefined/empty initialMission gracefully', () => {
    expect(() =>
      render(<MissionBrowser {...defaultProps} initialMission={undefined} />),
    ).not.toThrow()

    expect(() =>
      render(<MissionBrowser {...defaultProps} initialMission="" />),
    ).not.toThrow()
  })

  it('reveals a recommended mission path in the sidebar tree when its card is clicked', async () => {
    browserMockState.missionCache.fixes = [{
      version: 'kc-mission-v1',
      title: 'Install OPA',
      description: 'Install Open Policy Agent',
      type: 'deploy',
      tags: [],
      steps: [],
      metadata: { source: 'fixes/cncf-install/install-open-policy-agent-opa.json' },
    }]

    browserMockState.fetchTreeChildren.mockImplementation(async (node: { id: string }) => {
      if (node.id === 'community') {
        return [{
          id: 'community/cncf-install',
          name: 'cncf-install',
          path: 'fixes/cncf-install',
          type: 'directory',
          source: 'community',
          loaded: false,
        }]
      }

      if (node.id === 'community/cncf-install') {
        return [{
          id: 'community/cncf-install/install-open-policy-agent-opa.json',
          name: 'install-open-policy-agent-opa.json',
          path: 'fixes/cncf-install/install-open-policy-agent-opa.json',
          type: 'file',
          source: 'community',
          loaded: true,
        }]
      }

      return []
    })

    render(<MissionBrowser {...defaultProps} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Install OPA' }))

    await waitFor(() => {
      const sidebar = screen.getByTestId('mission-sidebar')
      expect(sidebar).toHaveAttribute(
        'data-selected-path',
        'community/cncf-install/install-open-policy-agent-opa.json',
      )
      const expanded = sidebar.getAttribute('data-expanded') ?? ''
      expect(expanded).toContain('community')
      expect(expanded).toContain('community/cncf-install')
    })
  })
})
