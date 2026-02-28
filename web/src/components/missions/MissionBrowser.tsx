/**
 * Mission Browser
 *
 * Full-screen file-explorer-style dialog for browsing and importing mission files.
 * Sources: KubeStellar Community repo, GitHub repos with kubestellar-missions, local files.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search,
  X,
  Folder,
  FolderOpen,
  FileJson,
  ChevronRight,
  ChevronDown,
  Upload,
  Download,
  Star,
  Filter,
  Grid3X3,
  List,
  Eye,
  Code,
  ArrowLeft,
  Sparkles,
  Github,
  HardDrive,
  Globe,
  Tag,
  CheckCircle,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { matchMissionsToCluster } from '../../lib/missions/matcher'
import {
  emitSolutionSearchStarted,
  emitSolutionSearchCompleted,
  emitSolutionBrowsed,
  emitSolutionViewed,
  emitSolutionImported,
  emitSolutionGitHubLink,
} from '../../lib/analytics'
import type {
  MissionExport,
  MissionMatch,
  BrowseEntry,
  FileScanResult,
} from '../../lib/missions/types'
import { validateMissionExport } from '../../lib/missions/types'
import { fullScan } from '../../lib/missions/scanner/index'
import { ScanProgressOverlay } from './ScanProgressOverlay'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { InstallerCard } from './InstallerCard'
import { SolutionCard } from './SolutionCard'
import { useTranslation } from 'react-i18next'

// ============================================================================
// Types
// ============================================================================

interface MissionBrowserProps {
  isOpen: boolean
  onClose: () => void
  onImport: (mission: MissionExport) => void
}

interface TreeNode {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  source: 'community' | 'github' | 'local'
  children?: TreeNode[]
  loaded?: boolean
  loading?: boolean
  description?: string
}

type ViewMode = 'grid' | 'list'
type BrowserTab = 'recommended' | 'installers' | 'solutions'

const BROWSER_TABS: { id: BrowserTab; label: string; icon: string }[] = [
  { id: 'recommended', label: 'Recommended', icon: '🔍' },
  { id: 'installers', label: 'Installers', icon: '📦' },
  { id: 'solutions', label: 'Solutions', icon: '🛠️' },
]

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

export function MissionBrowser({ isOpen, onClose, onImport }: MissionBrowserProps) {
  useTranslation(['common', 'cards'])
  const { user, isAuthenticated } = useAuth()

  // Navigation state
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('All')
  const [cncfFilter, setCncfFilter] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showFilters, setShowFilters] = useState(false)

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

  // Recommendations
  const [recommendations, setRecommendations] = useState<MissionMatch[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [searchProgress, setSearchProgress] = useState<{ step: string; detail: string; found: number; scanned: number }>({ step: '', detail: '', found: 0, scanned: 0 })
  const [tokenError, setTokenError] = useState<'rate_limited' | 'token_invalid' | null>(null)
  const [hasCluster, setHasCluster] = useState(false)

  // Scan state
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<FileScanResult | null>(null)
  const [pendingImport, setPendingImport] = useState<MissionExport | null>(null)

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

  // Installer & Solution missions (fetched from KB)
  const [installerMissions, setInstallerMissions] = useState<MissionExport[]>([])
  const [solutionMissions, setSolutionMissions] = useState<MissionExport[]>([])
  const [loadingInstallers, setLoadingInstallers] = useState(false)
  const [loadingSolutions, setLoadingSolutions] = useState(false)
  const [installerCategoryFilter, setInstallerCategoryFilter] = useState<string>('All')
  const [installerMaturityFilter, setInstallerMaturityFilter] = useState<string>('All')
  const [solutionTypeFilter, setSolutionTypeFilter] = useState<string>('All')
  const [installerSearch, setInstallerSearch] = useState('')
  const [solutionSearch, setSolutionSearch] = useState('')

  // ============================================================================
  // Initialize tree when dialog opens
  // ============================================================================

  useEffect(() => {
    if (!isOpen) return

    const rootNodes: TreeNode[] = [
      {
        id: 'community',
        name: 'KubeStellar Community',
        path: 'solutions',
        type: 'directory',
        source: 'community',
        loaded: false,
        description: 'console-kb',
      },
    ]

    if (isAuthenticated && user) {
      rootNodes.push({
        id: 'github',
        name: 'My Repositories',
        path: '',
        type: 'directory',
        source: 'github',
        loaded: true,
        description: user.github_login,
        children: watchedRepos.map((repo) => ({
          id: `github/${repo}`,
          name: repo.split('/').pop() || repo,
          path: repo,
          type: 'directory' as const,
          source: 'github' as const,
          loaded: false,
          description: repo,
        })),
      })
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
        description: p,
      })),
      description: 'Drop files or add paths',
    })

    setTreeNodes(rootNodes)
    setSelectedPath(null)
    setSelectedMission(null)
    setDirectoryEntries([])
    setSearchQuery('')
    setCategoryFilter('All')
    setCncfFilter('')
    setShowRaw(false)
    setRawContent(null)
    setScanResult(null)
    setPendingImport(null)
    setIsScanning(false)
    setActiveTab('recommended')
    setInstallerMissions([])
    setSolutionMissions([])
  }, [isOpen, isAuthenticated, user, watchedRepos, watchedPaths])

  // ============================================================================
  // Fetch recommendations
  // ============================================================================

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    async function fetchRecommendations() {
      setLoadingRecommendations(true)
      setRecommendations([])
      setTokenError(null)
      setSearchProgress({ step: 'Connecting', detail: 'Fetching cluster info…', found: 0, scanned: 0 })

      try {
        // Step 1: Get cluster info + browse top-level in parallel
        const [clusterWrap, topLevel] = await Promise.all([
          api.get<{ name: string; provider?: string; version?: string; resources?: string[]; issues?: string[]; labels?: Record<string, string> }>('/api/cluster/current').catch(() => null),
          api.get<BrowseEntry[]>('/api/missions/browse?path=solutions').catch((err) => {
            const code = err?.response?.data?.code
            if (code === 'rate_limited' || code === 'token_invalid') {
              setTokenError(code)
            }
            return { data: [] as BrowseEntry[] }
          }),
        ])
        if (cancelled) return
        const cluster = clusterWrap?.data ?? null
        setHasCluster(!!cluster)
        emitSolutionSearchStarted(!!cluster)
        const topDirs = (topLevel?.data ?? []).filter(e => e.type === 'directory')

        if (topDirs.length === 0) {
          setSearchProgress({ step: 'Done', detail: 'No mission categories found', found: 0, scanned: 0 })
          return
        }

        setSearchProgress({ step: 'Scanning', detail: `Found ${topDirs.length} categories`, found: 0, scanned: 0 })

        // Step 2: Walk categories progressively — show recommendations as they arrive
        const allMissions: MissionExport[] = []
        let totalScanned = 0

        for (const category of topDirs) {
          if (cancelled) return
          setSearchProgress({ step: 'Scanning', detail: category.name, found: allMissions.length, scanned: totalScanned })

          try {
            const { data: catEntries } = await api.get<BrowseEntry[]>(
              `/api/missions/browse?path=${encodeURIComponent(category.path)}`
            )
            if (cancelled) return
            const catFiles = (catEntries ?? []).filter(e => e.type === 'file' && e.name.endsWith('.json'))
            const subDirs = (catEntries ?? []).filter(e => e.type === 'directory')

            // Fetch a few sample files from this category
            for (const f of catFiles.slice(0, 3)) {
              if (cancelled) return
              try {
                const { data: content } = await api.get<string>(
                  `/api/missions/file?path=${encodeURIComponent(f.path)}`
                )
                const parsed = typeof content === 'string' ? JSON.parse(content) : content
                const normalized = normalizeMission(parsed)
                if (normalized) {
                  allMissions.push(normalized)
                  setRecommendations(matchMissionsToCluster(allMissions, cluster).slice(0, 6))
                }
              } catch { /* skip */ }
            }
            totalScanned++
            setSearchProgress({ step: 'Scanning', detail: category.name, found: allMissions.length, scanned: totalScanned })

            // Walk subdirectories (e.g. cncf-generated/kubernetes/)
            for (const sub of subDirs) {
              if (cancelled) return
              totalScanned++
              setSearchProgress({ step: 'Scanning', detail: `${category.name}/${sub.name}`, found: allMissions.length, scanned: totalScanned })
              try {
                const { data: subFiles } = await api.get<BrowseEntry[]>(
                  `/api/missions/browse?path=${encodeURIComponent(sub.path)}`
                )
                if (cancelled) return
                const jsonFiles = (subFiles ?? []).filter(e => e.type === 'file' && e.name.endsWith('.json'))
                for (const f of jsonFiles.slice(0, 2)) {
                  if (cancelled) return
                  try {
                    const { data: content } = await api.get<string>(
                      `/api/missions/file?path=${encodeURIComponent(f.path)}`
                    )
                    const parsed = typeof content === 'string' ? JSON.parse(content) : content
                    const normalized = normalizeMission(parsed)
                    if (normalized) {
                      allMissions.push(normalized)
                      setRecommendations(matchMissionsToCluster(allMissions, cluster).slice(0, 6))
                    }
                  } catch { /* skip */ }
                }
              } catch { /* skip */ }
            }
          } catch { /* skip inaccessible categories */ }
        }

        if (cancelled) return
        setSearchProgress({ step: 'Done', detail: `${allMissions.length} missions across ${totalScanned} folders`, found: allMissions.length, scanned: totalScanned })
        emitSolutionSearchCompleted(allMissions.length, totalScanned)
      } catch {
        setSearchProgress(prev => ({ ...prev, step: 'Error', detail: 'Could not load recommendations' }))
      } finally {
        if (!cancelled) setLoadingRecommendations(false)
      }
    }

    fetchRecommendations()
    return () => { cancelled = true }
  }, [isOpen])

  // ============================================================================
  // Fetch installer missions (cncf-install directory)
  // ============================================================================

  useEffect(() => {
    if (!isOpen || activeTab !== 'installers' || installerMissions.length > 0) return
    let cancelled = false

    async function fetchInstallers() {
      setLoadingInstallers(true)
      try {
        const { data: entries } = await api.get<BrowseEntry[]>(
          '/api/missions/browse?path=solutions/cncf-install'
        )
        const jsonFiles = entries.filter(e => e.type === 'file' && e.name.endsWith('.json'))
        const missions: MissionExport[] = []

        for (const f of jsonFiles) {
          try {
            const { data: content } = await api.get<string>(
              `/api/missions/file?path=${encodeURIComponent(f.path)}`
            )
            const parsed = typeof content === 'string' ? JSON.parse(content) : content
            const normalized = normalizeMission(parsed)
            if (normalized) {
              missions.push(normalized)
              if (!cancelled) setInstallerMissions([...missions])
            }
          } catch { /* skip */ }
        }
        if (!cancelled) setInstallerMissions(missions)
      } catch { /* skip */ }
      finally { if (!cancelled) setLoadingInstallers(false) }
    }

    fetchInstallers()
    return () => { cancelled = true }
  }, [isOpen, activeTab, installerMissions.length])

  // ============================================================================
  // Fetch solution missions (non-installer solutions)
  // ============================================================================

  useEffect(() => {
    if (!isOpen || activeTab !== 'solutions' || solutionMissions.length > 0) return
    let cancelled = false

    async function fetchSolutions() {
      setLoadingSolutions(true)
      try {
        const { data: topEntries } = await api.get<BrowseEntry[]>(
          '/api/missions/browse?path=solutions'
        )
        const dirs = topEntries.filter(e => e.type === 'directory' && e.name !== 'cncf-install')
        const missions: MissionExport[] = []

        for (const dir of dirs) {
          try {
            const { data: files } = await api.get<BrowseEntry[]>(
              `/api/missions/browse?path=${encodeURIComponent(dir.path)}`
            )
            for (const f of files) {
              if (f.type !== 'file' || !f.name.endsWith('.json')) continue
              try {
                const { data: content } = await api.get<string>(
                  `/api/missions/file?path=${encodeURIComponent(f.path)}`
                )
                const parsed = typeof content === 'string' ? JSON.parse(content) : content
                const normalized = normalizeMission(parsed)
                if (normalized && normalized.missionClass !== 'install') {
                  missions.push(normalized)
                  if (!cancelled) setSolutionMissions([...missions])
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
        if (!cancelled) setSolutionMissions(missions)
      } catch { /* skip */ }
      finally { if (!cancelled) setLoadingSolutions(false) }
    }

    fetchSolutions()
    return () => { cancelled = true }
  }, [isOpen, activeTab, solutionMissions.length])

  // ============================================================================
  // Filtered installer & solution lists
  // ============================================================================

  const filteredInstallers = useMemo(() => {
    let list = installerMissions
    if (installerCategoryFilter !== 'All') {
      list = list.filter(m => m.category === installerCategoryFilter)
    }
    if (installerMaturityFilter !== 'All') {
      list = list.filter(m => m.tags?.includes(installerMaturityFilter))
    }
    if (installerSearch) {
      const q = installerSearch.toLowerCase()
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags?.some(t => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [installerMissions, installerCategoryFilter, installerMaturityFilter, installerSearch])

  const filteredSolutions = useMemo(() => {
    let list = solutionMissions
    if (solutionTypeFilter !== 'All') {
      list = list.filter(m => m.type === solutionTypeFilter.toLowerCase())
    }
    if (solutionSearch) {
      const q = solutionSearch.toLowerCase()
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags?.some(t => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [solutionMissions, solutionTypeFilter, solutionSearch])

  // ============================================================================
  // Tree expansion & lazy loading
  // ============================================================================

  const toggleNode = useCallback(async (node: TreeNode) => {
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
          children = entries.map((e) => ({
            id: `${nodeId}/${e.name}`,
            name: e.name,
            path: e.path,
            type: e.type,
            source: 'community' as const,
            loaded: e.type === 'file',
            description: e.description,
          }))
        } else if (node.source === 'github') {
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
            description: r.full_name,
          }))
        }

        setTreeNodes((prev) =>
          updateNodeInTree(prev, nodeId, { children, loaded: true, loading: false })
        )
      } catch {
        setTreeNodes((prev) =>
          updateNodeInTree(prev, nodeId, { children: [], loaded: true, loading: false })
        )
      }
    }
  }, [expandedNodes])

  // ============================================================================
  // Select a node (directory → show listing, file → show preview)
  // ============================================================================

  const selectNode = useCallback(async (node: TreeNode) => {
    setSelectedPath(node.id)
    setSelectedMission(null)
    setRawContent(null)
    setShowRaw(false)

    if (node.type === 'directory') {
      emitSolutionBrowsed(node.path)
      setLoading(true)
      try {
        if (node.source === 'community') {
          const { data: entries } = await api.get<BrowseEntry[]>(
            `/api/missions/browse?path=${encodeURIComponent(node.path)}`
          )
          setDirectoryEntries(entries.filter(e => e.type === 'directory' || e.name.endsWith('.json')))
        } else if (node.source === 'github') {
          const { data: entries } = await api.get<BrowseEntry[]>(
            `/api/github/missions?repo=${encodeURIComponent(node.path)}`
          )
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
          const { data } = await api.get<string>(
            `/api/github/missions/file?path=${encodeURIComponent(node.path)}`
          )
          content = data
        } else {
          return
        }

        const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
        setRawContent(raw)

        const parsed = typeof content === 'string' ? JSON.parse(content) : content
        const validation = validateMissionExport(parsed)
        if (validation.valid) {
          setSelectedMission(validation.data)
          emitSolutionViewed(validation.data.title, validation.data.cncfProject)
        } else {
          setSelectedMission(parsed as MissionExport)
          emitSolutionViewed((parsed as MissionExport).title ?? node.name, (parsed as MissionExport).cncfProject)
        }
      } catch {
        setRawContent(null)
        setSelectedMission(null)
      } finally {
        setLoading(false)
      }
    }
  }, [])

  // ============================================================================
  // Import flow
  // ============================================================================

  const handleImport = useCallback((mission: MissionExport, raw?: string) => {
    setPendingImport(mission)
    setIsScanning(true)

    const content = raw || JSON.stringify(mission, null, 2)
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      parsed = mission
    }

    const validation = validateMissionExport(parsed)
    if (!validation.valid) {
      setScanResult({
        valid: false,
        findings: validation.errors.map((e) => ({
          severity: 'error' as const,
          code: 'SCHEMA_VALIDATION',
          message: e.message,
          path: e.path ?? '',
        })),
        metadata: null,
      })
      return
    }

    const result = fullScan(validation.data)
    setScanResult(result)
  }, [])

  const handleScanComplete = useCallback((result: FileScanResult) => {
    if (result.valid && pendingImport) {
      emitSolutionImported(pendingImport.title, pendingImport.cncfProject)
      onImport(pendingImport)
      onClose()
    }
    setIsScanning(false)
  }, [pendingImport, onImport, onClose])

  const handleScanDismiss = useCallback(() => {
    setIsScanning(false)
    setScanResult(null)
    setPendingImport(null)
  }, [])

  // ============================================================================
  // Local file handling
  // ============================================================================

  const processLocalFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      try {
        const parsed = JSON.parse(content)
        const validation = validateMissionExport(parsed)

        const localNode: TreeNode = {
          id: `local/${file.name}`,
          name: file.name,
          path: file.name,
          type: 'file',
          source: 'local',
          loaded: true,
        }

        setTreeNodes((prev) =>
          prev.map((n) =>
            n.id === 'local'
              ? { ...n, children: [...(n.children || []), localNode] }
              : n
          )
        )
        setExpandedNodes((prev) => new Set(prev).add('local'))

        setRawContent(content)
        setSelectedMission(validation.valid ? validation.data : (parsed as MissionExport))
        setSelectedPath(`local/${file.name}`)
        setDirectoryEntries([])
      } catch {
        setRawContent(content)
        setSelectedMission(null)
        setSelectedPath(`local/${file.name}`)
      }
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith('.json') || f.type === 'application/json'
    )
    if (files.length > 0) {
      processLocalFile(files[0])
    }
  }, [processLocalFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processLocalFile(file)
    e.target.value = ''
  }, [processLocalFile])

  // ============================================================================
  // Filtered directory entries
  // ============================================================================

  const filteredEntries = useMemo(() => {
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
  }, [directoryEntries, searchQuery])

  // ============================================================================
  // Filtered recommendations
  // ============================================================================

  const filteredRecommendations = useMemo(() => {
    let recs = recommendations

    if (categoryFilter !== 'All') {
      recs = recs.filter(
        (r) => r.mission.type.toLowerCase() === categoryFilter.toLowerCase()
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
          r.mission.title.toLowerCase().includes(q) ||
          r.mission.description.toLowerCase().includes(q) ||
          r.mission.tags.some((tag) => tag.toLowerCase().includes(q))
      )
    }

    return recs
  }, [recommendations, categoryFilter, cncfFilter, searchQuery])

  // ============================================================================
  // Keyboard
  // ============================================================================

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
    <div className="fixed inset-0 bg-background z-[9999] flex flex-col">
      {/* ================================================================== */}
      {/* Top bar: search + filters */}
      {/* ================================================================== */}
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search missions by name, tag, or description…"
            className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            autoFocus
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'p-2 rounded-lg transition-colors',
            showFilters
              ? 'bg-purple-500/20 text-purple-400'
              : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
          )}
          title="Toggle filters"
        >
          <Filter className="w-5 h-5" />
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
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-3 px-4 py-2 bg-card border-b border-border">
          <span className="text-xs text-muted-foreground font-medium">Category:</span>
          <div className="flex items-center gap-1">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-full transition-colors',
                  categoryFilter === cat
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-border" />

          <span className="text-xs text-muted-foreground font-medium">CNCF Project:</span>
          <input
            type="text"
            value={cncfFilter}
            onChange={(e) => setCncfFilter(e.target.value)}
            placeholder="e.g. Istio, Envoy…"
            className="w-40 px-2.5 py-1 text-xs bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
          />
        </div>
      )}

      {/* ================================================================== */}
      {/* Tab bar */}
      {/* ================================================================== */}
      <div className="flex items-center gap-1 px-4 py-1.5 bg-card border-b border-border">
        {BROWSER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
              activeTab === tab.id
                ? 'bg-purple-500/20 text-purple-400 font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.id === 'installers' && installerMissions.length > 0 && (
              <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full">{installerMissions.length}</span>
            )}
            {tab.id === 'solutions' && solutionMissions.length > 0 && (
              <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full">{solutionMissions.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* Main content: sidebar + panel */}
      {/* ================================================================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — file tree */}
        <div
          className="flex flex-col border-r border-border bg-card overflow-y-auto"
          style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }}
        >
          <div className="p-3 space-y-1">
            {treeNodes.map((node) => (
              <div key={node.id}>
                <div className="flex items-center">
                  <div className="flex-1 min-w-0">
                    <TreeNodeItem
                      node={node}
                      depth={0}
                      expandedNodes={expandedNodes}
                      selectedPath={selectedPath}
                      onToggle={toggleNode}
                      onSelect={selectNode}
                    />
                  </div>
                  {/* Add button for repos and local */}
                  {node.id === 'github' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddingRepo(!addingRepo) }}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      title="Add repository to watch"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {node.id === 'local' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddingPath(!addingPath) }}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      title="Add file path to watch"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
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
                      }
                      setNewRepoValue('')
                      setAddingRepo(false)
                    }} className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newRepoValue}
                        onChange={(e) => setNewRepoValue(e.target.value)}
                        placeholder="owner/repo"
                        className="flex-1 px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Escape') { setAddingRepo(false); setNewRepoValue('') } }}
                      />
                      <button type="submit" className="p-1 text-xs text-green-400 hover:text-green-300"><CheckCircle className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => { setAddingRepo(false); setNewRepoValue('') }} className="p-1 text-xs text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
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
                      <button type="submit" className="p-1 text-xs text-green-400 hover:text-green-300"><CheckCircle className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => { setAddingPath(false); setNewPathValue('') }} className="p-1 text-xs text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                    </form>
                  </div>
                )}

                {/* Remove buttons for watched children */}
                {node.id === 'github' && expandedNodes.has('github') && node.children?.map((child) => (
                  watchedRepos.includes(child.path) ? (
                    <div key={`remove-${child.id}`} className="flex items-center ml-6">
                      <div className="flex-1 min-w-0">
                        <TreeNodeItem
                          node={child}
                          depth={1}
                          expandedNodes={expandedNodes}
                          selectedPath={selectedPath}
                          onToggle={toggleNode}
                          onSelect={selectNode}
                        />
                      </div>
                      <button
                        onClick={() => {
                          const updated = watchedRepos.filter(r => r !== child.path)
                          setWatchedRepos(updated)
                          saveWatchedRepos(updated)
                        }}
                        className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                        title="Remove from watched"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : null
                ))}
                {node.id === 'local' && expandedNodes.has('local') && node.children?.map((child) => (
                  watchedPaths.includes(child.path) ? (
                    <div key={`remove-${child.id}`} className="flex items-center ml-6">
                      <div className="flex-1 min-w-0">
                        <TreeNodeItem
                          node={child}
                          depth={1}
                          expandedNodes={expandedNodes}
                          selectedPath={selectedPath}
                          onToggle={toggleNode}
                          onSelect={selectNode}
                        />
                      </div>
                      <button
                        onClick={() => {
                          const updated = watchedPaths.filter(p => p !== child.path)
                          setWatchedPaths(updated)
                          saveWatchedPaths(updated)
                        }}
                        className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                        title="Remove from watched"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : null
                ))}
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
                Drop JSON file or click to browse
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
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
            {/* RECOMMENDED TAB (existing content) */}
            {/* ============================================================ */}
            {activeTab === 'recommended' && (<>
            {/* Token / rate-limit guidance banner */}
            {tokenError && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-amber-400 text-lg mt-0.5">⚠️</span>
                  <div className="text-sm space-y-2">
                    <p className="font-medium text-amber-300">
                      {tokenError === 'rate_limited'
                        ? 'GitHub API rate limit reached'
                        : 'GitHub token is invalid or expired'}
                    </p>
                    <p className="text-muted-foreground">
                      The solution browser needs a GitHub personal access token to fetch missions.
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
                      <li>Restart the console</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {/* Recommended for You */}
            {!selectedMission && (recommendations.length > 0 || loadingRecommendations) && (
              <CollapsibleSection
                title={hasCluster ? 'Recommended for Your Cluster' : 'Explore CNCF Solutions'}
                defaultOpen={true}
                badge={
                  <span className="flex items-center gap-1 text-xs text-purple-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    {filteredRecommendations.length}
                  </span>
                }
                className="mb-6"
              >
                {/* Context subtitle */}
                {!loadingRecommendations && (
                  <p className="text-xs text-muted-foreground mb-3 -mt-1">
                    {hasCluster
                      ? '🎯 Matched based on your cluster resources, labels, and detected issues'
                      : '🌐 Showing popular CNCF community solutions — connect a cluster for personalized recommendations'}
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
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredRecommendations.map((match, i) => (
                          <RecommendationCard
                            key={i}
                            match={match}
                            onSelect={() => {
                              setSelectedMission(match.mission)
                              setRawContent(JSON.stringify(match.mission, null, 2))
                              setShowRaw(false)
                            }}
                            onImport={() => handleImport(match.mission)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredRecommendations.map((match, i) => (
                      <RecommendationCard
                        key={i}
                        match={match}
                        onSelect={() => {
                          setSelectedMission(match.mission)
                          setRawContent(JSON.stringify(match.mission, null, 2))
                          setShowRaw(false)
                        }}
                        onImport={() => handleImport(match.mission)}
                      />
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Browse on GitHub link */}
            {!selectedMission && !loading && (
              <div className="flex items-center gap-2 mb-4 px-1">
                <a
                  href="https://github.com/kubestellar/console-kb/tree/master/solutions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-purple-400 transition-colors"
                  onClick={() => emitSolutionGitHubLink()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Browse all solutions on GitHub
                </a>
                {searchProgress.step === 'Done' && searchProgress.found > 0 && (
                  <span className="text-xs text-muted-foreground/60 ml-auto">
                    {searchProgress.detail}
                  </span>
                )}
              </div>
            )}

            {/* Directory listing or Mission preview */}
            {selectedMission ? (
              <MissionPreview
                mission={selectedMission}
                rawContent={rawContent}
                showRaw={showRaw}
                onToggleRaw={() => setShowRaw(!showRaw)}
                onImport={() => handleImport(selectedMission, rawContent ?? undefined)}
                onBack={() => {
                  setSelectedMission(null)
                  setRawContent(null)
                  setShowRaw(false)
                }}
                matchScore={recommendations.find(
                  (r) => r.mission.title === selectedMission.title
                )?.score}
              />
            ) : loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              </div>
            ) : filteredEntries.length > 0 ? (
              <DirectoryListing
                entries={filteredEntries}
                viewMode={viewMode}
                onSelect={(entry) => {
                  const node: TreeNode = {
                    id: entry.path,
                    name: entry.name,
                    path: entry.path,
                    type: entry.type,
                    source: 'community',
                    loaded: entry.type === 'file',
                  }
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
            {activeTab === 'installers' && (
              <div className="space-y-4">
                {/* Installer filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 relative min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={installerSearch}
                      onChange={(e) => setInstallerSearch(e.target.value)}
                      placeholder="Search installers…"
                      className="w-full pl-10 pr-4 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                    />
                  </div>
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

                {/* Installer grid */}
                {loadingInstallers ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    Loading CNCF installers…
                  </div>
                ) : filteredInstallers.length === 0 ? (
                  <EmptyState message={installerMissions.length > 0 ? 'No installers match your filters' : 'No installer missions found'} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredInstallers.map((mission, i) => (
                      <InstallerCard
                        key={i}
                        mission={mission}
                        onSelect={() => {
                          setSelectedMission(mission)
                          setRawContent(JSON.stringify(mission, null, 2))
                          setShowRaw(false)
                          setActiveTab('recommended')
                        }}
                        onImport={() => handleImport(mission)}
                      />
                    ))}
                  </div>
                )}

                {/* Count footer */}
                {!loadingInstallers && filteredInstallers.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Showing {filteredInstallers.length} of {installerMissions.length} installer missions
                  </p>
                )}
              </div>
            )}

            {/* ============================================================ */}
            {/* SOLUTIONS TAB */}
            {/* ============================================================ */}
            {activeTab === 'solutions' && (
              <div className="space-y-4">
                {/* Solution filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 relative min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={solutionSearch}
                      onChange={(e) => setSolutionSearch(e.target.value)}
                      placeholder="Search solutions…"
                      className="w-full pl-10 pr-4 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                    />
                  </div>
                  <select
                    value={solutionTypeFilter}
                    onChange={(e) => setSolutionTypeFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground"
                  >
                    {CATEGORY_FILTERS.map(cat => (
                      <option key={cat} value={cat}>{cat === 'All' ? 'All Types' : cat}</option>
                    ))}
                  </select>
                </div>

                {/* Solution grid */}
                {loadingSolutions ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    Loading solutions…
                  </div>
                ) : filteredSolutions.length === 0 ? (
                  <EmptyState message={solutionMissions.length > 0 ? 'No solutions match your filters' : 'No solution missions found'} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredSolutions.map((mission, i) => (
                      <SolutionCard
                        key={i}
                        mission={mission}
                        onSelect={() => {
                          setSelectedMission(mission)
                          setRawContent(JSON.stringify(mission, null, 2))
                          setShowRaw(false)
                          setActiveTab('recommended')
                        }}
                        onImport={() => handleImport(mission)}
                      />
                    ))}
                  </div>
                )}

                {/* Count footer */}
                {!loadingSolutions && filteredSolutions.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Showing {filteredSolutions.length} of {solutionMissions.length} solution missions
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Tree Node Item
// ============================================================================

function TreeNodeItem({
  node,
  depth,
  expandedNodes,
  selectedPath,
  onToggle,
  onSelect,
}: {
  node: TreeNode
  depth: number
  expandedNodes: Set<string>
  selectedPath: string | null
  onToggle: (node: TreeNode) => void
  onSelect: (node: TreeNode) => void
}) {
  const isExpanded = expandedNodes.has(node.id)
  const isSelected = selectedPath === node.id
  const isDir = node.type === 'directory'

  const sourceIcon = () => {
    switch (node.source) {
      case 'community':
        return <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
      case 'github':
        return <Github className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      case 'local':
        return <HardDrive className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
    }
  }

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) onToggle(node)
          onSelect(node)
        }}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
          isSelected
            ? 'bg-purple-500/15 text-purple-400'
            : 'text-foreground hover:bg-secondary/50'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          <>
            {node.loading ? (
              <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />
            ) : isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 flex-shrink-0" />
            <FileJson className="w-4 h-4 text-blue-400 flex-shrink-0" />
          </>
        )}
        <span className="truncate flex-1">{node.name}</span>
        {depth === 0 && sourceIcon()}
      </button>

      {isDir && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
          {node.children.length === 0 && node.loaded && (
            <div
              className="text-xs text-muted-foreground italic py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Directory Listing
// ============================================================================

function DirectoryListing({
  entries,
  viewMode,
  onSelect,
  onImport,
}: {
  entries: BrowseEntry[]
  viewMode: ViewMode
  onSelect: (entry: BrowseEntry) => void
  onImport?: (entry: BrowseEntry) => void
}) {
  if (viewMode === 'list') {
    return (
      <div className="space-y-1">
        {entries.map((entry) => (
          <div
            key={entry.path}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors group"
          >
            <button
              onClick={() => onSelect(entry)}
              className="flex items-center gap-3 min-w-0 flex-1 text-left"
            >
              {entry.type === 'directory' ? (
                <Folder className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              ) : (
                <FileJson className="w-5 h-5 text-blue-400 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{entry.name}</p>
                {entry.description && (
                  <p className="text-xs text-muted-foreground truncate">{entry.description}</p>
                )}
              </div>
            </button>
            {entry.type === 'file' && entry.name.endsWith('.json') && onImport && (
              <button
                onClick={(e) => { e.stopPropagation(); onImport(entry) }}
                className="opacity-0 group-hover:opacity-100 px-2.5 py-1 text-[11px] font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-all flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Import
              </button>
            )}
            {entry.size != null && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatBytes(entry.size)}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {entries.map((entry) => (
        <div
          key={entry.path}
          className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-card hover:bg-secondary/50 hover:border-purple-500/30 transition-colors text-center group relative"
        >
          <button
            onClick={() => onSelect(entry)}
            className="flex flex-col items-center gap-2 w-full"
          >
            {entry.type === 'directory' ? (
              <Folder className="w-10 h-10 text-yellow-400 group-hover:text-yellow-300" />
            ) : (
              <FileJson className="w-10 h-10 text-blue-400 group-hover:text-blue-300" />
            )}
            <p className="text-sm font-medium text-foreground truncate w-full">{entry.name}</p>
            {entry.description && (
              <p className="text-xs text-muted-foreground truncate w-full">{entry.description}</p>
            )}
          </button>
          {entry.type === 'file' && entry.name.endsWith('.json') && onImport && (
            <button
              onClick={(e) => { e.stopPropagation(); onImport(entry) }}
              className="mt-1 px-3 py-1 text-[11px] font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              Import to My Missions
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Mission Preview
// ============================================================================

function MissionPreview({
  mission,
  rawContent,
  showRaw,
  onToggleRaw,
  onImport,
  onBack,
  matchScore,
}: {
  mission: MissionExport
  rawContent: string | null
  showRaw: boolean
  onToggleRaw: () => void
  onImport: () => void
  onBack: () => void
  matchScore?: number
}) {
  const typeColors: Record<string, string> = {
    troubleshoot: 'bg-red-500/10 text-red-400 border-red-500/20',
    deploy: 'bg-green-500/10 text-green-400 border-green-500/20',
    upgrade: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    analyze: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    repair: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    custom: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to listing
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-foreground">{mission.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{mission.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {matchScore != null && matchScore > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Star className="w-3 h-3" />
              {matchScore}% match
            </span>
          )}
          <button
            onClick={onToggleRaw}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors',
              showRaw
                ? 'bg-secondary border-border text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {showRaw ? <Eye className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
            {showRaw ? 'Preview' : 'View Raw'}
          </button>
          <button
            onClick={onImport}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            Import
          </button>
        </div>
      </div>

      {/* Raw view */}
      {showRaw && rawContent ? (
        <pre className="p-4 rounded-lg bg-secondary border border-border text-xs text-foreground font-mono overflow-x-auto max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
          {rawContent}
        </pre>
      ) : (
        <>
          {/* Badges */}
          <div className="flex items-center flex-wrap gap-2">
            <span
              className={cn(
                'px-2.5 py-1 text-xs rounded-full border',
                typeColors[mission.type] || typeColors.custom
              )}
            >
              {mission.type}
            </span>
            {mission.category && (
              <span className="px-2.5 py-1 text-xs rounded-full bg-secondary text-muted-foreground border border-border">
                {mission.category}
              </span>
            )}
            {mission.cncfProject && (
              <span className="px-2.5 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {mission.cncfProject}
              </span>
            )}
            {mission.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>

          {/* Prerequisites */}
          {mission.prerequisites && mission.prerequisites.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Prerequisites</h3>
              <ul className="space-y-1">
                {mission.prerequisites.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Steps */}
          {mission.steps.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">
                Steps ({mission.steps.length})
              </h3>
              <div className="space-y-3">
                {mission.steps.map((step, i) => (
                  <div
                    key={i}
                    className="flex gap-3 p-3 rounded-lg bg-secondary/50 border border-border"
                  >
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{step.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                      {step.command && (
                        <code className="block mt-2 p-2 rounded bg-background text-xs text-foreground font-mono border border-border">
                          {step.command}
                        </code>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolution */}
          {mission.resolution && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Resolution</h3>
              {mission.resolution.summary && (
                <p className="text-sm text-muted-foreground mb-2">{mission.resolution.summary}</p>
              )}
              {mission.resolution.steps && mission.resolution.steps.length > 0 && (
                <ul className="space-y-1 ml-2">
                  {mission.resolution.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-muted-foreground/50">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              {mission.resolution.yaml && (
                <pre className="mt-2 p-3 rounded-lg bg-secondary border border-border text-xs text-foreground font-mono overflow-x-auto whitespace-pre-wrap">
                  {mission.resolution.yaml}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// Recommendation Card
// ============================================================================

function RecommendationCard({
  match,
  onSelect,
  onImport,
}: {
  match: MissionMatch
  onSelect: () => void
  onImport: () => void
}) {
  const { mission, score, matchReasons } = match
  const isClusterMatch = score > 1

  return (
    <div
      className="flex flex-col p-3 rounded-lg border border-border bg-card hover:border-purple-500/30 transition-colors cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-purple-400 transition-colors">
          {mission.title}
        </h4>
        {isClusterMatch && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full bg-green-500/10 text-green-400 flex-shrink-0" title="Matched to your cluster">
            <CheckCircle className="w-3 h-3" />
            Match
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{mission.description}</p>

      {matchReasons.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {matchReasons.slice(0, 2).map((reason, i) => (
            <span key={i} className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
              isClusterMatch
                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            )}>
              {isClusterMatch ? '✓' : '💡'} {reason}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-secondary text-muted-foreground">
            {mission.type}
          </span>
          {mission.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-secondary text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onImport()
          }}
          className="px-2 py-1 text-[10px] font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
        >
          Import
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Folder className="w-12 h-12 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function updateNodeInTree(
  nodes: TreeNode[],
  nodeId: string,
  updates: Partial<TreeNode>
): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, ...updates }
    }
    if (node.children) {
      return { ...node, children: updateNodeInTree(node.children, nodeId, updates) }
    }
    return node
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Normalize kc-mission-v1 JSON (nested format) into flat MissionExport shape */
function normalizeMission(raw: Record<string, unknown>): MissionExport | null {
  // Already flat MissionExport
  if (raw.title && raw.type && raw.tags) return raw as unknown as MissionExport

  // kc-mission-v1 nested format: { format, mission: { title, type, ... }, metadata: { tags, ... } }
  const m = raw.mission as Record<string, unknown> | undefined
  if (!m) return null

  const meta = raw.metadata as Record<string, unknown> | undefined
  const tags = (meta?.tags as string[]) ?? []
  const cncfProjects = (meta?.cncfProjects as string[]) ?? []

  // Derive CNCF category from tags if not set explicitly
  const knownCategories = ['observability', 'orchestration', 'runtime', 'provisioning', 'security',
    'service mesh', 'app definition', 'serverless', 'storage', 'streaming', 'networking']
  const categoryFromTags = tags.find(t => knownCategories.includes(t.toLowerCase()))
  const category = (meta?.category as string)
    ?? (categoryFromTags ? categoryFromTags.charAt(0).toUpperCase() + categoryFromTags.slice(1) : undefined)

  const resolution = m.resolution as Record<string, unknown> | undefined

  return {
    version: (raw.format as string) ?? 'kc-mission-v1',
    title: (m.title as string) ?? '',
    description: (m.description as string) ?? '',
    type: (m.type as string) ?? 'troubleshoot',
    tags,
    category,
    cncfProject: cncfProjects[0] ?? undefined,
    missionClass: (raw.missionClass as string) ?? undefined,
    difficulty: (meta?.difficulty as string) ?? undefined,
    installMethods: (meta?.installMethods as string[]) ?? undefined,
    steps: [],
    resolution: resolution ? {
      summary: (resolution.summary as string) ?? '',
      steps: (resolution.steps as string[]) ?? [],
    } : undefined,
    metadata: {
      source: (meta?.sourceIssue as string) ?? (meta?.sourceRepo as string) ?? undefined,
      createdAt: (raw.exportedAt as string) ?? undefined,
    },
  } as MissionExport
}
