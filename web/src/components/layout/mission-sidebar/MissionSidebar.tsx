import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Minus,
  Plus,
  Type,
  Sparkles,
  Send,
  Globe,
  Bookmark,
  Play,
  Trash2,
  CheckCircle2,
  Eye,
  ShieldOff,
  BookOpen,
  Rocket,
  Search,
  Satellite } from 'lucide-react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { useMissions } from '../../../hooks/useMissions'
import { useMobile } from '../../../hooks/useMobile'
import { StatusBadge } from '../../ui/StatusBadge'
import { cn } from '../../../lib/cn'
import { AgentSelector } from '../../agent/AgentSelector'
import { LogoWithStar } from '../../ui/LogoWithStar'
const MissionBrowser = lazy(() =>
  import('../../missions/MissionBrowser').then(m => ({ default: m.MissionBrowser }))
)
import { MissionControlDialog } from '../../mission-control/MissionControlDialog'
import { MissionDetailView } from '../../missions/MissionDetailView'
import type { MissionExport } from '../../../lib/missions/types'
import type { Mission } from '../../../hooks/useMissions'
import type { FontSize } from './types'
import { MissionListItem } from './MissionListItem'
import { OrbitReminderBanner } from '../../missions/OrbitReminderBanner'
import { MissionTypeExplainer } from '../../missions/MissionTypeExplainer'
import { StandaloneOrbitDialog } from '../../missions/StandaloneOrbitDialog'
import { MissionChat } from './MissionChat'
import { ClusterSelectionDialog } from '../../missions/ClusterSelectionDialog'
import { ResolutionKnowledgePanel } from '../../missions/ResolutionKnowledgePanel'
import { ResolutionHistoryPanel } from '../../missions/ResolutionHistoryPanel'
import { SaveResolutionDialog } from '../../missions/SaveResolutionDialog'
import { useResolutions, detectIssueSignature } from '../../../hooks/useResolutions'
import { useTranslation } from 'react-i18next'
import { SAVED_TOAST_MS, FOCUS_DELAY_MS } from '../../../lib/constants/network'
import { MISSION_FILE_FETCH_TIMEOUT_MS } from '../../missions/browser/missionCache'
import { isDemoMode } from '../../../lib/demoMode'

const SIDEBAR_MIN_WIDTH = 380
const SIDEBAR_MAX_WIDTH = 800
const SIDEBAR_DEFAULT_WIDTH = 480
const SIDEBAR_WIDTH_KEY = 'ksc-mission-sidebar-width'

function loadSavedWidth(): number {
  const maxW = typeof window !== 'undefined'
    ? Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth * 0.6)
    : SIDEBAR_MAX_WIDTH
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (saved) {
      const w = Number(saved)
      if (w >= SIDEBAR_MIN_WIDTH && w <= SIDEBAR_MAX_WIDTH) return Math.min(w, maxW)
    }
  } catch { /* ignore */ }
  return Math.min(SIDEBAR_DEFAULT_WIDTH, maxW)
}

export function MissionSidebar() {
  const { t } = useTranslation(['common'])
  const { missions, activeMission, isSidebarOpen, isSidebarMinimized, isFullScreen, setActiveMission, closeSidebar, dismissMission, cancelMission, minimizeSidebar, expandSidebar, setFullScreen, selectedAgent, startMission, saveMission, runSavedMission, openSidebar, sendMessage } = useMissions()
  const { isMobile } = useMobile()
  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(new Set())
  const [fontSize, setFontSize] = useState<FontSize>('base')

  /** Number of missions rendered per page in the history list (#4778) */
  const MISSIONS_PAGE_SIZE = 20
  const [visibleMissionCount, setVisibleMissionCount] = useState(MISSIONS_PAGE_SIZE)

  // Resizable sidebar width (desktop non-fullscreen only)
  const [sidebarWidth, setSidebarWidth] = useState(loadSavedWidth)
  const [isResizing, setIsResizing] = useState(false)
  const latestWidthRef = useRef(sidebarWidth)

  // Publish sidebar width as a CSS custom property so Layout.tsx can
  // adjust main-content margins without needing context plumbing.
  useEffect(() => {
    const root = document.documentElement
    if (!isMobile && isSidebarOpen && !isSidebarMinimized && !isFullScreen) {
      root.style.setProperty('--mission-sidebar-width', `${sidebarWidth}px`)
    } else if (!isMobile && isSidebarOpen && isSidebarMinimized && !isFullScreen) {
      root.style.setProperty('--mission-sidebar-width', '48px')
    } else {
      root.style.setProperty('--mission-sidebar-width', '0px')
    }
    return () => { root.style.removeProperty('--mission-sidebar-width') }
  }, [isMobile, isSidebarOpen, isSidebarMinimized, isFullScreen, sidebarWidth])

  // Re-clamp sidebar width when viewport is resized
  useEffect(() => {
    const onResize = () => {
      const maxW = Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth * 0.6)
      setSidebarWidth((w) => {
        const clamped = Math.min(w, maxW)
        latestWidthRef.current = clamped
        return clamped
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    document.documentElement.dataset.missionResizing = '1'
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMouseMove = (ev: MouseEvent) => {
      // Sidebar is on the right, so dragging left increases width
      const delta = startX - ev.clientX
      const maxW = Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth * 0.6)
      const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(maxW, startWidth + delta))
      latestWidthRef.current = newWidth
      setSidebarWidth(newWidth)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      delete document.documentElement.dataset.missionResizing
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Persist final width using ref to avoid state-updater side effects
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(latestWidthRef.current)) } catch { /* ignore */ }
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }
  const [showNewMission, setShowNewMission] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showMissionControl, setShowMissionControl] = useState(false)
  const [showOrbitDialog, setShowOrbitDialog] = useState(false)
  const [newMissionPrompt, setNewMissionPrompt] = useState('')
  const [showSavedToast, setShowSavedToast] = useState<string | null>(null)
  /** Countdown seconds remaining for the saved-mission toast */
  const [toastCountdown, setToastCountdown] = useState(0)
  const [viewingMission, setViewingMission] = useState<MissionExport | null>(null)
  const [viewingMissionRaw, setViewingMissionRaw] = useState(false)
  const newMissionInputRef = useRef<HTMLTextAreaElement>(null)
  /** Ref to track the first-import toast countdown interval so it can be cleared on unmount or re-import */
  const toastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Cluster selection for install missions
  const [pendingRunMissionId, setPendingRunMissionId] = useState<string | null>(null)
  const [isDirectImporting, setIsDirectImporting] = useState(false)
  // Save Resolution dialog state (triggered from ResolutionKnowledgePanel "Save This Resolution" button)
  const [showSaveResolutionDialog, setShowSaveResolutionDialog] = useState(false)
  // Reset dialog when active mission changes to prevent stale dialog for a different mission
  useEffect(() => { setShowSaveResolutionDialog(false) }, [activeMission?.id])
  // Clean up first-import toast interval on unmount to prevent timer leak (#5211)
  useEffect(() => {
    return () => {
      if (toastIntervalRef.current) {
        clearInterval(toastIntervalRef.current)
        toastIntervalRef.current = null
      }
    }
  }, [])
  // Resolution panel state (fullscreen left sidebar)
  const [resolutionPanelView, setResolutionPanelView] = useState<'related' | 'history'>('related')
  const { findSimilarResolutions, allResolutions } = useResolutions()
  const relatedResolutions = (() => {
    if (!activeMission) return []
    const content = [
      activeMission.title,
      activeMission.description,
      ...activeMission.messages.slice(0, 3).map(m => m.content),
    ].join('\n')
    const signature = detectIssueSignature(content)
    if (!signature.type || signature.type === 'Unknown') return []
    return findSimilarResolutions(signature as { type: string }, { minSimilarity: 0.4, limit: 5 })
  })()

  const handleApplyResolution = (resolution: { title: string; resolution: { summary: string; steps: string[]; yaml?: string } }) => {
    if (!activeMission) return
    const applyMessage = `Please apply this saved resolution:\n\n**${resolution.title}**\n\n${resolution.resolution.summary}\n\nSteps:\n${resolution.resolution.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}${resolution.resolution.yaml ? `\n\nYAML:\n\`\`\`yaml\n${resolution.resolution.yaml}\n\`\`\`` : ''}`
    sendMessage(activeMission.id, applyMessage)
  }

  // Deep-link: open MissionBrowser via ?mission= (specific) or ?browse=missions (explorer)
  // Direct import: ?import= fetches and imports mission directly (no browser popup)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const deepLinkMission = searchParams.get('mission')
  const directImportSlug = searchParams.get('import')
  const browseParam = searchParams.get('browse')
  /** Mission pre-fetched by MissionLandingPage and passed via navigation state */
  const prefetchedMission = (location.state as { prefetchedMission?: MissionExport } | null)?.prefetchedMission

  useEffect(() => {
    if (deepLinkMission || browseParam === 'missions') {
      setShowBrowser(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('mission')
      newParams.delete('browse')
      setSearchParams(newParams, { replace: true })
    }
  }, [deepLinkMission, browseParam, searchParams, setSearchParams])

  // Direct import from landing page — fetch mission content and import it
  // without opening the MissionBrowser dialog
  useEffect(() => {
    if (!directImportSlug) return

    // Clear the param immediately to prevent re-triggering
    const newParams = new URLSearchParams(searchParams)
    newParams.delete('import')
    setSearchParams(newParams, { replace: true })

    // Fast path: if MissionLandingPage passed the already-fetched mission
    // via navigation state, use it directly (skips ~2s of re-fetching).
    if (prefetchedMission) {
      handleImportMission(prefetchedMission)
      // Clear navigation state to prevent stale data on refresh
      window.history.replaceState({}, '')
      return
    }

    // Slow path: fetch the mission by racing all known directories.
    const KB_DIRS = [
      'cncf-install', 'cncf-generated', 'security', 'platform-install',
      'llm-d', 'multi-cluster', 'troubleshoot', 'troubleshooting',
      'cost-optimization', 'networking', 'observability', 'workloads',
    ]
    const paths = [
      ...KB_DIRS.map(dir => `fixes/${dir}/${directImportSlug}.json`),
      `fixes/${directImportSlug}.json`,
    ]

    const tryImport = async () => {
      setIsDirectImporting(true)
      // Race all lookups — resolve as soon as the first succeeds, cancel rest.
      // This avoids waiting for 12 slow 404s when the mission is in cncf-install.
      const controller = new AbortController()
      let found: MissionExport | null = null
      try {
        found = await Promise.any(paths.map(async (path) => {
          const res = await fetch(`/api/missions/file?path=${encodeURIComponent(path)}`, {
            signal: controller.signal })
          if (!res.ok) throw new Error('not found')
          const raw = await res.text()
          const parsed = JSON.parse(raw)
          const { validateMissionExport } = await import('../../../lib/missions/types')
          const result = validateMissionExport(parsed)
          if (!result.valid) throw new Error('invalid')
          controller.abort()
          return result.data
        }))
      } catch {
        found = null
      }
      if (found) {
        handleImportMission(found)
        return
      }

      // Fallback: search index.json for nested paths
      try {
        const res = await fetch('/api/missions/file?path=fixes/index.json', {
          signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS) })
        if (res.ok) {
          const index = await res.json() as { missions?: Array<{ path: string }> }
          const match = (index.missions || []).find(m => {
            const filename = (m.path || '').split('/').pop() || ''
            return filename.replace('.json', '') === directImportSlug
          })
          if (match) {
            const fileRes = await fetch(`/api/missions/file?path=${encodeURIComponent(match.path)}`, {
              signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS) })
            if (fileRes.ok) {
              const raw = await fileRes.text()
              const parsed = JSON.parse(raw)
              const { validateMissionExport } = await import('../../../lib/missions/types')
              const result = validateMissionExport(parsed)
              if (result.valid) {
                handleImportMission(result.data)
                return
              }
            }
          }
        }
      } catch {
        // Index fallback failed
      }

      // Last resort: open the browser if direct import failed
      setShowBrowser(true)
    }

    tryImport().finally(() => setIsDirectImporting(false))
  }, [directImportSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mission list search filter (#3944)
  const [missionSearchQuery, setMissionSearchQuery] = useState('')

  // Reset pagination when search query changes (#4778)
  useEffect(() => {
    setVisibleMissionCount(MISSIONS_PAGE_SIZE)
  }, [missionSearchQuery])

  // Split missions into saved (library) and active, applying search filter
  const matchesSearch = (m: Mission) => {
    if (!missionSearchQuery.trim()) return true
    const q = missionSearchQuery.toLowerCase()
    return m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  }
  const savedMissions = missions.filter(m => m.status === 'saved' && matchesSearch(m))
  const activeMissions = missions
    .filter(m => m.status !== 'saved' && matchesSearch(m))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  /** Paginated slice of active missions for rendering (#4778) */
  const visibleActiveMissions = activeMissions.slice(0, visibleMissionCount)
  const hasMoreMissions = activeMissions.length > visibleMissionCount

  const handleImportMission = (mission: MissionExport) => {
    const missionType = mission.missionClass === 'install' ? 'deploy' as const
      : mission.type === 'troubleshoot' ? 'troubleshoot' as const
      : mission.type === 'deploy' ? 'deploy' as const
      : mission.type === 'upgrade' ? 'upgrade' as const
      : 'custom' as const
    const missionId = saveMission({
      type: missionType,
      title: mission.title,
      description: mission.description || mission.title,
      missionClass: mission.missionClass,
      cncfProject: mission.cncfProject,
      steps: mission.steps?.map(s => ({ title: s.title, description: s.description })),
      tags: mission.tags,
      initialPrompt: mission.resolution?.summary || mission.description })
    setShowBrowser(false)
    // Auto-open the sidebar and highlight the imported mission so the user
    // immediately sees where it went and can act on it
    openSidebar()
    setActiveMission(missionId)

    // Show extended help toast only on first import, short toast on subsequent imports
    const hasImportedBefore = localStorage.getItem('ksc-has-imported')
    if (!hasImportedBefore) {
      localStorage.setItem('ksc-has-imported', new Date().toISOString())
      setShowSavedToast(mission.title)
      /** Countdown duration in seconds for first-import toast */
      const FIRST_IMPORT_COUNTDOWN_S = 60
      setToastCountdown(FIRST_IMPORT_COUNTDOWN_S)
      // Clear any previous interval to prevent leaks on rapid re-imports (#5211)
      if (toastIntervalRef.current) {
        clearInterval(toastIntervalRef.current)
      }
      toastIntervalRef.current = setInterval(() => {
        setToastCountdown((prev) => {
          if (prev <= 1) {
            if (toastIntervalRef.current) {
              clearInterval(toastIntervalRef.current)
              toastIntervalRef.current = null
            }
            setShowSavedToast(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      setShowSavedToast(mission.title)
      setTimeout(() => setShowSavedToast(null), SAVED_TOAST_MS)
    }
  }

  /** Convert a saved Mission to MissionExport for the detail view */
  const savedMissionToExport = (m: Mission): MissionExport => ({
    version: '1.0',
    title: m.importedFrom?.title || m.title,
    description: m.importedFrom?.description || m.description,
    type: m.type,
    tags: m.importedFrom?.tags || [],
    missionClass: m.importedFrom?.missionClass as MissionExport['missionClass'],
    cncfProject: m.importedFrom?.cncfProject,
    steps: (m.importedFrom?.steps || []).map(s => ({
      title: s.title,
      description: s.description })) })

  const handleViewSavedMission = (m: Mission) => {
    setViewingMission(savedMissionToExport(m))
    setViewingMissionRaw(false)
  }

  // Run mission — in demo mode (Netlify), block and open the install dialog instead.
  // For install/deploy types in live mode, show cluster picker first.
  const handleRunMission = (missionId: string) => {
    if (isDemoMode()) {
      window.dispatchEvent(new CustomEvent('open-install'))
      return
    }
    const mission = missions.find(m => m.id === missionId)
    const isInstall = mission?.importedFrom?.missionClass === 'install' || mission?.type === 'deploy'
    if (isInstall) {
      setPendingRunMissionId(missionId)
    } else {
      runSavedMission(missionId)
    }
  }

  const pendingMission = pendingRunMissionId ? missions.find(m => m.id === pendingRunMissionId) : null

  // Escape key: exit fullscreen first, then close sidebar
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullScreen) {
          setFullScreen(false)
          // Only exit fullscreen — don't close sidebar (second Escape will close it)
        } else if (isSidebarOpen) {
          closeSidebar()
        }
      }
    }
    if (isSidebarOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isSidebarOpen, isFullScreen, setFullScreen, closeSidebar])

  // Count missions needing attention
  const needsAttention = missions.filter(m =>
    m.status === 'waiting_input' || m.status === 'failed'
  ).length

  const runningCount = missions.filter(m => m.status === 'running').length

  const toggleMissionCollapse = (missionId: string) => {
    setCollapsedMissions(prev => {
      const next = new Set(prev)
      if (next.has(missionId)) {
        next.delete(missionId)
      } else {
        next.add(missionId)
      }
      return next
    })
  }


  // Minimized sidebar view (thin strip) - desktop only
  if (isSidebarMinimized && !isMobile) {
    return (
      <div
        className={cn(
        "fixed top-16 right-0 bottom-0 w-12 bg-card/95 backdrop-blur-sm border-l border-border shadow-xl z-40 flex flex-col items-center py-4",
        "transition-transform duration-300 ease-in-out",
        !isSidebarOpen && "translate-x-full pointer-events-none"
      )}>
        <button
          onClick={expandSidebar}
          className="p-2 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 mb-4"
          title={t('missionSidebar.expandSidebar')}
        >
          <PanelRightOpen className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="flex flex-col items-center gap-2">
          <LogoWithStar className="w-5 h-5" />
          {missions.length > 0 && (
            <span className="text-xs font-medium text-foreground">{missions.length}</span>
          )}
          {runningCount > 0 && (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          )}
          {needsAttention > 0 && (
            <span className="w-5 h-5 flex items-center justify-center text-xs bg-purple-500/20 text-purple-400 rounded-full">
              {needsAttention}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-2xl z-30 md:hidden"
          onClick={closeSidebar}
        />
      )}

      <div
        data-tour="ai-missions"
        className={cn(
          "fixed bg-card border-border z-40 flex flex-col overflow-hidden shadow-2xl",
          !isResizing && "transition-[width,top,border,transform] duration-300 ease-in-out",
          // Mobile: bottom sheet
          isMobile && "inset-x-0 bottom-0 rounded-t-2xl border-t max-h-[80vh]",
          isMobile && !isSidebarOpen && "translate-y-full pointer-events-none",
          isMobile && isSidebarOpen && "translate-y-0",
          // Desktop: right sidebar
          !isMobile && isFullScreen && "inset-0 top-16 border-l-0 rounded-none",
          !isMobile && !isFullScreen && "top-16 right-0 bottom-0 border-l shadow-xl",
          !isMobile && !isSidebarOpen && "translate-x-full pointer-events-none"
        )}
        style={!isMobile && !isFullScreen ? { width: sidebarWidth } : undefined}
      >
      {/* Desktop resize handle (left edge) */}
      {!isMobile && !isFullScreen && isSidebarOpen && (
        <div
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('missionSidebar.resizeHandleTooltip')}
          title={t('missionSidebar.resizeHandleTooltip')}
          className="absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize z-50 group"
        >
          <div className="absolute inset-y-0 left-0 w-0.5 bg-border group-hover:bg-primary/50 transition-colors" />
        </div>
      )}

      {/* Mobile drag handle */}
      {isMobile && (
        <div className="flex justify-center py-2 md:hidden">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-border min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <LogoWithStar className="w-5 h-5" />
          <h2 className="font-semibold text-foreground text-sm md:text-base whitespace-nowrap">{t('missionSidebar.aiMissions')}</h2>
          {needsAttention > 0 && (
            <StatusBadge color="purple" rounded="full">{needsAttention}</StatusBadge>
          )}
        </div>
        {/* Toolbar and window controls — split so close/minimize never overflow */}
        <div className="flex items-center gap-1 min-w-0">
          {/* Optional toolbar buttons — clipped when sidebar is narrow */}
          <div className="flex items-center gap-1 overflow-hidden min-w-0 flex-shrink">
            {/* New Mission Button */}
            <button
              onClick={() => {
                setShowNewMission(!showNewMission)
                if (!showNewMission) {
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }
              }}
              className={cn(
                "p-1.5 rounded transition-colors flex-shrink-0",
                showNewMission
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
              )}
              title={t('missionSidebar.startNewMission')}
            >
              <Sparkles className="w-4 h-4" />
            </button>
            {/* Browse Community Missions */}
            <button
              onClick={() => setShowBrowser(true)}
              className="p-1.5 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 flex-shrink-0"
              title={t('layout.missionSidebar.browseCommunityMissions')}
            >
              <Globe className="w-4 h-4" />
            </button>
            {/* Mission Control */}
            <button
              onClick={() => setShowMissionControl(true)}
              className="p-1.5 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 flex-shrink-0"
              title={t('layout.missionSidebar.missionControlTitle')}
            >
              <Rocket className="w-4 h-4" />
            </button>
            <AgentSelector compact={!isFullScreen} />
            {/* Font size controls */}
            <div className="flex items-center gap-1 border border-border rounded-lg px-1 flex-shrink-0">
              <button
                onClick={() => setFontSize(prev => prev === 'base' ? 'sm' : prev === 'lg' ? 'base' : 'sm')}
                disabled={fontSize === 'sm'}
                className="p-1 rounded transition-colors disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10"
                title={t('missionSidebar.decreaseFontSize')}
              >
                <Minus className="w-3 h-3 text-muted-foreground" />
              </button>
              <Type className="w-3 h-3 text-muted-foreground" />
              <button
                onClick={() => setFontSize(prev => prev === 'sm' ? 'base' : prev === 'base' ? 'lg' : 'lg')}
                disabled={fontSize === 'lg'}
                className="p-1 rounded transition-colors disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10"
                title={t('missionSidebar.increaseFontSize')}
              >
                <Plus className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          </div>
          {/* Window control buttons — always visible, never clipped */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Fullscreen and minimize - desktop only */}
            {!isMobile && (isFullScreen ? (
              <button
                onClick={() => setFullScreen(false)}
                className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                title={t('missionSidebar.exitFullScreen')}
              >
                <Minimize2 className="w-5 h-5 text-muted-foreground" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => setFullScreen(true)}
                  className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  title={t('missionSidebar.fullScreen')}
                >
                  <Maximize2 className="w-5 h-5 text-muted-foreground" />
                </button>
                <button
                  onClick={minimizeSidebar}
                  className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  title={t('missionSidebar.minimizeSidebar')}
                >
                  <PanelRightClose className="w-5 h-5 text-muted-foreground" />
                </button>
              </>
            ))}
            <button
              onClick={closeSidebar}
              className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              title={t('missionSidebar.closeSidebar')}
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* New Mission Input */}
      {showNewMission && (
        <div className="p-3 border-b border-border bg-secondary/30">
          <div className="flex flex-col gap-2">
            <textarea
              ref={newMissionInputRef}
              value={newMissionPrompt}
              onChange={(e) => setNewMissionPrompt(e.target.value)}
              placeholder={t('missionSidebar.newMissionPlaceholder')}
              className="w-full min-h-[80px] p-2 text-sm bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newMissionPrompt.trim()) {
                  startMission({
                    type: 'custom',
                    title: newMissionPrompt.slice(0, 50) + (newMissionPrompt.length > 50 ? '...' : ''),
                    description: newMissionPrompt,
                    initialPrompt: newMissionPrompt })
                  setNewMissionPrompt('')
                  setShowNewMission(false)
                }
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-2xs text-muted-foreground">
                {isMobile ? t('missionSidebar.tapSend') : t('missionSidebar.cmdEnterSubmit')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowNewMission(false)
                    setNewMissionPrompt('')
                  }}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('missionSidebar.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (newMissionPrompt.trim()) {
                      startMission({
                        type: 'custom',
                        title: newMissionPrompt.slice(0, 50) + (newMissionPrompt.length > 50 ? '...' : ''),
                        description: newMissionPrompt,
                        initialPrompt: newMissionPrompt })
                      setNewMissionPrompt('')
                      setShowNewMission(false)
                    }
                  }}
                  disabled={!newMissionPrompt.trim()}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-3 h-3" />
                  {t('missionSidebar.start')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI paused banner — shown when user selected "None" agent */}
      {selectedAgent === 'none' && (
        <div className="mx-3 mt-2 p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <p className="text-xs text-cyan-400">{t('agent.aiPausedBanner')}</p>
        </div>
      )}

      {/* Saved mission toast — prominent success banner after import */}
      {showSavedToast && (
        <div className="mx-3 mt-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            <p className="text-sm font-medium text-green-400">{t('layout.missionSidebar.missionImported')}</p>
            {toastCountdown > 0 && (
              <span className="text-2xs text-green-400/70 ml-auto">{toastCountdown}s</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mb-2">{showSavedToast}</p>
          {toastCountdown > 0 && (
            <p className="text-2xs text-muted-foreground/70 mb-2">
              {isDemoMode()
                ? t('layout.missionSidebar.useButtonToStart')
                : t('layout.missionSidebar.missionReady')
              }
            </p>
          )}
          <button
            type="button"
            onClick={() => { setShowSavedToast(null); setToastCountdown(0) }}
            className="text-2xs text-green-400/70 hover:text-green-400"
          >
            {t('common.dismiss', 'Dismiss')}
          </button>
        </div>
      )}

      {/* Direct import loading indicator */}
      {isDirectImporting && (
        <div className="mx-3 mt-2 p-2.5 bg-secondary/30 border border-border rounded-lg flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
          <p className="text-xs text-muted-foreground">{t('missionSidebar.importingMission', 'Importing mission...')}</p>
        </div>
      )}

      {missions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-400/60 mb-4" />
          <p className="text-muted-foreground">{t('missionSidebar.noActiveMissions')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('missionSidebar.startMissionPrompt')}
          </p>
          <div className="flex items-stretch gap-2 mt-4">
            {!showNewMission && (
              <button
                onClick={() => {
                  setShowNewMission(true)
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }}
                className="flex flex-col items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors min-w-[100px]"
              >
                <Sparkles className="w-5 h-5" />
                <span className="text-center leading-tight">{t('missionSidebar.startCustomMission')}</span>
              </button>
            )}
            <button
              onClick={() => setShowBrowser(true)}
              className="flex flex-col items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors min-w-[100px]"
            >
              <Globe className="w-5 h-5" />
              <span className="text-center leading-tight">{t('layout.missionSidebar.browseCommunityMissions')}</span>
            </button>
            <button
              onClick={() => setShowMissionControl(true)}
              className="flex flex-col items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:from-violet-500 hover:to-indigo-500 transition-colors shadow-lg shadow-violet-500/25 min-w-[100px]"
            >
              <Rocket className="w-5 h-5" />
              <span className="text-center leading-tight">{t('layout.missionSidebar.missionControl')}</span>
            </button>
          </div>
        </div>
      ) : activeMission ? (
        <div className={cn(
          "flex-1 flex min-h-0 min-w-0 overflow-hidden",
          isFullScreen && "w-full"
        )}>
          {/* Fullscreen: left sidebar with saved missions + related knowledge */}
          {isFullScreen && (
            <div className="w-64 border-r border-border bg-secondary/20 flex flex-col overflow-hidden flex-shrink-0">
              <div className="flex-1 overflow-y-auto scroll-enhanced">
                {/* Saved Missions section */}
                {savedMissions.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                      <Bookmark className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-semibold text-foreground">{t('layout.missionSidebar.savedMissions')}</span>
                      <StatusBadge color="purple" size="xs" rounded="full" className="ml-auto">{savedMissions.length}</StatusBadge>
                    </div>
                    <div className="p-1.5 space-y-1">
                      {savedMissions.map(m => (
                        <div
                          key={m.id}
                          className="group p-2 rounded-lg hover:bg-purple-500/10 transition-colors cursor-pointer border border-transparent hover:border-purple-500/20"
                          onClick={() => handleViewSavedMission(m)}
                        >
                          <div className="flex items-start gap-2">
                            <Bookmark className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{m.title}</p>
                              {m.importedFrom?.cncfProject && (
                                <p className="text-2xs text-muted-foreground truncate">{m.importedFrom.cncfProject}</p>
                              )}
                              {m.importedFrom?.tags && m.importedFrom.tags.length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {m.importedFrom.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="text-[9px] px-1 py-0 bg-secondary rounded text-muted-foreground">{tag}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewSavedMission(m) }}
                              className="flex items-center gap-1 px-2 py-0.5 text-2xs text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
                            >
                              <Eye className="w-2.5 h-2.5" /> View
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRunMission(m.id) }}
                              className="flex items-center gap-1 px-2 py-0.5 text-2xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                            >
                              <Play className="w-2.5 h-2.5" /> Run
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); dismissMission(m.id) }}
                              className="flex items-center gap-1 px-2 py-0.5 text-2xs text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-2.5 h-2.5" /> Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related Knowledge section */}
                <div className={cn(savedMissions.length > 0 && "border-t border-border")}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                    <BookOpen className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold text-foreground">{t('layout.missionSidebar.knowledge')}</span>
                  </div>
                  {/* Toggle tabs */}
                  <div className="flex mx-1.5 mt-1.5 bg-secondary/50 rounded-lg p-0.5">
                    <button
                      onClick={() => setResolutionPanelView('related')}
                      className={cn(
                        "flex-1 px-2 py-1 text-2xs font-medium rounded-md transition-colors flex items-center justify-center gap-1",
                        resolutionPanelView === 'related'
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Related
                      {relatedResolutions.length > 0 && (
                        <span className={cn(
                          "px-1 py-0 text-[9px] rounded-full",
                          resolutionPanelView === 'related'
                            ? "bg-green-500/20 text-green-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {relatedResolutions.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setResolutionPanelView('history')}
                      className={cn(
                        "flex-1 px-2 py-1 text-2xs font-medium rounded-md transition-colors flex items-center justify-center gap-1",
                        resolutionPanelView === 'history'
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All Saved
                      {allResolutions.length > 0 && (
                        <span className={cn(
                          "px-1 py-0 text-[9px] rounded-full",
                          resolutionPanelView === 'history'
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {allResolutions.length}
                        </span>
                      )}
                    </button>
                  </div>
                  {/* Panel content */}
                  <div className="p-1.5">
                    {resolutionPanelView === 'related' ? (
                      <ResolutionKnowledgePanel
                        relatedResolutions={relatedResolutions}
                        onApplyResolution={handleApplyResolution}
                        onSaveNewResolution={() => setShowSaveResolutionDialog(true)}
                      />
                    ) : (
                      <ResolutionHistoryPanel
                        onApplyResolution={handleApplyResolution}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {/* Back to list if multiple missions */}
            {missions.length > 1 && (
              <button
                onClick={() => setActiveMission(null)}
                className="flex items-center gap-1 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-b border-border flex-shrink-0"
              >
                <ChevronLeft className="w-3 h-3" />
                {t('missionSidebar.backToMissions', { count: missions.length })}
              </button>
            )}
            <MissionChat mission={activeMission} isFullScreen={isFullScreen} fontSize={fontSize} onToggleFullScreen={() => setFullScreen(true)} />
          </div>
        </div>
      ) : (
        <div className={cn(
          "flex-1 overflow-y-auto scroll-enhanced p-2 space-y-2",
          isFullScreen && "max-w-3xl mx-auto w-full"
        )}>
          {/* Mission search filter (#3944) */}
          {missions.length > 1 && (
            <div className="relative px-1 pb-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={missionSearchQuery}
                onChange={(e) => setMissionSearchQuery(e.target.value)}
                placeholder={t('missionSidebar.searchMissions', { defaultValue: 'Search missions...' })}
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              {missionSearchQuery && (
                <button
                  onClick={() => setMissionSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-secondary rounded transition-colors"
                  title={t('common.clear', { defaultValue: 'Clear' })}
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          {/* Mission type explainer — demo mode only */}
          <MissionTypeExplainer />

          {/* Add Orbit button — always visible above saved missions */}
          <div className="mb-2 px-2">
            <button
              onClick={() => setShowOrbitDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-500/10 transition-colors w-full justify-center"
              title={t('orbit.addOrbit')}
            >
              <Satellite className="w-3.5 h-3.5" />
              {t('orbit.addOrbit')}
            </button>
          </div>

          {/* Saved missions section */}
          {savedMissions.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                <Bookmark className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-semibold text-foreground">{t('layout.missionSidebar.savedMissions')}</span>
                <StatusBadge color="purple" size="xs" rounded="full">{savedMissions.length}</StatusBadge>
              </div>
              <div className="space-y-1.5">
                {savedMissions.map(m => (
                  <div
                    key={m.id}
                    className="group flex items-center gap-3 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors cursor-pointer"
                    onClick={() => handleViewSavedMission(m)}
                  >
                    <Bookmark className="w-4 h-4 text-purple-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.description}</p>
                      {m.importedFrom?.tags && m.importedFrom.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {m.importedFrom.tags.slice(0, 4).map(tag => (
                            <span key={tag} className="text-2xs px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleViewSavedMission(m) }}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
                        title={t('layout.missionSidebar.viewMissionDetails')}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRunMission(m.id) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        title={t('layout.missionSidebar.runThisMission')}
                      >
                        <Play className="w-3 h-3" /> {t('layout.missionSidebar.run')}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); dismissMission(m.id) }}
                        className="p-1.5 text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                        title={t('layout.missionSidebar.removeFromLibrary')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orbit reminder banner — shows when orbit missions are due/overdue */}
          <OrbitReminderBanner
            missions={missions}
            onRunMission={(missionId) => {
              setActiveMission(missionId)
              runSavedMission(missionId)
            }}
          />

          {/* Active missions section — paginated for performance (#4778) */}
          {activeMissions.length > 0 && (
            <>
              {savedMissions.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="text-xs font-semibold text-foreground">{t('layout.missionSidebar.activeMissions')}</span>
                  <span className="text-2xs bg-secondary px-1.5 py-0.5 rounded-full">{activeMissions.length}</span>
                </div>
              )}
              {visibleActiveMissions.map((mission) => (
                <MissionListItem
                  key={mission.id}
                  mission={mission}
                  isActive={false}
                  onClick={() => {
                    // Always show the mission's chat first (#4549)
                    setActiveMission(mission.id)
                    // Also open Mission Control dialog for planning missions
                    if (mission.title === 'Mission Control Planning' || mission.context?.missionControl) {
                      setShowMissionControl(true)
                    }
                  }}
                  onDismiss={() => dismissMission(mission.id)}
                  onTerminate={() => cancelMission(mission.id)}
                  onExpand={() => {
                    setActiveMission(mission.id)
                    setFullScreen(true)
                    if (mission.title === 'Mission Control Planning' || mission.context?.missionControl) {
                      setShowMissionControl(true)
                    }
                  }}
                  isCollapsed={collapsedMissions.has(mission.id)}
                  onToggleCollapse={() => toggleMissionCollapse(mission.id)}
                />
              ))}
              {/* Load More button — renders remaining missions incrementally */}
              {hasMoreMissions && (
                <button
                  onClick={() => setVisibleMissionCount(prev => prev + MISSIONS_PAGE_SIZE)}
                  className="w-full py-2 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                >
                  {t('missionSidebar.loadMore', {
                    defaultValue: 'Load more ({{remaining}} remaining)',
                    remaining: activeMissions.length - visibleMissionCount })}
                </button>
              )}
            </>
          )}

          {/* Empty state when only saved missions, no active */}
          {activeMissions.length === 0 && savedMissions.length > 0 && !missionSearchQuery && (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">{t('layout.missionSidebar.noActiveMissionsHint')}</p>
            </div>
          )}
          {/* No search results */}
          {missionSearchQuery && savedMissions.length === 0 && activeMissions.length === 0 && (
            <div className="text-center py-6">
              <Search className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t('missionSidebar.noSearchResults', { defaultValue: 'No missions match your search.' })}</p>
            </div>
          )}
        </div>
      )}
    </div>

      {/* Saved Mission Detail Modal */}
      {viewingMission && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xl"
          onClick={(e) => { if (e.target === e.currentTarget) setViewingMission(null) }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setViewingMission(null) } }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className={cn(
            "relative bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col",
            isMobile ? "inset-2 fixed" : "w-[900px] max-h-[85vh]"
          )}>
            {/* Close button — positioned above the content area to avoid overlapping Run/View Raw */}
            <div className="flex justify-end p-3 pb-0 shrink-0">
              <button
                onClick={() => setViewingMission(null)}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto scroll-enhanced px-6 pb-6">
              <MissionDetailView
                mission={viewingMission}
                rawContent={JSON.stringify(viewingMission, null, 2)}
                showRaw={viewingMissionRaw}
                onToggleRaw={() => setViewingMissionRaw(prev => !prev)}
                onImport={() => {
                  // Find the matching saved mission and run it
                  const match = savedMissions.find(m => m.title === viewingMission.title)
                  if (match) handleRunMission(match.id)
                  setViewingMission(null)
                }}
                onBack={() => setViewingMission(null)}
                importLabel="Run"
                hideBackButton
              />
            </div>
          </div>
        </div>
      )}

      {/* Mission Browser Dialog (lazy-loaded — 2 000+ line component) */}
      <Suspense fallback={null}>
        <MissionBrowser
          isOpen={showBrowser}
          onClose={() => setShowBrowser(false)}
          onImport={handleImportMission}
          initialMission={deepLinkMission || undefined}
        />
      </Suspense>

      {/* Mission Control Dialog */}
      <MissionControlDialog
        open={showMissionControl}
        onClose={() => setShowMissionControl(false)}
      />

      {/* Standalone Orbit Mission Dialog */}
      {showOrbitDialog && (
        <StandaloneOrbitDialog onClose={() => setShowOrbitDialog(false)} />
      )}

      {/* Cluster Selection Dialog for install missions */}
      {pendingRunMissionId && (
        <ClusterSelectionDialog
          open
          missionTitle={pendingMission?.title ?? 'Mission'}
          onSelect={(clusters) => {
            runSavedMission(pendingRunMissionId, clusters.length > 0 ? clusters.join(',') : undefined)
            setPendingRunMissionId(null)
          }}
          onCancel={() => setPendingRunMissionId(null)}
        />
      )}

      {/* Save Resolution Dialog — triggered from ResolutionKnowledgePanel "Save This Resolution" button.
          Reset dialog state when active mission changes to prevent stale dialog reopening. */}
      {activeMission && showSaveResolutionDialog && (
        <SaveResolutionDialog
          mission={activeMission}
          isOpen={showSaveResolutionDialog}
          onClose={() => setShowSaveResolutionDialog(false)}
        />
      )}
    </>
  )
}

// Toggle button for the sidebar (shown when sidebar is closed)
export function MissionSidebarToggle() {
  const { t } = useTranslation(['common'])
  const { missions, isSidebarOpen, openSidebar } = useMissions()
  const { isMobile } = useMobile()

  const needsAttention = missions.filter(m =>
    m.status === 'waiting_input' || m.status === 'failed'
  ).length

  const runningCount = missions.filter(m => m.status === 'running').length


  // Always show toggle when sidebar is closed (even with no missions)
  if (isSidebarOpen) {
    return null
  }

  return (
    <button
      onClick={openSidebar}
      data-tour="ai-missions-toggle"
      className={cn(
        'fixed flex items-center gap-2 rounded-full shadow-lg transition-all z-50',
        // Mobile: smaller padding, bottom right
        isMobile ? 'px-3 py-2 right-4 bottom-4' : 'px-4 py-3 right-4 bottom-4',
        needsAttention > 0
          ? 'bg-purple-500 text-white animate-pulse'
          : 'bg-card border border-border text-foreground hover:bg-secondary'
      )}
      title={t('missionSidebar.openAIMissions')}
    >
      <LogoWithStar className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
      {runningCount > 0 && (
        <Loader2 className={isMobile ? 'w-3 h-3 animate-spin' : 'w-4 h-4 animate-spin'} />
      )}
      {needsAttention > 0 ? (
        <span className={isMobile ? 'text-xs font-medium' : 'text-sm font-medium'}>{t('missionSidebar.needsAttention', { count: needsAttention })}</span>
      ) : missions.length > 0 ? (
        <span className={isMobile ? 'text-xs' : 'text-sm'}>{t('missionSidebar.missionCount', { count: missions.length })}</span>
      ) : (
        <span className={isMobile ? 'text-xs' : 'text-sm'}>{t('missionSidebar.aiMissions')}</span>
      )}
      <ChevronRight className={cn(isMobile ? 'w-3 h-3' : 'w-4 h-4', isMobile && 'rotate-[-90deg]')} />
    </button>
  )
}
