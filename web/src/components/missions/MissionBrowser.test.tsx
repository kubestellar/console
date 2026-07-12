/**
 * Render tests for MissionBrowser and MissionBrowserSidebar
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('./browser', () => ({
  BROWSER_TABS: [
    { id: 'recommended', label: 'Recommended', icon: '⭐' },
    { id: 'installers', label: 'Installers', icon: '📦' },
    { id: 'fixes', label: 'Fixes', icon: '🔧' },
    { id: 'schedule', label: 'Schedule Action', icon: '🗓️' },
  ],
  missionCache: {
    installers: [],
    fixes: [],
    installersDone: true,
    fixesDone: true,
    fetchError: null,
    listeners: new Set(),
  },
  resetMissionCache: vi.fn(),
  startMissionCacheFetch: vi.fn(),
  notifyCacheListeners: vi.fn(),
  getKubaraConfig: vi.fn().mockResolvedValue({ repoOwner: 'kubara-io', repoName: 'kubara', catalogPath: 'catalog' }),
  updateNodeInTree: vi.fn((nodes: unknown[]) => nodes),
  removeNodeFromTree: vi.fn((nodes: unknown[]) => nodes),
  fetchTreeChildren: vi.fn().mockResolvedValue([]),
  fetchDirectoryEntries: vi.fn().mockResolvedValue([]),
  fetchNodeFileContent: vi.fn().mockResolvedValue(null),
  fetchMissionContent: vi.fn().mockResolvedValue(null),
  getCachedRecommendations: vi.fn(() => null),
  setCachedRecommendations: vi.fn(),
  resetRecommendationCache: vi.fn(),
  getMissionSlug: vi.fn((m: { title?: string }) => (m?.title ?? '').toLowerCase()),
  getMissionShareUrl: vi.fn(() => 'https://example.com/share'),
  normalizeMission: vi.fn((m: unknown) => m),
  buildDirectoryEntryNode: vi.fn(),
  TreeNodeItem: () => null,
  DirectoryListing: () => null,
  RecommendationCard: () => null,
  EmptyState: () => null,
  MissionFetchErrorBanner: () => null,
  VirtualizedMissionGrid: () => null,
}))

describe('MissionBrowser', () => {
  it('renders without errors', async () => {
    const { MissionBrowser } = await import('./MissionBrowser')
    const { container } = render(
      <MissionBrowser
        isOpen={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  it('does not render when closed', async () => {
    const { MissionBrowser } = await import('./MissionBrowser')
    const { container } = render(
      <MissionBrowser
        isOpen={false}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('MissionBrowserSidebar', () => {
  it('renders without errors', async () => {
    const { MissionBrowserSidebar } = await import('./MissionBrowserSidebar')
    const { container } = render(
      <MissionBrowserSidebar
        treeNodes={[]}
        expandedNodes={new Set()}
        selectedPath={null}
        revealPath={null}
        revealNonce={0}
        onToggleNode={vi.fn()}
        onSelectNode={vi.fn()}
        isDragging={false}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onFileSelect={vi.fn()}
        watchedRepos={[]}
        onRemoveRepo={vi.fn()}
        onRefreshNode={vi.fn()}
        watchedPaths={[]}
        onRemovePath={vi.fn()}
        addingRepo={false}
        setAddingRepo={vi.fn()}
        newRepoValue=""
        setNewRepoValue={vi.fn()}
        onAddRepo={vi.fn()}
        addingPath={false}
        setAddingPath={vi.fn()}
        newPathValue=""
        setNewPathValue={vi.fn()}
        onAddPath={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})
