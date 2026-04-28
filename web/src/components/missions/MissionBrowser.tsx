/**
 * Mission Browser
 *
 * Full-screen file-explorer-style dialog for browsing and importing mission files.
 * Sources: KubeStellar Community repo, GitHub repos with kubestellar-missions, local files.
 *
 * This component owns all state and data-fetching logic. Presentation is split
 * into focused subcomponents (issue #8624):
 *   - MissionBrowserTopBar      — search, filter toggle, view-mode, close
 *   - MissionBrowserFilterPanel — filter pill rows
 *   - MissionBrowserTabBar      — tab navigation
 *   - MissionBrowserSidebar     — file tree + drop zone
 *   - MissionBrowserRecommendedTab
 *   - MissionBrowserInstallersTab
 *   - MissionBrowserFixesTab
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { api } from '../../lib/api'
import { isDemoMode } from '../../lib/demoMode'
import { useAuth } from '../../lib/auth'
import { NAVBAR_HEIGHT_PX } from '../../lib/constants/ui'
import { matchMissionsToCluster } from '../../lib/missions/matcher'
import { useClusterContext } from '../../hooks/useClusterContext'
import {
  emitFixerBrowsed,
  emitFixerViewed,
  emitFixerImported,
  emitFixerImportError,
  emitFixerLinkCopied,
} from '../../lib/analytics'
import type {
  MissionExport,
  MissionMatch,
  BrowseEntry,
  FileScanResult,
} from '../../lib/missions/types'
import { validateMissionExport } from '../../lib/missions/types'
import { parseFileContent, type UnstructuredPreview } from '../../lib/missions/fileParser'
import type { ApiGroupMapping } from '../../lib/missions/apiGroupMapping'
import { fullScan } from '../../lib/missions/scanner/index'
import { ScanProgressOverlay } from './ScanProgressOverlay'
import { MissionDetailView } from './MissionDetailView'
import { ImproveMissionDialog } from './ImproveMissionDialog'
import { UnstructuredFilePreview } from './UnstructuredFilePreview'
import {
  getMissionShareUrl,
  updateNodeInTree,
  removeNodeFromTree,
  missionCache,
  startMissionCacheFetch,
  fetchMissionContent,
  getCachedRecommendations,
  setCachedRecommendations,
  fetchTreeChildren,
  fetchDirectoryEntries,
  fetchNodeFileContent,
  getKubaraConfig,
} from './browser'
import type { TreeNode, ViewMode, BrowserTab } from './browser'
import { copyToClipboard } from '../../lib/clipboard'
import { useToast } from '../ui/Toast'
import {
  isMissionFile,
  loadWatchedRepos,
  saveWatchedRepos,
  loadWatchedPaths,
  saveWatchedPaths,
} from './missionBrowserConstants'
import {
  filterInstallers,
  filterFixers,
  computeFacetCounts,
  filterRecommendations,
} from './missionBrowserFilters'
import {
  HIGH_CONFIDENCE_THRESHOLD,
  toWordSet,
  findBestDeepLinkMatch,
} from './missionBrowserDeepLink'
import {
  computeActiveFilterCount,
  filterDirectoryEntries,
} from './missionBrowserFilterState'
import { MissionBrowserTopBar } from './MissionBrowserTopBar'
import { MissionBrowserFilterPanel } from './MissionBrowserFilterPanel'
import { MissionBrowserTabBar } from './MissionBrowserTabBar'
import { MissionBrowserSidebar } from './MissionBrowserSidebar'
import { MissionBrowserRecommendedTab } from './MissionBrowserRecommendedTab'
import { MissionBrowserInstallersTab } from './MissionBrowserInstallersTab'
import { MissionBrowserFixesTab } from './MissionBrowserFixesTab'

// ============================================================================
// Layout constants
// ============================================================================

/**
 * Breathing room (px) between the bottom of the navbar and the top of the
 * mission browser modal, so the modal header doesn't visually press against
 * the navbar (issue #9150).
 */
const MODAL_NAVBAR_GAP_PX = 16

/**
 * Top inset (px) for the mission browser modal. Must clear the fixed
 * navbar (NAVBAR_HEIGHT_PX) plus a small gap so the modal's own header
 * (search bar + filter toggle + close button) is fully visible and not
 * obscured by the navbar (issue #9150).
 */
const MODAL_TOP_INSET_PX = NAVBAR_HEIGHT_PX + MODAL_NAVBAR_GAP_PX

/**
 * Side/bottom inset (px) so the dimmed backdrop peeks through around the
 * modal panel, matching the inset pattern used by MissionControlDialog.
 */
const MODAL_SIDE_INSET_PX = 16

// ============================================================================
// Types
// ============================================================================

interface MissionBrowserProps {
  isOpen: boolean
  onClose: () => void
  onImport: (mission: MissionExport) => void
  /** Deep-link: auto-select a specific mission by name (e.g. 'install-prometheus') */
  initialMission?: string
  /** Callback when user clicks "Use in Mission Control" on a Kubara chart (#8483) */
  onUseInMissionControl?: (chartName: string) => void
}

// ============================================================================
// Component
// ============================================================================

export function MissionBrowser({ isOpen, onClose, onImport, initialMission, onUseInMissionControl }: MissionBrowserProps) {
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
        repoName: 'kubara',
        infoTooltip: 'Catalog: kubara-io/kubara · Set KUBARA_CATALOG_REPO (and optionally KUBARA_CATALOG_PATH) to use your own public or private catalog' },
    ]

    // Resolve active catalog config and update the kubara node description + repo
    // so the tree reflects whatever KUBARA_CATALOG_REPO is set to server-side.
    getKubaraConfig().then((cfg) => {
      const repo = `${cfg.repoOwner}/${cfg.repoName}`
      const isCustom = repo !== 'kubara-io/kubara'
      setTreeNodes((prev) =>
        updateNodeInTree(prev, 'kubara', {
          path: cfg.catalogPath,
          repoOwner: cfg.repoOwner,
          repoName: cfg.repoName,
          description: isDemoMode()
            ? 'Demo catalog — install console locally for live data'
            : isCustom
              ? `Custom catalog: ${repo}`
              : 'Production-tested Helm values from kubara-io/kubara',
          infoTooltip: `Catalog: ${repo} · Set KUBARA_CATALOG_REPO (and optionally KUBARA_CATALOG_PATH) to use your own public or private catalog`,
        })
      )
    }).catch(() => { /* keep defaults on error */ })

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

    // Fuzzy deep-link matching: converts both the URL slug and mission metadata
    // into normalized word-sets so that `/missions/install-open-policy-agent-opa`
    // can match a mission titled "Install and Configure Open Policy Agent Opa-".
    // Pure helpers live in `./missionBrowserDeepLink`.
    const slugWordSet = toWordSet(slug)

    // Search installers first, then fixers
    const installer = findBestDeepLinkMatch(installerMissions, slug, slugWordSet, true)
    if (installer.match) {
      setActiveTab('installers')
      selectCardMission(installer.match)
      // Only consume ref for high-confidence matches — low-confidence matches
      // may be superseded when more missions finish loading (#5654)
      if (installer.score >= HIGH_CONFIDENCE_THRESHOLD) deepLinkSlugRef.current = null
      return
    }

    const fixer = findBestDeepLinkMatch(fixerMissions, slug, slugWordSet, false)
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

  const filteredInstallers = filterInstallers(installerMissions, {
    categoryFilter: installerCategoryFilter,
    maturityFilter: installerMaturityFilter,
    search: effectiveInstallerSearch,
  })

  const filteredFixers = filterFixers(fixerMissions, {
    typeFilter: fixerTypeFilter,
    search: effectiveFixerSearch,
  })

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
        const children = await fetchTreeChildren(node)

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
        setDirectoryEntries(await fetchDirectoryEntries(node))
      } catch {
        setDirectoryEntries([])
      } finally {
        setLoading(false)
      }
    } else {
      // File selected → fetch and preview
      setLoading(true)
      try {
        const content = await fetchNodeFileContent(node)
        if (content === null) return

        const raw = content
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

  const filteredEntries = filterDirectoryEntries(directoryEntries, searchQuery)

  // ============================================================================
  // Filtered recommendations
  // ============================================================================

  // Compute dynamic facet counts from unfiltered recommendations
  const facetCounts = useMemo(() => computeFacetCounts(recommendations), [recommendations])

  const activeFilterCount = computeActiveFilterCount({
    minMatchPercent,
    categoryFilter,
    matchSourceFilter,
    maturityFilter,
    missionClassFilter,
    difficultyFilter,
    selectedTags,
    cncfFilter,
  })

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

  const filteredRecommendations = useMemo(
    () => filterRecommendations(recommendations, {
      minMatchPercent,
      matchSourceFilter,
      categoryFilter,
      maturityFilter,
      missionClassFilter,
      difficultyFilter,
      selectedTags,
      cncfFilter,
      searchQuery,
    }),
    [recommendations, categoryFilter, cncfFilter, searchQuery, minMatchPercent, matchSourceFilter, maturityFilter, missionClassFilter, difficultyFilter, selectedTags],
  )

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
  // Handlers wired to sidebar watched-source management
  // ============================================================================

  const handleAddRepo = (val: string) => {
    const updated = [...watchedRepos, val]
    setWatchedRepos(updated)
    saveWatchedRepos(updated)
    showToast(`Added repository "${val}"`, 'success')
  }

  const handleRemoveRepo = (path: string) => {
    const updated = watchedRepos.filter(r => r !== path)
    setWatchedRepos(updated)
    saveWatchedRepos(updated)
    showToast(`Removed repository "${path}"`, 'info')
  }

  const handleAddPath = (val: string) => {
    const updated = [...watchedPaths, val]
    setWatchedPaths(updated)
    saveWatchedPaths(updated)
    showToast(`Added path "${val}"`, 'success')
  }

  const handleRemovePath = (path: string) => {
    const updated = watchedPaths.filter(p => p !== path)
    setWatchedPaths(updated)
    saveWatchedPaths(updated)
    showToast(`Removed path "${path}"`, 'info')
  }

  const handleRefreshNode = (child: TreeNode) => {
    // Re-expand after a tick to trigger the useEffect
    setTimeout(() => {
      toggleNode(child)
      selectNode(child)
    }, 50)
  }

  // ============================================================================
  // Directory-entry import (recommended tab, tree navigation)
  // ============================================================================

  const handleImportDirectoryEntry = async (entry: BrowseEntry) => {
    try {
      const { data: content } = await api.get<string>(
        `/api/missions/file?path=${encodeURIComponent(entry.path)}`,
      )
      const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
      const parsed = typeof content === 'string' ? JSON.parse(content) : content
      handleImport(parsed, raw)
    } catch { /* skip */ }
  }

  // ============================================================================
  // Render
  // ============================================================================

  if (!isOpen) return null

  return (
    // Backdrop: dimmed full-viewport overlay. The mission browser sits at
    // z-modal which is above the navbar, so we explicitly position the modal
    // panel to start *below* the navbar (via top: MODAL_TOP_INSET_PX) rather
    // than centering it on the viewport — otherwise the navbar visually
    // overlaps the modal header (issue #9150).
    <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-xs">
    <div
      data-testid="mission-browser"
      className="fixed bg-background rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden"
      style={{
        top: `${MODAL_TOP_INSET_PX}px`,
        left: `${MODAL_SIDE_INSET_PX}px`,
        right: `${MODAL_SIDE_INSET_PX}px`,
        bottom: `${MODAL_SIDE_INSET_PX}px`,
      }}
    >
      {/* Top bar: search + filter toggle + view mode + close */}
      <MissionBrowserTopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeTab={activeTab}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        activeFilterCount={activeFilterCount}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onClose={onClose}
      />

      {/* Filter panel */}
      {showFilters && (
        <MissionBrowserFilterPanel
          activeFilterCount={activeFilterCount}
          onClearAllFilters={clearAllFilters}
          minMatchPercent={minMatchPercent}
          onMinMatchPercentChange={setMinMatchPercent}
          matchSourceFilter={matchSourceFilter}
          onMatchSourceFilterChange={setMatchSourceFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          missionClassFilter={missionClassFilter}
          onMissionClassFilterChange={setMissionClassFilter}
          maturityFilter={maturityFilter}
          onMaturityFilterChange={setMaturityFilter}
          difficultyFilter={difficultyFilter}
          onDifficultyFilterChange={setDifficultyFilter}
          cncfFilter={cncfFilter}
          onCncfFilterChange={setCncfFilter}
          selectedTags={selectedTags}
          onTagToggle={(tag) => {
            setSelectedTags((prev) => {
              const next = new Set(prev)
              if (next.has(tag)) next.delete(tag)
              else next.add(tag)
              return next
            })
          }}
          onClearTags={() => setSelectedTags(new Set())}
          facetCounts={facetCounts}
          recommendationsTotal={recommendations.length}
          filteredRecommendationsCount={filteredRecommendations.length}
        />
      )}

      {/* Tab bar */}
      <MissionBrowserTabBar
        activeTab={activeTab}
        onTabChange={(tab) => { setSelectedMission(null); setActiveTab(tab) }}
        installerCount={installerMissions.length}
        fixerCount={fixerMissions.length}
      />

      {/* Main content: sidebar + right panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — file tree (hidden on mobile, shown on md+) */}
        <MissionBrowserSidebar
          treeNodes={treeNodes}
          expandedNodes={expandedNodes}
          selectedPath={selectedPath}
          onToggleNode={toggleNode}
          onSelectNode={selectNode}
          isDragging={isDragging}
          onDragOver={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onFileSelect={handleFileSelect}
          watchedRepos={watchedRepos}
          onRemoveRepo={handleRemoveRepo}
          onRefreshNode={handleRefreshNode}
          watchedPaths={watchedPaths}
          onRemovePath={handleRemovePath}
          addingRepo={addingRepo}
          setAddingRepo={setAddingRepo}
          newRepoValue={newRepoValue}
          setNewRepoValue={setNewRepoValue}
          onAddRepo={handleAddRepo}
          addingPath={addingPath}
          setAddingPath={setAddingPath}
          newPathValue={newPathValue}
          setNewPathValue={setNewPathValue}
          onAddPath={handleAddPath}
          setTreeNodes={setTreeNodes}
          setExpandedNodes={setExpandedNodes}
        />

        {/* Right panel */}
        <div data-testid="mission-grid" className="flex-1 flex flex-col overflow-hidden relative bg-background">
          {/* Scan overlay */}
          <ScanProgressOverlay
            isScanning={isScanning}
            result={scanResult}
            onComplete={handleScanComplete}
            onDismiss={handleScanDismiss}
          />

          <div className="flex-1 overflow-y-auto p-4">
            {/* ================================================================ */}
            {/* MISSION DETAIL VIEW (renders above any tab when a mission is selected) */}
            {/* ================================================================ */}
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

            {/* ================================================================ */}
            {/* UNSTRUCTURED FILE PREVIEW (YAML/MD not parseable as a mission) */}
            {/* ================================================================ */}
            {!selectedMission && unstructuredContent && (() => {
              // Derive Kubara chart name from selectedPath (e.g. "kubara/cert-manager/Chart.yaml" → "cert-manager")
              const kubaraChartName = selectedPath?.startsWith('kubara/')
                ? selectedPath.split('/')[1]
                : undefined
              return (
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
                  kubaraChartName={kubaraChartName}
                  onUseInMissionControl={onUseInMissionControl}
                />
              )
            })()}

            {/* ================================================================ */}
            {/* RECOMMENDED TAB */}
            {/* ================================================================ */}
            {!selectedMission && !unstructuredContent && activeTab === 'recommended' && (
              <MissionBrowserRecommendedTab
                tokenError={tokenError}
                missionFetchError={missionFetchError}
                loadingRecommendations={loadingRecommendations}
                searchProgress={searchProgress}
                hasCluster={hasCluster}
                recommendations={recommendations}
                filteredRecommendations={filteredRecommendations}
                onSelectMission={selectCardMission}
                onImportMission={handleImport}
                onCopyLink={handleCopyLink}
                loading={loading}
                filteredEntries={filteredEntries}
                selectedPath={selectedPath}
                viewMode={viewMode}
                onImportDirectoryEntry={handleImportDirectoryEntry}
                onToggleNode={toggleNode}
                onSelectNode={selectNode}
              />
            )}

            {/* ================================================================ */}
            {/* INSTALLERS TAB */}
            {/* ================================================================ */}
            {!selectedMission && !unstructuredContent && activeTab === 'installers' && (
              <MissionBrowserInstallersTab
                installerMissions={installerMissions}
                filteredInstallers={filteredInstallers}
                loadingInstallers={loadingInstallers}
                missionFetchError={missionFetchError}
                installerSearch={installerSearch}
                onInstallerSearchChange={handleInstallerSearchChange}
                globalSearchActive={!!searchQuery}
                globalSearchQuery={searchQuery}
                installerCategoryFilter={installerCategoryFilter}
                onInstallerCategoryFilterChange={setInstallerCategoryFilter}
                installerMaturityFilter={installerMaturityFilter}
                onInstallerMaturityFilterChange={setInstallerMaturityFilter}
                viewMode={viewMode}
                onSelectMission={selectCardMission}
                onImportMission={handleImport}
                onCopyLink={handleCopyLink}
              />
            )}

            {/* ================================================================ */}
            {/* FIXES TAB */}
            {/* ================================================================ */}
            {!selectedMission && !unstructuredContent && activeTab === 'fixes' && (
              <MissionBrowserFixesTab
                fixerMissions={fixerMissions}
                filteredFixers={filteredFixers}
                loadingFixers={loadingFixers}
                missionFetchError={missionFetchError}
                fixerSearch={fixerSearch}
                onFixerSearchChange={handleFixerSearchChange}
                globalSearchActive={!!searchQuery}
                globalSearchQuery={searchQuery}
                fixerTypeFilter={fixerTypeFilter}
                onFixerTypeFilterChange={setFixerTypeFilter}
                viewMode={viewMode}
                onSelectMission={selectCardMission}
                onImportMission={handleImport}
                onCopyLink={handleCopyLink}
              />
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
