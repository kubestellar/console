/**
 * Mission Browser
 *
 * Full-screen file-explorer-style dialog for browsing and importing mission files.
 * Sources: KubeStellar Community repo, GitHub repos with kubestellar-missions, local files.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Search, X, Upload, Filter, Grid3X3, List, Sparkles, CheckCircle,
  Loader2, ExternalLink, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { api } from '../../lib/api'
import { isDemoMode } from '../../lib/demoMode'
import { useAuth } from '../../lib/auth'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants/network'
import { matchMissionsToCluster } from '../../lib/missions/matcher'
import { useClusterContext } from '../../hooks/useClusterContext'
import {
  emitFixerBrowsed,
  emitFixerViewed,
  emitFixerImported,
  emitFixerImportError,
  emitFixerGitHubLink,
  emitFixerLinkCopied } from '../../lib/analytics'
import type {
  MissionExport,
  MissionMatch,
  BrowseEntry,
  FileScanResult } from '../../lib/missions/types'
import { validateMissionExport } from '../../lib/missions/types'
import { parseFileContent, type UnstructuredPreview } from '../../lib/missions/fileParser'
import type { ApiGroupMapping } from '../../lib/missions/apiGroupMapping'
import { fullScan } from '../../lib/missions/scanner/index'
import { ScanProgressOverlay } from './ScanProgressOverlay'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { InstallerCard } from './InstallerCard'
import { FixerCard } from './FixerCard'
import { MissionDetailView } from './MissionDetailView'
import { ImproveMissionDialog } from './ImproveMissionDialog'
import { UnstructuredFilePreview } from './UnstructuredFilePreview'
import { useTranslation } from 'react-i18next'
import {
  TreeNodeItem, DirectoryListing, RecommendationCard, EmptyState, MissionFetchErrorBanner,
  getMissionSlug, getMissionShareUrl, updateNodeInTree, removeNodeFromTree,
  missionCache, startMissionCacheFetch, resetMissionCache,
  fetchMissionContent, BROWSER_TABS,
  VirtualizedMissionGrid,
  getCachedRecommendations, setCachedRecommendations } from './browser'
import type { TreeNode, ViewMode, BrowserTab } from './browser'
import { copyToClipboard } from '../../lib/clipboard'
import { useToast } from '../ui/Toast'

// ============================================================================
// Types
// ============================================================================

interface MissionBrowserProps {
  isOpen: boolean
  onClose: () => void
  onImport: (mission: MissionExport) => void
  /** Deep-link: auto-select a specific mission by name (e.g. 'install-prometheus') */
  initialMission?: string
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_FILTERS = [
  'All',
  'Troubleshoot',
  'Deploy',
  'Upgrade',
  'Analyze',
  'Repair',
  'Custom',
] as const

const SIDEBAR_WIDTH = 280
const WATCHED_REPOS_KEY = 'kc_mission_watched_repos'
const WATCHED_PATHS_KEY = 'kc_mission_watched_paths'

/** File extensions accepted by the mission browser */
const MISSION_FILE_EXTENSIONS = ['.json', '.yaml', '.yml', '.md'] as const
const MISSION_FILE_ACCEPT = '.json,.yaml,.yml,.md,application/json,text/yaml,text/markdown'

/**
 * #6421 — Matches any filesystem entry whose name begins with a dot.
 * This exhaustively hides ALL dot-prefixed directories and files (the
 * standard Unix hidden-entry convention) from the mission browser UI.
 * The previous implementation only hid an enumerated set (.github, .gitkeep,
 * index.json) which let .gitlab, .assets, .vscode, .well-known, etc. leak
 * through whenever a new one was added to a source repo.
 */
const HIDDEN_ENTRY_REGEX = /^\./

/**
 * Returns true if an entry should be hidden from the browser listing.
 * Hides dot-prefixed entries (directories AND files) and the legacy
 * `index.json` manifest which is internal routing state, not a mission.
 */
function isHiddenEntry(name: string): boolean {
  if (HIDDEN_ENTRY_REGEX.test(name)) return true
  if (name === 'index.json') return true
  return false
}

/** Check if a filename has a supported mission file extension */
function isMissionFile(name: string): boolean {
  const lower = name.toLowerCase()
  return MISSION_FILE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

const CNCF_CATEGORIES = [
  'All', 'Observability', 'Orchestration', 'Runtime', 'Provisioning',
  'Security', 'Service Mesh', 'App Definition', 'Serverless',
  'Storage', 'Streaming', 'Networking',
] as const

const MATURITY_LEVELS = ['All', 'graduated', 'incubating', 'sandbox'] as const

function loadWatchedRepos(): string[] {
  try {
    return JSON.parse(localStorage.getItem(WATCHED_REPOS_KEY) || '[]')
  } catch { return [] }
}

function saveWatchedRepos(repos: string[]) {
  localStorage.setItem(WATCHED_REPOS_KEY, JSON.stringify(repos))
}

function loadWatchedPaths(): string[] {
  try {
    return JSON.parse(localStorage.getItem(WATCHED_PATHS_KEY) || '[]')
  } catch { return [] }
}

function saveWatchedPaths(paths: string[]) {
  localStorage.setItem(WATCHED_PATHS_KEY, JSON.stringify(paths))
}

// ============================================================================
// Component
// ============================================================================

export function MissionBrowser({ isOpen, onClose, onImport, initialMission }: MissionBrowserProps) {
  const { t } = useTranslation(['common', 'cards'])
  const { user, isAuthenticated } = useAuth()
  const { clusterContext } = useClusterContext()
  const clusterContextRef = useRef(clusterContext)
  clusterContextRef.current = clusterContext
  const { showToast } = useToast()

  // Navigation state
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('All')
  const [cncfFilter, setCncfFilter] = useState<string>('')
  const [minMatchPercent, setMinMatchPercent] = useState<number>(25)
  const [matchSourceFilter, setMatchSourceFilter] = useState<'all' | 'cluster' | 'community'>('all')
  const [maturityFilter, setMaturityFilter] = useState<string>('All')
  const [missionClassFilter, setMissionClassFilter] = useState<string>('All')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  // Default to list view and hide filters on mobile for better content visibility
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'list' : 'grid')
  const [showFilters, setShowFilters] = useState(!isMobile)

  // Tree state
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // Content state
  const [directoryEntries, setDirectoryEntries] = useState<BrowseEntry[]>([])
  const [selectedMission, setSelectedMission] = useState<MissionExport | null>(null)
  const [rawContent, setRawContent] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isMissionLoading, setIsMissionLoading] = useState(false)
  const [missionContentError, setMissionContentError] = useState<string | null>(null)

  // YAML/MD file parsing state
  const [unstructuredContent, setUnstructuredContent] = useState<{
    content: string
    format: 'yaml' | 'markdown'
    preview: UnstructuredPreview
    detectedProjects: ApiGroupMapping[]
  } | null>(null)

  // Recommendations
  const [recommendations, setRecommendations] = useState<MissionMatch[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [searchProgress, setSearchProgress] = useState<{ step: string; detail: string; found: number; scanned: number }>({ step: '', detail: '', found: 0, scanned: 0 })
  const [tokenError, setTokenError] = useState<'rate_limited' | 'token_invalid' | null>(null)
  const [hasCluster, setHasCluster] = useState(false)

  // Scan state
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<FileScanResult | null>(null)
  const [, setPendingImport] = useState<MissionExport | null>(null)
  const pendingImportRef = useRef<MissionExport | null>(null)

  // Improve mission dialog state
  const [showImproveDialog, setShowImproveDialog] = useState(false)

  // Drag state
  const [isDragging, setIsDragging] = useState(false)

  // Watched sources
  const [watchedRepos, setWatchedRepos] = useState<string[]>(loadWatchedRepos)
  const [watchedPaths, setWatchedPaths] = useState<string[]>(loadWatchedPaths)
  const [addingRepo, setAddingRepo] = useState(false)
  const [addingPath, setAddingPath] = useState(false)
  const [newRepoValue, setNewRepoValue] = useState('')
  const [newPathValue, setNewPathValue] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState<BrowserTab>('recommended')

  // Installer & Fixer missions — backed by module-level cache
  const [installerMissions, setInstallerMissions] = useState<MissionExport[]>(missionCache.installers)
  const [fixerMissions, setFixerMissions] = useState<MissionExport[]>(missionCache.fixes)
  const [, forceUpdate] = useState(0)
  const loadingInstallers = !missionCache.installersDone
  const loadingFixers = !missionCache.fixesDone
  const [missionFetchError, setMissionFetchError] = useState<string | null>(missionCache.fetchError)
  const [installerCategoryFilter, setInstallerCategoryFilter] = useState<string>('All')
  const [installerMaturityFilter, setInstallerMaturityFilter] = useState<string>('All')
  const [fixerTypeFilter, setFixerTypeFilter] = useState<string>('All')
  const [installerSearch, setInstallerSearch] = useState('')
  const [fixerSearch, setFixerSearch] = useState('')

  // ============================================================================
  // Initialize tree when dialog opens
  // ============================================================================

  useEffect(() => {
    if (!isOpen) return

    const rootNodes: TreeNode[] = [
      {
        id: 'community',
        name: 'KubeStellar Community',
        path: 'fixes',
        type: 'directory',
        source: 'community',
        loaded: false,
        description: 'console-kb' },
      {
        id: 'kubara',
        name: 'Kubara Platform Catalog',
        path: 'go-binary/templates/embedded/managed-service-catalog/helm',
        type: 'directory',
        source: 'github',
        loaded: false,
        description: isDemoMode() ? 'Demo catalog — install console locally for live data' : 'Production-tested Helm values from kubara-io/kubara',
        repoOwner: 'kubara-io',
        repoName: 'kubara' },
    ]

    if (isAuthenticated && user) {
      rootNodes.push({
        id: 'github',
        name: 'GitHub Repositories',
        path: '',
        type: 'directory',
        source: 'github',
        loaded: true,
        description: 'Add any repo — your own, Kubara forks, or team knowledge bases',
        children: watchedRepos.map((repo) => ({
          id: `github/${repo}`,
          name: repo.split('/').pop() || repo,
          path: repo,
          type: 'directory' as const,
          source: 'github' as const,
          loaded: false,
          description: repo })) })
    }

    rootNodes.push({
      id: 'local',
      name: 'Local Files',
      path: '',
      type: 'directory',
      source: 'local',
      loaded: true,
      children: watchedPaths.map((p) => ({
        id: `local/${p}`,
        name: p.split('/').pop() || p,
        path: p,
        type: 'directory' as const,
        source: 'local' as const,
        loaded: false,
        description: p })),
      description: 'Drop files or add paths' })

    setTreeNodes(rootNodes)
    setSelectedPath(null)
    setSelectedMission(null)
    setDirectoryEntries([])
    setShowRaw(false)
    setRawContent(null)
    setScanResult(null)
    setPendingImport(null)
    setIsScanning(false)
    // Preserve activeTab, searchQuery, and filter state across re-opens
  }, [isOpen, isAuthenticated, user, watchedRepos, watchedPaths])

  // ============================================================================
  // Fetch recommendations (with module-level caching to avoid recomputation)
  // ============================================================================

  useEffect(() => {
    if (!isOpen) return

    // Derive recommendations from the existing mission cache (no separate scan)
    setTokenError(null)
    function updateRecommendations() {
      const allMissions = [...missionCache.fixes]
      if (allMissions.length === 0) {
        if (!missionCache.fixesDone) {
          setLoadingRecommendations(true)
          setSearchProgress({ step: 'Scanning', detail: 'Loading fixes...', found: 0, scanned: 0 })
        }
        return
      }

      // Use cached recommendations if available and still valid
      const cached = getCachedRecommendations(clusterContextRef.current)
      if (cached) {
        setRecommendations(cached)
        setHasCluster(!!clusterContextRef.current)
        setLoadingRecommendations(false)
        const done = missionCache.fixesDone
        setSearchProgress({
          step: done ? 'Done' : 'Scanning',
          detail: `${allMissions.length} fixes`,
          found: allMissions.length,
          scanned: allMissions.length })
        return
      }

      // Cache miss — compute recommendations and store them
      const cluster = clusterContextRef.current
      setHasCluster(!!cluster)
      const matched = matchMissionsToCluster(allMissions, cluster)
      setCachedRecommendations(matched, cluster)
      setRecommendations(matched)
      setLoadingRecommendations(false)
      const done = missionCache.fixesDone
      setSearchProgress({
        step: done ? 'Done' : 'Scanning',
        detail: `${allMissions.length} fixes`,
        found: allMissions.length,
        scanned: allMissions.length })
    }

    // Run immediately and subscribe to cache updates
    updateRecommendations()
    missionCache.listeners.add(updateRecommendations)
    return () => { missionCache.listeners.delete(updateRecommendations) }
  }, [isOpen])

  // ============================================================================
  // Subscribe to module-level mission cache and trigger fetch on first open
  // ============================================================================

  useEffect(() => {
    if (!isOpen) return

    // Sync local state from cache immediately (covers re-open with cached data)
    setInstallerMissions([...missionCache.installers])
    setFixerMissions([...missionCache.fixes])

    // Listen for incremental updates from the background fetch
    const listener = () => {
      setInstallerMissions([...missionCache.installers])
      setFixerMissions([...missionCache.fixes])
      setMissionFetchError(missionCache.fetchError)
      forceUpdate(n => n + 1)
    }
    missionCache.listeners.add(listener)

    // Kick off fetches (no-op if already done or in progress)
    startMissionCacheFetch()

    return () => { missionCache.listeners.delete(listener) }
  }, [isOpen])

  // ============================================================================
  // Select a card mission — fetch full content on demand
  // ============================================================================

  // Track the latest selection to prevent stale async responses from overwriting
  const latestSelectionRef = useRef<string>('')

  // PR #6518 item F — wrap in useCallback so the deep-link effect below can
  // safely list it in its dependency array without thrashing every render.
  // All captured references are either state setters (stable) or module-level
  // imports (fetchMissionContent) — so the callback itself is stable.
  const selectCardMission = useCallback(async (mission: MissionExport) => {
    // Use title + type as unique key (MissionExport has no id field)
    const selectionKey = `${mission.title}::${mission.type}`
    latestSelectionRef.current = selectionKey

    // Show index metadata immediately for instant feedback
    setSelectedMission(mission)
    setIsMissionLoading(true)
    setMissionContentError(null)
    setRawContent(JSON.stringify(mission, null, 2))
    setShowRaw(false)

    // Fetch full file content (steps, uninstall, upgrade, troubleshooting)
    try {
      const { mission: fullMission, raw } = await fetchMissionContent(mission)
      // Only update if this is still the latest selection (prevents race condition)
      if (latestSelectionRef.current === selectionKey) {
        setSelectedMission(fullMission)
        setRawContent(raw)
      }
    } catch {
      if (latestSelectionRef.current === selectionKey) {
        setMissionContentError('Failed to load full mission content. Steps may be incomplete.')
      }
    } finally {
      if (latestSelectionRef.current === selectionKey) {
        setIsMissionLoading(false)
      }
    }
  }, [])

  // ============================================================================
  // Copy shareable link for a mission
  // ============================================================================

  const handleCopyLink = (mission: MissionExport, e: React.MouseEvent) => {
    e.stopPropagation()
    const url = getMissionShareUrl(mission)
    copyToClipboard(url)
    emitFixerLinkCopied(mission.title, mission.cncfProject)
  }

  // ============================================================================
  // Deep-link: auto-select mission by name when initialMission is set.
  // The slug is saved in a ref so it survives the URL param being removed
  // (MissionSidebar clears ?mission= after opening, but data may not have
  // loaded yet — the ref keeps the slug alive for later matching).
  // ============================================================================

  // issue 6467 — Deep-link slug tracking. Previously this updated the ref
  // only on first render (`if (!deepLinkSlugRef.current)`), so when a user
  // deep-linked into mission A and then clicked mission B without closing
  // the browser, the effect below kept trying to match mission A's old
  // slug. Update the ref whenever `initialMission` changes, and include
  // `initialMission` in the effect's dep array so the effect re-runs when
  // a new deep-link arrives.
  const deepLinkSlugRef = useRef<string | null>(null)
  useEffect(() => {
    if (initialMission) {
      deepLinkSlugRef.current = initialMission.toLowerCase()
    }
  }, [initialMission])

  useEffect(() => {
    const slug = deepLinkSlugRef.current
    if (!slug || !isOpen || selectedMission) return

    /**
     * Fuzzy deep-link matching: converts both the URL slug and mission metadata
     * into normalized word-sets so that `/missions/install-open-policy-agent-opa`
     * can match a mission titled "Install and Configure Open Policy Agent Opa-".
     *
     * Strategy (in priority order):
     *  1. Exact slug match (`getMissionSlug(m) === slug`)
     *  2. cncfProject match (strip "install-" prefix from slug)
     *  3. Fuzzy word-overlap: extract meaningful words from the slug and from
     *     the mission title+cncfProject, then pick the mission whose word
     *     overlap ratio is highest (≥ threshold).
     */
    const FILLER_WORDS = new Set(['and', 'on', 'for', 'the', 'in', 'with', 'a', 'an', 'to', 'of', 'kubernetes', 'k8s'])
    const MIN_WORD_OVERLAP_RATIO = 0.6

    /** Extract unique meaningful lowercase words, stripping filler and short fragments */
    const toWordSet = (s: string): Set<string> =>
      new Set(
        s.toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .split(' ')
          .filter((w) => w.length > 1 && !FILLER_WORDS.has(w))
      )

    const slugWordSet = toWordSet(slug)

    /** Score how well a mission matches the deep-link slug (0–1) */
    const scoreMission = (m: MissionExport, isInstaller: boolean): number => {
      // Exact slug match
      if (getMissionSlug(m) === slug) return 1

      // cncfProject match (installers only — fixers use slug/title matching)
      if (isInstaller) {
        const project = (m.cncfProject || '').toLowerCase()
        const slugProject = slug.replace(/^install-/, '')
        if (project && (project === slugProject || project === slug)) return 0.95
      }

      // Fuzzy word-overlap (set intersection) on title + cncfProject
      const missionWordSet = toWordSet(`${m.title || ''} ${m.cncfProject || ''}`)
      if (slugWordSet.size === 0 || missionWordSet.size === 0) return 0
      let matched = 0
      for (const w of slugWordSet) { if (missionWordSet.has(w)) matched++ }
      return matched / slugWordSet.size
    }

    /** Minimum score to permanently consume the deep-link ref (#5654) */
    const HIGH_CONFIDENCE_THRESHOLD = 0.9

    /** Find best-scoring mission at or above threshold in a list */
    const findBest = (list: MissionExport[], isInstaller: boolean): { match?: MissionExport; score: number } => {
      let best: MissionExport | undefined
      let bestScore = MIN_WORD_OVERLAP_RATIO
      for (const m of list) {
        const score = scoreMission(m, isInstaller)
        if (score >= bestScore) { best = m; bestScore = score }
      }
      return { match: best, score: bestScore }
    }

    // Search installers first, then fixers
    const installer = findBest(installerMissions, true)
    if (installer.match) {
      setActiveTab('installers')
      selectCardMission(installer.match)
      // Only consume ref for high-confidence matches — low-confidence matches
      // may be superseded when more missions finish loading (#5654)
      if (installer.score >= HIGH_CONFIDENCE_THRESHOLD) deepLinkSlugRef.current = null
      return
    }

    const fixer = findBest(fixerMissions, false)
    if (fixer.match) {
      setActiveTab('fixes')
      selectCardMission(fixer.match)
      if (fixer.score >= HIGH_CONFIDENCE_THRESHOLD) deepLinkSlugRef.current = null
      return
    }

    // No match yet — switch to installers tab while data loads
    if (installerMissions.length === 0 && fixerMissions.length === 0 && activeTab !== 'installers') {
      setActiveTab('installers')
    }
    // PR #6518 item F — `selectCardMission` is now wrapped in useCallback
    // with an empty dep array, so it's a stable reference across renders.
    // Including it in the dep array satisfies react-hooks/exhaustive-deps
    // without causing the effect to re-run on every render.
  }, [initialMission, isOpen, installerMissions, fixerMissions, selectedMission, activeTab, selectCardMission])

  // ============================================================================
  // Filtered installer & fixer lists
  // ============================================================================

  // Effective search: local tab search takes priority; clear global fallback when user types locally
  const effectiveInstallerSearch = installerSearch || searchQuery
  const effectiveFixerSearch = fixerSearch || searchQuery

  /** When user types in a tab-specific search, clear the global search so it does not interfere */
  const handleInstallerSearchChange = (value: string) => {
    setInstallerSearch(value)
    if (value && searchQuery) setSearchQuery('')
  }

  const handleFixerSearchChange = (value: string) => {
    setFixerSearch(value)
    if (value && searchQuery) setSearchQuery('')
  }

  // AND search: each space-separated term must match somewhere in the mission
  const andMatch = (text: string, query: string) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const lower = text.toLowerCase()
    return terms.every(term => lower.includes(term))
  }

  const matchesMission = (m: MissionExport, query: string) => {
    const haystack = [m.title || '', m.description || '', ...(m.tags || [])].join(' ')
    return andMatch(haystack, query)
  }

  const filteredInstallers = (() => {
    let list = installerMissions
    if (installerCategoryFilter !== 'All') {
      list = list.filter(m => m.category === installerCategoryFilter)
    }
    if (installerMaturityFilter !== 'All') {
      list = list.filter(m => m.tags?.includes(installerMaturityFilter))
    }
    if (effectiveInstallerSearch) {
      list = list.filter(m => matchesMission(m, effectiveInstallerSearch))
    }
    return list
  })()

  const filteredFixers = (() => {
    let list = fixerMissions
    if (fixerTypeFilter !== 'All') {
      list = list.filter(m => m.type === fixerTypeFilter.toLowerCase())
    }
    if (effectiveFixerSearch) {
      list = list.filter(m => matchesMission(m, effectiveFixerSearch))
    }
    return list
  })()

  // ============================================================================
  // Tree expansion & lazy loading
  // ============================================================================

  const toggleNode = async (node: TreeNode) => {
    const nodeId = node.id

    if (expandedNodes.has(nodeId)) {
      setExpandedNodes((prev) => {
        const next = new Set(prev)
        next.delete(nodeId)
        return next
      })
      return
    }

    // Expand the node
    setExpandedNodes((prev) => new Set(prev).add(nodeId))

    // If not loaded, fetch children
    if (!node.loaded && !node.loading) {
      setTreeNodes((prev) =>
        updateNodeInTree(prev, nodeId, { loading: true })
      )

      try {
        let children: TreeNode[] = []

        if (node.source === 'community') {
          const { data: entries } = await api.get<BrowseEntry[]>(
            `/api/missions/browse?path=${encodeURIComponent(node.path)}`
          )
          // Backend already filters infra/metadata, but guard client-side too.
          // #6421 — filter ALL dot-prefixed entries (directories AND files).
          children = entries
            .filter(e => !isHiddenEntry(e.name))
            .map((e) => ({
              id: `${nodeId}/${e.name}`,
              name: e.name,
              path: e.path,
              type: e.type,
              source: 'community' as const,
              loaded: e.type === 'file',
              description: e.description }))
        } else if (node.source === 'github') {
          if (nodeId === 'github') {
            // Root "My Repositories" node — list user's repos
            const { data: repos } = await api.get<Array<{ name: string; full_name: string }>>(
              '/api/github/repos?hasMissionsDir=true'
            )
            children = repos.map((r) => ({
              id: `github/${r.full_name}`,
              name: r.name,
              path: r.full_name,
              type: 'directory' as const,
              source: 'github' as const,
              loaded: false,
              description: r.full_name }))
          } else if (isDemoMode() && (nodeId === 'kubara' || nodeId.startsWith('kubara/'))) {
            // Demo mode: static Kubara catalog (cached, no API calls)
            if (nodeId === 'kubara') {
              children = [
                'kube-prometheus-stack', 'cert-manager', 'kyverno', 'kyverno-policies',
                'argo-cd', 'external-secrets', 'loki', 'longhorn', 'metallb', 'traefik',
              ].map(name => ({
                id: `kubara/${name}`,
                name,
                path: `go-binary/templates/embedded/managed-service-catalog/helm/${name}`,
                type: 'directory' as const,
                source: 'github' as const,
                repoOwner: 'kubara-io',
                repoName: 'kubara',
                loaded: false,
              }))
            } else {
              children = ['Chart.yaml', 'values.yaml', 'templates'].map(fname => ({
                id: `${nodeId}/${fname}`,
                name: fname,
                path: `${node.path}/${fname}`,
                type: (fname === 'templates' ? 'directory' : 'file') as TreeNode['type'],
                source: 'github' as const,
                repoOwner: 'kubara-io',
                repoName: 'kubara',
                loaded: fname !== 'templates',
              }))
            }
          } else {
            // Specific repo node — list repo contents via GitHub Contents API
            const repoPath = node.path
            const { data: ghEntries } = await api.get<Array<{ name: string; path: string; type: string; size?: number }>>(
              `/api/github/repos/${repoPath}/contents`
            )
            children = (ghEntries || [])
              .filter(e => e.type === 'dir' || isMissionFile(e.name))
              .map(e => ({
                id: `${nodeId}/${e.name}`,
                name: e.name,
                path: `${repoPath.split('/').slice(0, 2).join('/')}/${e.path}`,
                type: (e.type === 'dir' ? 'directory' : 'file') as TreeNode['type'],
                source: 'github' as const,
                loaded: e.type !== 'dir',
                description: e.size ? `${e.size} bytes` : undefined }))
          }
        }

        // For community sub-directories (not root): if no missions remain after filtering,
        // mark the node as empty and remove it from the parent's children so
        // empty category folders (containing only .gitkeep) don't clutter the tree.
        if (node.source === 'community' && children.length === 0 && nodeId !== 'community') {
          setTreeNodes((prev) =>
            removeNodeFromTree(prev, nodeId)
          )
        } else {
          setTreeNodes((prev) =>
            updateNodeInTree(prev, nodeId, {
              children,
              loaded: true,
              loading: false,
              isEmpty: children.length === 0 })
          )
        }
      } catch {
        // Network/rate-limit error — show as loaded but empty with a descriptive marker
        setTreeNodes((prev) =>
          updateNodeInTree(prev, nodeId, {
            children: [],
            loaded: true,
            loading: false,
            isEmpty: true,
            description: 'Failed to load — check network or GitHub rate limits' })
        )
      }
    }
  }

  // ============================================================================
  // Select a node (directory → show listing, file → show preview)
  // ============================================================================

  const selectNode = async (node: TreeNode) => {
    setSelectedPath(node.id)
    setSelectedMission(null)
    setRawContent(null)
    setShowRaw(false)

    if (node.type === 'directory') {
      emitFixerBrowsed(node.path)
      setLoading(true)
      try {
        if (node.source === 'community') {
          const { data: entries } = await api.get<BrowseEntry[]>(
            `/api/missions/browse?path=${encodeURIComponent(node.path)}`
          )
          // #6421 — Hide dot-prefixed entries and the index.json manifest.
          // Only mission files or directories may appear in the listing.
          setDirectoryEntries(
            entries.filter(e =>
              !isHiddenEntry(e.name) &&
              (e.type === 'directory' || isMissionFile(e.name))
            )
          )
        } else if (node.source === 'github') {
          // Fetch repo contents via GitHub Contents API proxy
          const owner = node.repoOwner || node.path.split('/')[0]
          const repo = node.repoName || node.path.split('/')[1]
          const subPath = node.repoOwner ? node.path : node.path.split('/').slice(2).join('/')
          const apiPath = subPath
            ? `/api/github/repos/${owner}/${repo}/contents/${subPath}`
            : `/api/github/repos/${owner}/${repo}/contents/`
          const { data: ghEntries } = await api.get<Array<{ name: string; path: string; type: string; size?: number }>>(apiPath)
          const entries: BrowseEntry[] = (ghEntries || [])
            .filter(e => e.type === 'dir' || isMissionFile(e.name))
            .map(e => ({
              name: e.name,
              path: node.repoOwner ? e.path : `${owner}/${repo}/${e.path}`,
              type: e.type === 'dir' ? 'directory' as const : 'file' as const,
              size: e.size }))
          setDirectoryEntries(entries)
        } else {
          setDirectoryEntries([])
        }
      } catch {
        setDirectoryEntries([])
      } finally {
        setLoading(false)
      }
    } else {
      // File selected → fetch and preview
      setLoading(true)
      try {
        let content: string
        if (node.source === 'community') {
          const { data } = await api.get<string>(
            `/api/missions/file?path=${encodeURIComponent(node.path)}`
          )
          content = data
        } else if (node.source === 'github') {
          // In demo mode for Kubara files, return demo content
          if (isDemoMode() && node.id.startsWith('kubara/')) {
            const chartName = node.id.split('/')[1] || 'chart'
            if (node.name === 'Chart.yaml') {
              content = `apiVersion: v2\nname: ${chartName}\ndescription: Production-tested ${chartName} Helm chart from Kubara\nversion: 1.0.0\ntype: application\nappVersion: "latest"\nmaintainers:\n  - name: kubara-io\n    url: https://github.com/kubara-io/kubara`
            } else if (node.name === 'values.yaml') {
              content = `# ${chartName} — Kubara production values\n# These values are tested in production environments\n# See https://github.com/kubara-io/kubara for details\n\nreplicaCount: 2\n\nresources:\n  requests:\n    cpu: 100m\n    memory: 128Mi\n  limits:\n    cpu: 500m\n    memory: 512Mi\n\nserviceAccount:\n  create: true\n\npodSecurityContext:\n  runAsNonRoot: true\n  fsGroup: 65534\n\nmonitoring:\n  enabled: true\n  serviceMonitor:\n    enabled: true`
            } else {
              content = `# ${node.name}\n# Kubara template file`
            }
          } else {
          // Fetch raw file content via GitHub Contents API proxy
          const parts = node.path.split('/')
          const owner = parts[0]
          const repo = parts[1]
          const filePath = parts.slice(2).join('/')
          const { data: ghFile } = await api.get<{ content?: string; encoding?: string; download_url?: string }>(
            `/api/github/repos/${owner}/${repo}/contents/${filePath}`
          )
          // GitHub returns base64-encoded content for files
          if (ghFile.content && ghFile.encoding === 'base64') {
            content = atob(ghFile.content.replace(/\n/g, ''))
          } else if (ghFile.download_url) {
            const rawResp = await fetch(ghFile.download_url, {
              signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
            content = await rawResp.text()
          } else {
            content = JSON.stringify(ghFile)
          }
          }
        } else {
          return
        }

        const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
        setRawContent(raw)
        setUnstructuredContent(null)

        // External repo files (e.g., Kubara Helm charts) are not missions —
        // show as raw YAML/content instead of trying to parse as a mission
        if (node.repoOwner) {
          const format = node.name.endsWith('.yaml') || node.name.endsWith('.yml') ? 'yaml' as const : 'markdown' as const
          setUnstructuredContent({ content: raw, format, preview: { detectedTitle: node.name, detectedSections: [], detectedCommands: [], detectedYamlBlocks: 1, detectedApiGroups: [], totalLines: raw.split('\n').length }, detectedProjects: [] })
          setSelectedMission(null)
        } else {
        try {
          const parseResult = parseFileContent(raw, node.name)
          if (parseResult.type === 'structured') {
            const validation = validateMissionExport(parseResult.mission)
            if (validation.valid) {
              setSelectedMission(validation.data)
              emitFixerViewed(validation.data.title, validation.data.cncfProject)
            } else {
              setSelectedMission(parseResult.mission)
              emitFixerViewed(parseResult.mission.title ?? node.name, parseResult.mission.cncfProject)
            }
          } else {
            setUnstructuredContent(parseResult)
            setSelectedMission(null)
          }
        } catch {
          // Fallback: try JSON parse for backwards compatibility
          try {
            const parsed = JSON.parse(raw)
            const validation = validateMissionExport(parsed)
            setSelectedMission(validation.valid ? validation.data : (parsed as MissionExport))
          } catch {
            setSelectedMission(null)
          }
        }
        }
      } catch {
        setRawContent(null)
        setSelectedMission(null)
      } finally {
        setLoading(false)
      }
    }
  }

  // ============================================================================
  // Import flow
  // ============================================================================

  const handleImport = async (mission: MissionExport, raw?: string) => {
    setPendingImport(mission)
    pendingImportRef.current = mission
    setIsScanning(true)

    // If steps are empty (index-only metadata), fetch full content first
    let resolvedMission = mission
    if ((!mission.steps || mission.steps.length === 0) && !raw) {
      try {
        const fetched = await fetchMissionContent(mission)
        resolvedMission = fetched.mission
        setPendingImport(resolvedMission)
        pendingImportRef.current = resolvedMission
      } catch {
        // Fall through with index-only mission — validation will catch the empty steps
      }
    }

    // When raw content is provided (e.g. file upload / detail view), parse and
    // validate the raw JSON directly. Otherwise validate the merged MissionExport
    // (raw file uses a nested format that doesn't match the flat validator schema).
    let toValidate: unknown = resolvedMission
    if (raw) {
      try { toValidate = JSON.parse(raw) } catch { toValidate = resolvedMission }
    }
    const validation = validateMissionExport(toValidate)
    if (!validation.valid) {
      const missionTitle = (toValidate as Record<string, unknown>)?.title as string
        ?? (toValidate as Record<string, unknown>)?.name as string
        ?? 'unknown'
      emitFixerImportError(
        missionTitle,
        validation.errors.length,
        validation.errors[0]?.message ?? 'unknown',
      )
      setScanResult({
        valid: false,
        findings: validation.errors.map((e) => ({
          severity: 'error' as const,
          code: 'SCHEMA_VALIDATION',
          message: e.message,
          path: e.path ?? '' })),
        metadata: null })
      return
    }

    const result = fullScan(validation.data)
    setScanResult(result)
  }

  const handleScanComplete = (result: FileScanResult) => {
    // Use ref to avoid stale closure — pendingImport state may not have
    // updated yet when scan completes synchronously after async fetch.
    // #7151/#7158 — Guard against dismissed scans: if pendingImportRef was
    // cleared by handleScanDismiss (user closed the overlay), do NOT proceed
    // with the import even if the scan result is valid. Without this check,
    // a dismissed scan that completed asynchronously would still trigger the
    // import, ignoring the user's dismiss action.
    const mission = pendingImportRef.current
    if (!mission) {
      // Scan was dismissed — ignore the result
      setIsScanning(false)
      return
    }
    if (result.valid) {
      emitFixerImported(mission.title, mission.cncfProject)
      onImport(mission)
      onClose()
    }
    setIsScanning(false)
  }

  const handleScanDismiss = () => {
    // #7151/#7158 — Clear the pending import ref FIRST so any in-flight
    // async scan that completes after dismiss sees null and bails out.
    // This is the cancellation token for scan/import operations.
    pendingImportRef.current = null
    setIsScanning(false)
    setScanResult(null)
    setPendingImport(null)
  }

  // ============================================================================
  // Local file handling
  // ============================================================================

  const processLocalFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string

      const localNode: TreeNode = {
        id: `local/${file.name}`,
        name: file.name,
        path: file.name,
        type: 'file',
        source: 'local',
        loaded: true }

      setTreeNodes((prev) =>
        prev.map((n) =>
          n.id === 'local'
            ? { ...n, children: [...(n.children || []), localNode] }
            : n
        )
      )
      setExpandedNodes((prev) => new Set(prev).add('local'))
      setRawContent(content)
      setSelectedPath(`local/${file.name}`)
      setDirectoryEntries([])
      setUnstructuredContent(null)

      try {
        const parseResult = parseFileContent(content, file.name)

        if (parseResult.type === 'structured') {
          const validation = validateMissionExport(parseResult.mission)
          setSelectedMission(validation.valid ? validation.data : parseResult.mission)
        } else {
          setUnstructuredContent(parseResult)
          setSelectedMission(null)
        }
      } catch {
        setSelectedMission(null)
      }
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => isMissionFile(f.name) || f.type === 'application/json'
    )
    if (files.length > 0) {
      processLocalFile(files[0])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processLocalFile(file)
    e.target.value = ''
  }

  // ============================================================================
  // Filtered directory entries
  // ============================================================================

  const filteredEntries = (() => {
    let entries = directoryEntries

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      entries = entries.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q)
      )
    }

    return entries
  })()

  // ============================================================================
  // Filtered recommendations
  // ============================================================================

  // Compute dynamic facet counts from unfiltered recommendations
  const facetCounts = useMemo(() => {
    const tags = new Map<string, number>()
    const maturity = new Map<string, number>()
    const difficulty = new Map<string, number>()
    const missionClass = new Map<string, number>()
    let clusterMatched = 0
    let community = 0

    for (const r of recommendations) {
      if (r.score > 1) clusterMatched++
      else community++
      const mat = r.mission.metadata?.maturity || 'unknown'
      maturity.set(mat, (maturity.get(mat) || 0) + 1)
      const diff = r.mission.difficulty || 'unspecified'
      difficulty.set(diff, (difficulty.get(diff) || 0) + 1)
      const cls = r.mission.missionClass || 'unspecified'
      missionClass.set(cls, (missionClass.get(cls) || 0) + 1)
      for (const tag of (r.mission.tags || [])) {
        const t = tag.toLowerCase()
        tags.set(t, (tags.get(t) || 0) + 1)
      }
    }
    const topTags = [...tags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, count]: [string, number]) => ({ tag, count }))

    return { clusterMatched, community, maturity, difficulty, missionClass, topTags }
  }, [recommendations])

  const activeFilterCount = (() => {
    let count = 0
    if (minMatchPercent > 0) count++
    if (categoryFilter !== 'All') count++
    if (matchSourceFilter !== 'all') count++
    if (maturityFilter !== 'All') count++
    if (missionClassFilter !== 'All') count++
    if (difficultyFilter !== 'All') count++
    if (selectedTags.size > 0) count++
    if (cncfFilter) count++
    return count
  })()

  const clearAllFilters = () => {
    setMinMatchPercent(0)
    setCategoryFilter('All')
    setMatchSourceFilter('all')
    setMaturityFilter('All')
    setMissionClassFilter('All')
    setDifficultyFilter('All')
    setSelectedTags(new Set())
    setCncfFilter('')
    setSearchQuery('')
  }

  const filteredRecommendations = useMemo(() => {
    let recs = recommendations

    if (minMatchPercent > 0) {
      recs = recs.filter((r) => r.matchPercent >= minMatchPercent)
    }

    if (matchSourceFilter === 'cluster') {
      recs = recs.filter((r) => r.score > 1)
    } else if (matchSourceFilter === 'community') {
      recs = recs.filter((r) => r.score <= 1)
    }

    if (categoryFilter !== 'All') {
      recs = recs.filter(
        (r) => (r.mission.type || '').toLowerCase() === categoryFilter.toLowerCase()
      )
    }

    if (maturityFilter !== 'All') {
      recs = recs.filter((r) => (r.mission.metadata?.maturity || 'unknown').toLowerCase() === maturityFilter.toLowerCase())
    }

    if (missionClassFilter !== 'All') {
      recs = recs.filter((r) => (r.mission.missionClass || 'unspecified').toLowerCase() === missionClassFilter.toLowerCase())
    }

    if (difficultyFilter !== 'All') {
      recs = recs.filter((r) => (r.mission.difficulty || 'unspecified').toLowerCase() === difficultyFilter.toLowerCase())
    }

    if (selectedTags.size > 0) {
      recs = recs.filter((r) =>
        (r.mission.tags || []).some((tag) => selectedTags.has(tag.toLowerCase()))
      )
    }

    if (cncfFilter) {
      const q = cncfFilter.toLowerCase()
      recs = recs.filter(
        (r) => r.mission.cncfProject?.toLowerCase().includes(q)
      )
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      recs = recs.filter(
        (r) =>
          (r.mission.title || '').toLowerCase().includes(q) ||
          (r.mission.description || '').toLowerCase().includes(q) ||
          (r.mission.tags || []).some((tag) => tag.toLowerCase().includes(q))
      )
    }

    return recs
  }, [recommendations, categoryFilter, cncfFilter, searchQuery, minMatchPercent, matchSourceFilter, maturityFilter, missionClassFilter, difficultyFilter, selectedTags])

  // ============================================================================
  // Keyboard
  // ============================================================================

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Stop the event from reaching the sidebar's Escape handler
        e.stopImmediatePropagation()
        if (selectedMission) {
          setSelectedMission(null)
          setRawContent(null)
          setShowRaw(false)
        } else {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedMission, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen])

  // ============================================================================
  // Render helpers
  // ============================================================================

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-[94vw] h-[90vh] bg-background rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden">
      {/* ================================================================== */}
      {/* Top bar: search + filters */}
      {/* ================================================================== */}
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'installers' ? 'Search installers… (AND logic: "argo events" = argo AND events)' : activeTab === 'fixes' ? 'Search fixes…' : 'Search missions by name, tag, or description…'}
            className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            autoFocus
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'p-2 rounded-lg transition-colors relative',
            showFilters
              ? 'bg-purple-500/20 text-purple-400'
              : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
          )}
          title="Toggle filters"
        >
          <Filter className="w-5 h-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500 text-white text-[9px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'grid'
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'list'
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* #6308: close button moved to the RIGHT end of the top bar to
            match every other modal in the app (BaseModal etc). Having
            it on the left was a confusing one-off — users trained to
            close modals via the top-right X were not finding it. */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Close (Esc)"
          aria-label="Close mission browser"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Filter bar — constrained height on mobile with scroll */}
      {showFilters && (
        <div className="px-4 py-2.5 bg-card border-b border-border space-y-2 max-h-[40vh] md:max-h-[50vh] overflow-y-auto">
          {/* Row 1: Clear all + Match % + Source + Category */}
          <div className="flex items-center gap-3 flex-wrap">
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear all
              </button>
            )}

            <span className="text-xs text-muted-foreground font-medium">Match:</span>
            <div className="flex items-center gap-1">
              {[0, 25, 50, 75].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setMinMatchPercent(pct)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded-full transition-colors tabular-nums',
                    minMatchPercent === pct
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                  )}
                >
                  {pct === 0 ? 'Any' : `≥${pct}%`}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-border" />

            <span className="text-xs text-muted-foreground font-medium">Source:</span>
            <div className="flex items-center gap-1">
              {([['all', 'All', null], ['cluster', '🎯 Cluster', facetCounts.clusterMatched], ['community', '🌐 Community', facetCounts.community]] as const).map(([val, label, count]) => (
                <button
                  key={val}
                  onClick={() => setMatchSourceFilter(val)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded-full transition-colors',
                    matchSourceFilter === val
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                  )}
                >
                  {label}{count != null ? ` (${count})` : ''}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-border" />

            <span className="text-xs text-muted-foreground font-medium">Category:</span>
            <div className="flex items-center gap-1">
              {CATEGORY_FILTERS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded-full transition-colors',
                    categoryFilter === cat
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Class + Maturity + Difficulty + CNCF Project */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Class:</span>
            <div className="flex items-center gap-1">
              {['All', ...Array.from(facetCounts.missionClass.keys())].map((cls) => (
                <button
                  key={cls}
                  onClick={() => setMissionClassFilter(cls)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded-full transition-colors capitalize',
                    missionClassFilter === cls
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                  )}
                >
                  {cls === 'All' ? cls : `${cls} (${facetCounts.missionClass.get(cls) || 0})`}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-border" />

            <span className="text-xs text-muted-foreground font-medium">Maturity:</span>
            <div className="flex items-center gap-1">
              {['All', ...Array.from(facetCounts.maturity.keys())].map((mat) => (
                <button
                  key={mat}
                  onClick={() => setMaturityFilter(mat)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded-full transition-colors capitalize',
                    maturityFilter === mat
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                  )}
                >
                  {mat === 'All' ? mat : `${mat} (${facetCounts.maturity.get(mat) || 0})`}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-border" />

            <span className="text-xs text-muted-foreground font-medium">Difficulty:</span>
            <div className="flex items-center gap-1">
              {['All', ...Array.from(facetCounts.difficulty.keys())].map((diff) => (
                <button
                  key={diff}
                  onClick={() => setDifficultyFilter(diff)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded-full transition-colors capitalize',
                    difficultyFilter === diff
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                  )}
                >
                  {diff === 'All' ? diff : `${diff} (${facetCounts.difficulty.get(diff) || 0})`}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-border" />

            <span className="text-xs text-muted-foreground font-medium">CNCF:</span>
            <input
              type="text"
              value={cncfFilter}
              onChange={(e) => setCncfFilter(e.target.value)}
              placeholder="e.g. Istio, Envoy…"
              className="w-36 px-2 py-0.5 text-[11px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
            />
          </div>

          {/* Row 3: Top tags */}
          {facetCounts.topTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">Tags:</span>
              {facetCounts.topTags.map(({ tag, count }: { tag: string; count: number }) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSelectedTags((prev: Set<string>) => {
                      const next = new Set(prev)
                      if (next.has(tag)) next.delete(tag)
                      else next.add(tag)
                      return next
                    })
                  }}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded-full transition-colors',
                    selectedTags.has(tag)
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                  )}
                >
                  {tag} <span className="opacity-60">({count})</span>
                </button>
              ))}
              {selectedTags.size > 0 && (
                <button
                  onClick={() => setSelectedTags(new Set())}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  clear tags
                </button>
              )}
            </div>
          )}

          {/* Active filter summary — always show count when recommendations are loaded */}
          {recommendations.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Showing {filteredRecommendations.length} of {recommendations.length} missions
              {activeFilterCount > 0 && ' (filtered)'}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* Tab bar */}
      {/* ================================================================== */}
      <div className="flex items-center gap-1 px-4 py-1.5 bg-card border-b border-border overflow-x-auto scrollbar-hide">
        {BROWSER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setSelectedMission(null); setActiveTab(tab.id) }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
              activeTab === tab.id
                ? 'bg-purple-500/20 text-purple-400 font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.id === 'installers' && (
              <span className="text-2xs bg-secondary px-1.5 py-0.5 rounded-full min-w-[28px] text-center tabular-nums">{installerMissions.length || '–'}</span>
            )}
            {tab.id === 'fixes' && (
              <span className="text-2xs bg-secondary px-1.5 py-0.5 rounded-full min-w-[28px] text-center tabular-nums">{fixerMissions.length || '–'}</span>
            )}
          </button>
        ))}
        <button
          onClick={() => resetMissionCache()}
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
          title={activeTab === 'installers' ? 'Refresh installers' : activeTab === 'fixes' ? 'Refresh fixes' : 'Refresh all mission data'}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', (activeTab === 'installers' ? !missionCache.installersDone : activeTab === 'fixes' ? !missionCache.fixesDone : (!missionCache.installersDone || !missionCache.fixesDone)) && 'animate-spin')} />
        </button>
      </div>

      {/* ================================================================== */}
      {/* Main content: sidebar + panel */}
      {/* ================================================================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — file tree (hidden on mobile, shown on md+) */}
        <div
          className="hidden md:flex flex-col border-r border-border bg-card overflow-y-auto"
          style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }}
        >
          <div className="p-3 space-y-1">
            {treeNodes.map((node) => (
              <div key={node.id}>
                <div>
                  <TreeNodeItem
                    node={node}
                    depth={0}
                    expandedNodes={expandedNodes}
                    selectedPath={selectedPath}
                    onToggle={toggleNode}
                    onSelect={selectNode}
                    onRemove={node.id === 'github' ? (child) => {
                      const updated = watchedRepos.filter(r => r !== child.path)
                      setWatchedRepos(updated)
                      saveWatchedRepos(updated)
                      showToast(`Removed repository "${child.path}"`, 'info')
                    } : node.id === 'local' ? (child) => {
                      const updated = watchedPaths.filter(p => p !== child.path)
                      setWatchedPaths(updated)
                      saveWatchedPaths(updated)
                      showToast(`Removed path "${child.path}"`, 'info')
                    } : undefined}
                    onRefresh={(node.id === 'github' || node.id === 'local') ? (child) => {
                      // Mark node as unloaded to force re-fetch
                      setTreeNodes((prev) =>
                        updateNodeInTree(prev, child.id, {
                          loaded: false,
                          loading: false,
                          children: [] })
                      )
                      // Collapse and re-expand to trigger load
                      setExpandedNodes((prev) => {
                        const next = new Set(prev)
                        next.delete(child.id)
                        return next
                      })
                      // Re-expand after a tick to trigger the useEffect
                      setTimeout(() => {
                        toggleNode(child)
                        selectNode(child)
                      }, 50)
                    } : undefined}
                    onAdd={node.id === 'github' ? () => setAddingRepo(!addingRepo)
                      : node.id === 'local' ? () => setAddingPath(!addingPath)
                      : undefined}
                  />
                </div>

                {/* Inline add repo form */}
                {node.id === 'github' && addingRepo && (
                  <div className="ml-6 mt-1 mb-2">
                    <form onSubmit={(e) => {
                      e.preventDefault()
                      const val = newRepoValue.trim()
                      if (val && !watchedRepos.includes(val)) {
                        const updated = [...watchedRepos, val]
                        setWatchedRepos(updated)
                        saveWatchedRepos(updated)
                        showToast(`Added repository "${val}"`, 'success')
                      }
                      setNewRepoValue('')
                      setAddingRepo(false)
                    }} className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newRepoValue}
                        onChange={(e) => setNewRepoValue(e.target.value)}
                        placeholder="owner/repo (e.g., kubara-io/kubara or your-org/runbooks)"
                        className="flex-1 px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Escape') { setAddingRepo(false); setNewRepoValue('') } }}
                      />
                      <button type="submit" className="p-1 text-xs text-green-400 hover:text-green-300 min-h-11 min-w-11 flex items-center justify-center"><CheckCircle className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => { setAddingRepo(false); setNewRepoValue('') }} className="p-1 text-xs text-muted-foreground hover:text-foreground min-h-11 min-w-11 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                    </form>
                  </div>
                )}

                {/* Inline add path form */}
                {node.id === 'local' && addingPath && (
                  <div className="ml-6 mt-1 mb-2">
                    <form onSubmit={(e) => {
                      e.preventDefault()
                      const val = newPathValue.trim()
                      if (val && !watchedPaths.includes(val)) {
                        const updated = [...watchedPaths, val]
                        setWatchedPaths(updated)
                        saveWatchedPaths(updated)
                        showToast(`Added path "${val}"`, 'success')
                      }
                      setNewPathValue('')
                      setAddingPath(false)
                    }} className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newPathValue}
                        onChange={(e) => setNewPathValue(e.target.value)}
                        placeholder="/path/to/missions"
                        className="flex-1 px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Escape') { setAddingPath(false); setNewPathValue('') } }}
                      />
                      <button type="submit" className="p-1 text-xs text-green-400 hover:text-green-300 min-h-11 min-w-11 flex items-center justify-center"><CheckCircle className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => { setAddingPath(false); setNewPathValue('') }} className="p-1 text-xs text-muted-foreground hover:text-foreground min-h-11 min-w-11 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Drop zone for local files */}
          <div className="mt-auto p-3 border-t border-border">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
                isDragging
                  ? 'border-purple-400 bg-purple-500/10'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              <Upload className="w-5 h-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground text-center">
                Drop mission file (JSON, YAML, MD) or click to browse
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={MISSION_FILE_ACCEPT}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden relative bg-background">
          {/* Scan overlay */}
          <ScanProgressOverlay
            isScanning={isScanning}
            result={scanResult}
            onComplete={handleScanComplete}
            onDismiss={handleScanDismiss}
          />

          <div className="flex-1 overflow-y-auto p-4">
            {/* ============================================================ */}
            {/* MISSION DETAIL VIEW (renders above any tab when a mission is selected) */}
            {/* ============================================================ */}
            {selectedMission && (
              <>
                <MissionDetailView
                  mission={selectedMission}
                  rawContent={rawContent}
                  showRaw={showRaw}
                  loading={isMissionLoading}
                  error={missionContentError}
                  onRetry={() => selectCardMission(selectedMission)}
                  onToggleRaw={() => setShowRaw(!showRaw)}
                  onImport={() => handleImport(selectedMission, rawContent ?? undefined)}
                  onBack={() => {
                    setSelectedMission(null)
                    setRawContent(null)
                    setShowRaw(false)
                    setMissionContentError(null)
                  }}
                  onImprove={selectedMission.missionClass === 'install' ? () => setShowImproveDialog(true) : undefined}
                  matchScore={recommendations.find(
                    (r) => r.mission.title === selectedMission.title
                  )?.matchPercent}
                  shareUrl={getMissionShareUrl(selectedMission)}
                />
                {showImproveDialog && (
                  <ImproveMissionDialog
                    mission={selectedMission}
                    isOpen={showImproveDialog}
                    onClose={() => setShowImproveDialog(false)}
                  />
                )}
              </>
            )}

            {/* ============================================================ */}
            {/* UNSTRUCTURED FILE PREVIEW (YAML/MD not parseable as a mission) */}
            {/* ============================================================ */}
            {!selectedMission && unstructuredContent && (
              <UnstructuredFilePreview
                content={unstructuredContent.content}
                format={unstructuredContent.format}
                preview={unstructuredContent.preview}
                detectedProjects={unstructuredContent.detectedProjects}
                fileName={selectedPath?.split('/').pop() ?? 'file'}
                onConvert={(mission) => {
                  setSelectedMission(mission)
                  setUnstructuredContent(null)
                }}
                onBack={() => {
                  setUnstructuredContent(null)
                  setRawContent(null)
                  setSelectedPath(null)
                }}
              />
            )}

            {/* ============================================================ */}
            {/* RECOMMENDED TAB (existing content) */}
            {/* ============================================================ */}
            {!selectedMission && !unstructuredContent && activeTab === 'recommended' && (<>
            {/* Token / rate-limit guidance banner */}
            {tokenError && (
              <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-yellow-400 text-lg mt-0.5">⚠️</span>
                  <div className="text-sm space-y-2">
                    <p className="font-medium text-yellow-300">
                      {tokenError === 'rate_limited'
                        ? 'GitHub API rate limit reached'
                        : 'GitHub token is invalid or expired'}
                    </p>
                    <p className="text-muted-foreground">
                      The fix browser needs a GitHub personal access token to fetch missions.
                      Add one to your <code className="px-1.5 py-0.5 bg-white/10 rounded text-xs font-mono">.env</code> file and restart the console:
                    </p>
                    <ol className="text-muted-foreground list-decimal list-inside space-y-1.5 ml-1">
                      <li>
                        <a
                          href="https://github.com/settings/tokens/new?description=KubeStellar+Console&scopes=public_repo"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 underline"
                        >
                          Create a GitHub personal access token
                        </a>
                        {' '}(only <code className="px-1 py-0.5 bg-white/10 rounded text-xs font-mono">public_repo</code> scope needed)
                      </li>
                      <li>
                        Add it to your <code className="px-1 py-0.5 bg-white/10 rounded text-xs font-mono">.env</code> file:
                        <pre className="mt-1 px-3 py-2 bg-black/40 rounded text-xs font-mono text-purple-300 select-all">GITHUB_TOKEN=ghp_your_token_here</pre>
                      </li>
                      <li>{t('common.restartConsole')}</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {/* Recommended for You */}
            {!selectedMission && missionFetchError && recommendations.length === 0 && !loadingRecommendations && (
              <div className="mb-4">
                <MissionFetchErrorBanner message={missionFetchError} />
              </div>
            )}

            {/* Recommended for You */}
            {!selectedMission && (recommendations.length > 0 || loadingRecommendations) && (
              <CollapsibleSection
                title={hasCluster ? 'Recommended for Your Cluster' : 'Explore CNCF Fixes'}
                defaultOpen={true}
                badge={
                  <span className="flex items-center gap-2 text-xs text-purple-400">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      {filteredRecommendations.length}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); resetMissionCache(); }}
                      className="p-0.5 rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                      title="Refresh recommendations"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </span>
                }
                className="mb-6"
              >
                {/* Context subtitle */}
                {!loadingRecommendations && (
                  <p className="text-xs text-muted-foreground mb-3 -mt-1">
                    {hasCluster
                      ? '🎯 Matched based on your cluster resources, labels, and detected issues'
                      : '🌐 Showing popular CNCF community fixes — connect a cluster for personalized recommendations'}
                  </p>
                )}
                {loadingRecommendations ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                      <span className="flex-1">
                        {searchProgress.step === 'Connecting' && 'Connecting to knowledge base…'}
                        {searchProgress.step === 'Scanning' && (
                          <>
                            Scanning <span className="text-purple-400 font-mono">{searchProgress.detail}</span>
                          </>
                        )}
                        {searchProgress.step === 'Error' && searchProgress.detail}
                      </span>
                      {searchProgress.found > 0 && (
                        <span className="text-xs text-purple-400 tabular-nums">
                          {searchProgress.found} found · {searchProgress.scanned} scanned
                        </span>
                      )}
                    </div>
                    {/* Show cards progressively as they arrive */}
                    {filteredRecommendations.length > 0 && (
                      <VirtualizedMissionGrid
                        items={filteredRecommendations}
                        viewMode="grid"
                        maxColumns={3}
                        className="flex-1 h-[calc(90vh-360px)]"
                        renderItem={(match) => (
                          <RecommendationCard
                            match={match}
                            onSelect={() => selectCardMission(match.mission)}
                            onImport={() => handleImport(match.mission)}
                            onCopyLink={(e) => handleCopyLink(match.mission, e)}
                          />
                        )}
                      />
                    )}
                  </div>
                ) : (
                  <VirtualizedMissionGrid
                    items={filteredRecommendations}
                    viewMode="grid"
                    maxColumns={3}
                    className="flex-1 h-[calc(90vh-360px)]"
                    renderItem={(match) => (
                      <RecommendationCard
                        match={match}
                        onSelect={() => selectCardMission(match.mission)}
                        onImport={() => handleImport(match.mission)}
                      />
                    )}
                  />
                )}
              </CollapsibleSection>
            )}

            {/* Browse on GitHub link */}
            {!selectedMission && !loading && (
              <div className="flex items-center gap-2 mb-4 px-1">
                <a
                  href="https://github.com/kubestellar/console-kb/tree/master/fixes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-purple-400 transition-colors"
                  onClick={() => emitFixerGitHubLink()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Browse all fixes on GitHub
                </a>
                {searchProgress.step === 'Done' && searchProgress.found > 0 && (
                  <span className="text-xs text-muted-foreground/60 ml-auto">
                    {searchProgress.detail}
                  </span>
                )}
              </div>
            )}

            {/* Directory listing */}
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              </div>
            ) : filteredEntries.length > 0 ? (
              <DirectoryListing
                entries={filteredEntries}
                viewMode={viewMode}
                onSelect={(entry) => {
                  const entrySource = selectedPath?.startsWith('github/') ? 'github' as const : 'community' as const
                  const node: TreeNode = {
                    id: entry.path,
                    name: entry.name,
                    path: entry.path,
                    type: entry.type,
                    source: entrySource,
                    loaded: entry.type === 'file' }
                  if (entry.type === 'file') {
                    selectNode(node)
                  } else {
                    toggleNode(node)
                    selectNode(node)
                  }
                }}
                onImport={async (entry) => {
                  try {
                    const { data: content } = await api.get<string>(
                      `/api/missions/file?path=${encodeURIComponent(entry.path)}`
                    )
                    const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
                    const parsed = typeof content === 'string' ? JSON.parse(content) : content
                    handleImport(parsed, raw)
                  } catch { /* skip */ }
                }}
              />
            ) : selectedPath ? (
              <EmptyState message="No files in this directory" />
            ) : (
              <EmptyState message="Select a folder from the sidebar to browse missions" />
            )}
            </>)}

            {/* ============================================================ */}
            {/* INSTALLERS TAB */}
            {/* ============================================================ */}
            {!selectedMission && !unstructuredContent && activeTab === 'installers' && (
              <div className="space-y-4">
                {/* Installer filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 relative min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={installerSearch}
                      onChange={(e) => handleInstallerSearchChange(e.target.value)}
                      placeholder="Search installers…"
                      className="w-full pl-10 pr-4 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                    />
                  </div>
                  {!installerSearch && searchQuery && (
                    <span className="text-xs text-purple-400 flex items-center gap-1">
                      <Filter className="w-3 h-3" />
                      Filtered by global search: &quot;{searchQuery}&quot;
                    </span>
                  )}
                  <select
                    value={installerCategoryFilter}
                    onChange={(e) => setInstallerCategoryFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground"
                  >
                    {CNCF_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
                    ))}
                  </select>
                  <select
                    value={installerMaturityFilter}
                    onChange={(e) => setInstallerMaturityFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground"
                  >
                    {MATURITY_LEVELS.map(m => (
                      <option key={m} value={m}>{m === 'All' ? 'All Maturity' : m.charAt(0).toUpperCase() + m.slice(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Fetch error banner */}
                {missionFetchError && installerMissions.length === 0 && (
                  <MissionFetchErrorBanner message={missionFetchError} />
                )}

                {/* Installer grid */}
                {loadingInstallers && filteredInstallers.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    Loading CNCF installers…
                  </div>
                ) : filteredInstallers.length === 0 && !loadingInstallers ? (
                  <EmptyState message={installerMissions.length > 0 ? 'No installers match your filters' : 'No installer missions found'} />
                ) : (
                  <>
                    {loadingInstallers && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                        Loading… {installerMissions.length} found so far
                      </div>
                    )}
                    <VirtualizedMissionGrid
                      items={filteredInstallers}
                      viewMode={viewMode}
                      maxColumns={4}
                      className="flex-1 h-[calc(90vh-280px)]"
                      renderItem={(mission) => (
                        <InstallerCard
                          mission={mission}
                          compact={viewMode === 'list'}
                          onSelect={() => selectCardMission(mission)}
                          onImport={() => handleImport(mission)}
                          onCopyLink={(e) => handleCopyLink(mission, e)}
                        />
                      )}
                    />
                  </>
                )}

                {/* Count footer */}
                {filteredInstallers.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    {loadingInstallers ? `${filteredInstallers.length} loaded…` : `Showing ${filteredInstallers.length} of ${installerMissions.length} installer missions`}
                  </p>
                )}
              </div>
            )}

            {/* ============================================================ */}
            {/* FIXES TAB */}
            {/* ============================================================ */}
            {!selectedMission && !unstructuredContent && activeTab === 'fixes' && (
              <div className="space-y-4">
                {/* Fixer filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 relative min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={fixerSearch}
                      onChange={(e) => handleFixerSearchChange(e.target.value)}
                      placeholder="Search fixes…"
                      className="w-full pl-10 pr-4 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                    />
                  </div>
                  {!fixerSearch && searchQuery && (
                    <span className="text-xs text-purple-400 flex items-center gap-1">
                      <Filter className="w-3 h-3" />
                      Filtered by global search: &quot;{searchQuery}&quot;
                    </span>
                  )}
                  <select
                    value={fixerTypeFilter}
                    onChange={(e) => setFixerTypeFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground"
                  >
                    {CATEGORY_FILTERS.map(cat => (
                      <option key={cat} value={cat}>{cat === 'All' ? 'All Types' : cat}</option>
                    ))}
                  </select>
                </div>

                {/* Fetch error banner */}
                {missionFetchError && fixerMissions.length === 0 && (
                  <MissionFetchErrorBanner message={missionFetchError} />
                )}

                {/* Fixer grid */}
                {loadingFixers && filteredFixers.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    Loading fixes…
                  </div>
                ) : filteredFixers.length === 0 && !loadingFixers ? (
                  <EmptyState message={fixerMissions.length > 0 ? 'No fixes match your filters' : 'No fixer missions found'} />
                ) : (
                  <>
                    {loadingFixers && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                        Loading… {fixerMissions.length} found so far
                      </div>
                    )}
                    <VirtualizedMissionGrid
                      items={filteredFixers}
                      viewMode={viewMode}
                      maxColumns={3}
                      className="flex-1 h-[calc(90vh-280px)]"
                      renderItem={(mission) => (
                        <FixerCard
                          mission={mission}
                          compact={viewMode === 'list'}
                          onSelect={() => selectCardMission(mission)}
                          onImport={() => handleImport(mission)}
                          onCopyLink={(e) => handleCopyLink(mission, e)}
                        />
                      )}
                    />
                  </>
                )}

                {/* Count footer */}
                {filteredFixers.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    {loadingFixers ? `${filteredFixers.length} loaded…` : `Showing ${filteredFixers.length} of ${fixerMissions.length} fixer missions`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

