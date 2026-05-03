import { useState, useEffect, useRef, Suspense } from 'react'
import { safeLazy } from '../../../lib/safeLazy'
import { isAnyModalOpen } from '../../../lib/modals'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
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
  Satellite,
  History } from 'lucide-react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { useMissions, isActiveMission } from '../../../hooks/useMissions'
import { useMobile } from '../../../hooks/useMobile'
import { StatusBadge } from '../../ui/StatusBadge'
import { cn } from '../../../lib/cn'
import { AgentSelector } from '../../agent/AgentSelector'
import { LogoWithStar } from '../../ui/LogoWithStar'
const MissionBrowser = safeLazy(() => import('../../missions/MissionBrowser'), 'MissionBrowser')
import { MissionControlDialog } from '../../mission-control/MissionControlDialog'
import { MissionDetailView } from '../../missions/MissionDetailView'
import type { MissionExport, OrbitResourceFilter } from '../../../lib/missions/types'
import type { Mission } from '../../../hooks/useMissions'
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

// Tablet breakpoint matches Tailwind's `lg` (1024px). Below this width the
// mission sidebar is rendered as an overlay (position: fixed without pushing
// main content) so tablet layouts don't get squeezed below the min sidebar
// width. See issues 6388 / 6394.
const TABLET_BREAKPOINT_PX = 1024

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
  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAddMenu])

  /** Number of missions rendered per page in the history list (#4778) */
  const MISSIONS_PAGE_SIZE = 20
  const [visibleMissionCount, setVisibleMissionCount] = useState(MISSIONS_PAGE_SIZE)

  // Resizable sidebar width (desktop non-fullscreen only)
  const [sidebarWidth, setSidebarWidth] = useState(loadSavedWidth)
  const [isResizing, setIsResizing] = useState(false)
  const latestWidthRef = useRef(sidebarWidth)

  // Track tablet range (>= mobile but < lg). In this range the sidebar is
  // rendered as an overlay that does NOT push main content — pushing at
  // tablet widths squeezes main below the sidebar min width and can cause
  // ~10px content overlap (issue 6388).
  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < TABLET_BREAKPOINT_PX
  })
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT_PX - 1}px)`)
    const onChange = (e: MediaQueryListEvent) => setIsTablet(e.matches)
    setIsTablet(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Publish sidebar width as a CSS custom property so Layout.tsx can
  // adjust main-content margins without needing context plumbing.
  // On tablet (< 1024px) we publish 0 so the sidebar floats as an overlay.
  useEffect(() => {
    const root = document.documentElement
    const isOverlayMode = isMobile || isTablet
    if (!isOverlayMode && isSidebarOpen && !isSidebarMinimized && !isFullScreen) {
      root.style.setProperty('--mission-sidebar-width', `${sidebarWidth}px`)
    } else if (!isOverlayMode && isSidebarOpen && isSidebarMinimized && !isFullScreen) {
      root.style.setProperty('--mission-sidebar-width', '48px')
    } else {
      root.style.setProperty('--mission-sidebar-width', '0px')
    }
    return () => { root.style.removeProperty('--mission-sidebar-width') }
  }, [isMobile, isTablet, isSidebarOpen, isSidebarMinimized, isFullScreen, sidebarWidth])

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

  const resizeCleanupRef = useRef<(() => void) | null>(null)

  // Clean up resize listeners on unmount to prevent leaks if mouseup never fires
  useEffect(() => () => { resizeCleanupRef.current?.() }, [])

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
      resizeCleanupRef.current = null
      // Persist final width using ref to avoid state-updater side effects
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(latestWidthRef.current)) } catch { /* ignore */ }
      // Notify child components (charts, resize observers) to recalculate
      // their layout after the panel resize completes (#11458).
      window.dispatchEvent(new Event('resize'))
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    resizeCleanupRef.current = onMouseUp
  }
  const [showNewMission, setShowNewMission] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showMissionControl, setShowMissionControl] = useState(false)
  /** Kubara chart name to pre-populate in Mission Control Phase 1 (#8483) */
  const [pendingKubaraChart, setPendingKubaraChart] = useState<string | undefined>(undefined)
  /** Base64-encoded plan from a deep link — opens Mission Control in review mode */
  const [pendingReviewPlan, setPendingReviewPlan] = useState<string | undefined>(undefined)
  const [showOrbitDialog, setShowOrbitDialog] = useState(false)
  const [orbitDialogPrefill, setOrbitDialogPrefill] = useState<{ clusters?: string[]; resourceFilters?: Record<string, OrbitResourceFilter[]> } | undefined>(undefined)
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
    // Enforce lifecycle validation (#5934): resolution should never be
    // applied to a mission that is in a non-interactive state. Blocked
    // missions are awaiting preflight fixes, pending missions have never
    // left the queue, and cancelling/cancelled missions should not be
    // restarted through the resolution flow. Running missions already
    // have input disabled so sendMessage would no-op, but we surface a
    // clearer guard here anyway.
    const NON_APPLIABLE_STATUSES = new Set(['blocked', 'pending', 'cancelling', 'running'])
    if (NON_APPLIABLE_STATUSES.has(activeMission.status)) {
      return
    }
    const applyMessage = `Please apply this saved resolution:\n\n**${resolution.title}**\n\n${resolution.resolution.summary}\n\nSteps:\n${resolution.resolution.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}${resolution.resolution.yaml ? `\n\nYAML:\n\`\`\`yaml\n${resolution.resolution.yaml}\n\`\`\`` : ''}`
    sendMessage(activeMission.id, applyMessage)
  }

  // Deep-link: open MissionBrowser via ?mission= (specific) or ?browse=missions (explorer)
  // Deep-link: open MissionControlDialog via ?mission-control=open (#6474)
  // Direct import: ?import= fetches and imports mission directly (no browser popup)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const deepLinkMission = searchParams.get('mission')
  const directImportSlug = searchParams.get('import')
  const browseParam = searchParams.get('browse')
  const missionControlParam = searchParams.get('mission-control')
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

  // #6474 — ?mission-control=open opens the MissionControlDialog.
  // Parallel to the ?browse=missions deep-link above. Gives users a
  // shareable URL and makes Missions.spec.ts e2e tests actually work.
  useEffect(() => {
    if (missionControlParam === 'open') {
      setShowMissionControl(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('mission-control')
      setSearchParams(newParams, { replace: true })
    } else if (missionControlParam === 'review') {
      const planParam = searchParams.get('plan')
      if (planParam) {
        setPendingReviewPlan(planParam)
        setShowMissionControl(true)
      }
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('mission-control')
      newParams.delete('plan')
      setSearchParams(newParams, { replace: true })
    }
  }, [missionControlParam, searchParams, setSearchParams])

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

  // History panel toggle (#10522) — history is behind an icon button so
  // the default view is the CTA dashboard for a cleaner chat-first UX.
  const HISTORY_PANEL_KEY = 'ksc-mission-history-panel'
  const [showHistoryPanel, setShowHistoryPanel] = useState(() => {
    try {
      return localStorage.getItem(HISTORY_PANEL_KEY) === 'true'
    } catch { return false }
  })
  // Track which view the user came from so "Back to missions" returns them
  // to the right panel (dashboard vs history) instead of always resetting.
  const [lastPanelView, setLastPanelView] = useState<'dashboard' | 'history'>(
    showHistoryPanel ? 'history' : 'dashboard'
  )

  const toggleHistoryPanel = () => {
    setShowHistoryPanel(prev => {
      const next = !prev
      try { localStorage.setItem(HISTORY_PANEL_KEY, String(next)) } catch { /* ignore */ }
      if (!next) setMissionSearchQuery('')
      return next
    })
  }

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
  // issue 8143 — The sidebar list MUST show terminal (completed / failed /
  // cancelled) missions so users can find their mission history. Issue 5946
  // tightened this filter to isActiveMission, which correctly excludes
  // terminal entries from the MissionSidebarToggle count badge but was
  // mistakenly applied to the list too — and with no "History" section to
  // catch the excluded entries, every finished mission simply vanished
  // from the sidebar. The list filter only excludes 'saved' (which has its
  // own section above); the toggle-badge count below still uses
  // isActiveMission so the badge stays accurate. Named `activeMissions`
  // for historical continuity with the many references below, but the
  // contents are now "all non-library missions".
  const activeMissions = missions
    .filter(m => m.status !== 'saved' && matchesSearch(m))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  /** Paginated slice of active missions for rendering (#4778) */
  const visibleActiveMissions = activeMissions.slice(0, visibleMissionCount)
  const hasMoreMissions = activeMissions.length > visibleMissionCount

  /**
   * Total missions actually rendered in the list view (saved + the
   * non-library bucket). Used so the list header count and the chat
   * view's "Back to missions" label agree on the same source of truth
   * (issues 6134, 6135, 6136, 6137). After issue 8143 the non-library
   * bucket includes terminal missions again so the sidebar shows
   * history, so this total now equals `missions.length` unless a search
   * filter is active.
   */
  const listTotalMissions = savedMissions.length + activeMissions.length

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

  // Escape key: exit fullscreen first, then close sidebar.
  // Skip when an overlay (MissionBrowser, MissionControlDialog, or ANY
  // BaseModal) is open — those handle their own Escape via the modal
  // stack, and closing the sidebar behind them is wrong (#8428 follow-up).
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showBrowser || showMissionControl) return
      // Yield to any open BaseModal (ACMM intro, confirm dialog, etc.)
      // — isAnyModalOpen() checks the global modal stack maintained by
      // useModalNavigation. Without this guard, dismissing a modal also
      // closes the sidebar behind it because both listeners fire on the
      // same keypress.
      if (isAnyModalOpen()) return
      if (isFullScreen) {
        setFullScreen(false)
      } else if (isSidebarOpen) {
        closeSidebar()
      }
    }
    if (isSidebarOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isSidebarOpen, isFullScreen, showBrowser, showMissionControl, setFullScreen, closeSidebar])

  // Count missions needing attention — statuses where the user must act.
  // Blocked missions are stuck on preflight failure / missing credentials /
  // RBAC denial (#5933). `failed` is deliberately excluded (#7918): failed
  // missions are terminal and are filtered out of the active list by
  // `isActiveMission`, so including them here produced a badge count the
  // user could not reconcile with the visible active list.
  const needsAttention = missions.filter(m =>
    m.status === 'waiting_input' || m.status === 'blocked'
  ).length

  const runningCount = missions.filter(m => m.status === 'running').length

  // Auto-open history when missions need user action (#10522) so
  // waiting_input / blocked missions are not hidden behind the toggle.
  useEffect(() => {
    if (needsAttention > 0 && !showHistoryPanel && !activeMission) {
      setShowHistoryPanel(true)
    }
  }, [needsAttention]) // eslint-disable-line react-hooks/exhaustive-deps

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

  /**
   * Start a rollback mission that attempts to reverse the changes made by
   * a failed or cancelled mission (#6313). Extracts the original mission's
   * context (title, type, cluster, message history) and asks the AI to
   * reverse whatever was partially applied.
   */
  const handleRollback = (mission: Mission) => {
    const agentMessages = (mission.messages || [])
      .filter(m => m.role === 'assistant' && m.content)
      .map(m => m.content)
      .join('\n')

    const rollbackPrompt = [
      `The following AI mission was interrupted or failed and may have left the cluster in an inconsistent state.`,
      `Original mission: "${mission.title}"`,
      mission.cluster ? `Cluster: ${mission.cluster}` : '',
      `Status: ${mission.status}`,
      ``,
      `Here is a summary of what the mission attempted:`,
      agentMessages.slice(0, 2000),
      ``,
      `Please analyze what changes were likely applied and reverse them safely.`,
      `Check the current state of the cluster first, identify any partially-applied changes,`,
      `and roll them back. Ask me before making destructive changes.`,
    ].filter(Boolean).join('\n')

    startMission({
      title: `Rollback: ${mission.title}`,
      description: `Reverse changes from interrupted mission "${mission.title}"`,
      type: 'repair',
      cluster: mission.cluster,
      initialPrompt: rollbackPrompt,
    })
    openSidebar()
  }


  // Minimized sidebar view (thin strip) - desktop only
  if (isSidebarMinimized && !isMobile) {
    return (
      <div
        className={cn(
        "fixed top-16 right-0 bottom-0 w-12 bg-card/95 backdrop-blur-xs border-l border-border shadow-xl z-sidebar flex flex-col items-center py-4",
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
          {activeMissions.length > 0 && (
            <span className="text-xs font-medium text-foreground">{activeMissions.length}</span>
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
      {/* issue 6742 — tabIndex=-1 removes the backdrop from the Tab order, aria-hidden
          hides it from assistive tech. The sidebar itself handles close semantics. */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-overlay md:hidden"
          onClick={closeSidebar}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
      {/* Tablet backdrop — the sidebar renders as an overlay at < lg so main
          content isn't squeezed. A tap-out backdrop mirrors mobile UX (issue 6388). */}
      {!isMobile && isTablet && isSidebarOpen && !isFullScreen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-overlay lg:hidden"
          onClick={closeSidebar}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      <div
        data-tour="ai-missions"
        data-testid="mission-sidebar"
        className={cn(
          "fixed bg-card border-border flex flex-col overflow-hidden shadow-2xl",
          isMobile ? "z-modal" : "z-sidebar",
          !isResizing && "transition-[width,top,border,transform] duration-300 ease-in-out",
          // Mobile: bottom sheet
          // vh fallback before dvh so browsers without dynamic-viewport-unit
          // support still cap the sheet height (#6548).
          isMobile && "inset-x-0 bottom-0 rounded-t-2xl border-t max-h-[80vh] max-h-[80dvh]",
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
        <div className="flex items-center gap-2 shrink-0">
          <LogoWithStar className="w-5 h-5" />
          <h2 className="font-semibold text-foreground text-sm md:text-base whitespace-nowrap">{t('missionSidebar.aiMissions')}</h2>
          {needsAttention > 0 && (
            <StatusBadge color="purple" rounded="full">{needsAttention}</StatusBadge>
          )}
        </div>
        {/* Toolbar and window controls — split so close/minimize never overflow */}
        <div className="flex items-center gap-1.5 min-w-0" role="toolbar" aria-label={t('missionSidebar.headerActions', { defaultValue: 'Mission panel actions' })}>
          {/* + button with dropdown — outside overflow-hidden so the dropdown isn't clipped */}
          <div className="relative mr-1 shrink-0" ref={addMenuRef}>
            <button
              onClick={() => setShowAddMenu(prev => !prev)}
              className={cn(
                "p-1.5 rounded transition-colors ring-1",
                showAddMenu
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-purple-500/10 text-purple-400 ring-purple-500/30 hover:bg-purple-500/20 hover:text-purple-300"
              )}
              aria-label="Add"
              title="Add"
            >
              <Plus className="w-4 h-4" />
            </button>
            {showAddMenu && (
              <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg border border-border bg-background shadow-lg py-1">
                <button
                  onClick={() => {
                    setShowAddMenu(false)
                    setShowNewMission(true)
                    setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                >
                  <Plus className="w-4 h-4 text-purple-400" />
                  New Mission
                </button>
                <button
                  onClick={() => { setShowAddMenu(false); setShowBrowser(true) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                >
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  Browse Community
                </button>
                <button
                  onClick={() => { setShowAddMenu(false); setShowMissionControl(true) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                >
                  <Rocket className="w-4 h-4 text-muted-foreground" />
                  Mission Control
                </button>
                {/* History toggle on mobile — desktop uses a standalone icon button (#10522) */}
                {isMobile && listTotalMissions > 0 && (
                  <button
                    onClick={() => { setShowAddMenu(false); toggleHistoryPanel() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                  >
                    <History className="w-4 h-4 text-muted-foreground" />
                    {showHistoryPanel
                      ? t('missionSidebar.hideHistory', { defaultValue: 'Hide History' })
                      : t('missionSidebar.showHistory', { defaultValue: 'Show History' })}
                    {!showHistoryPanel && listTotalMissions > 0 && (
                      <span className="ml-auto text-2xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">{listTotalMissions}</span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
          {/* History toggle button (#10522) — shows/hides mission history list.
              On mobile, the toggle is inside the + menu to avoid crowding the header. */}
          {!isMobile && (
            <button
              onClick={toggleHistoryPanel}
              className={cn(
                "relative p-1.5 rounded transition-colors ring-1 mr-1 shrink-0",
                showHistoryPanel
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-secondary/50 text-muted-foreground ring-border hover:bg-secondary hover:text-foreground"
              )}
              aria-label={t('missionSidebar.toggleHistory', { defaultValue: 'Toggle mission history' })}
              title={t('missionSidebar.toggleHistory', { defaultValue: 'Toggle mission history' })}
            >
              <History className="w-4 h-4" />
              {listTotalMissions > 0 && !showHistoryPanel && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-medium bg-purple-500 text-white rounded-full px-1">
                  {listTotalMissions}
                </span>
              )}
            </button>
          )}
          {/* Optional toolbar buttons — clipped when sidebar is narrow */}
          <div className="flex items-center gap-1 overflow-hidden min-w-0 shrink">
            <AgentSelector compact={!isFullScreen} />
          </div>
          {/* Window control buttons — always visible, never clipped */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Fullscreen and minimize - desktop only */}
            {!isMobile && (isFullScreen ? (
              <button
                onClick={() => setFullScreen(false)}
                className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={t('missionSidebar.exitFullScreen')}
                title={t('missionSidebar.exitFullScreen')}
              >
                <Minimize2 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => setFullScreen(true)}
                  className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label={t('missionSidebar.fullScreen')}
                  title={t('missionSidebar.fullScreen')}
                >
                  <Maximize2 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                </button>
                <button
                  onClick={minimizeSidebar}
                  className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label={t('missionSidebar.minimizeSidebar')}
                  title={t('missionSidebar.minimizeSidebar')}
                >
                  <PanelRightClose className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                </button>
              </>
            ))}
            <button
              onClick={closeSidebar}
              className="min-w-[44px] min-h-[44px] p-2 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
              aria-label={t('missionSidebar.closeSidebar')}
              title={t('missionSidebar.closeSidebar')}
            >
              <X className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
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
              className="w-full min-h-[80px] p-2 text-sm bg-background border border-border rounded-lg resize-none focus:outline-hidden focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newMissionPrompt.trim()) {
                  startMission({
                    type: 'custom',
                    title: newMissionPrompt.slice(0, 50) + (newMissionPrompt.length > 50 ? '...' : ''),
                    description: newMissionPrompt,
                    initialPrompt: newMissionPrompt,
                    skipReview: true })
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
                        initialPrompt: newMissionPrompt,
                        skipReview: true })
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
          <ShieldOff className="w-4 h-4 text-cyan-400 shrink-0" />
          <p className="text-xs text-cyan-400">{t('agent.aiPausedBanner')}</p>
        </div>
      )}

      {/* Saved mission toast — prominent success banner after import */}
      {showSavedToast && (
        <div className="mx-3 mt-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
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
          <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">{t('missionSidebar.importingMission', 'Importing mission...')}</p>
        </div>
      )}

      {/*
       * Issue 8143 — Empty-state gate uses `listTotalMissions` (saved + active)
       * rather than raw `missions.length`. Previously users whose mission history
       * only contained terminal entries (completed / failed / cancelled) fell
       * through this branch into the list view, which renders sections only for
       * saved and active missions. The result was a panel with no list items, no
       * empty-state message, and no CTA — i.e. "AI Missions list not visible".
       * Gate on the visible-list total so those users see the CTA.
       * `missionSearchQuery` is excluded so a failed search still surfaces the
       * "no search results" branch below instead of this full-panel empty state.
       */}
      {listTotalMissions === 0 && !missionSearchQuery.trim() && !activeMission && !showHistoryPanel ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-400/60 mb-4" />
          <p className="text-muted-foreground">{t('missionSidebar.noActiveMissions')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('missionSidebar.startMissionPrompt')}
          </p>
          <div className="grid grid-cols-3 gap-2 mt-4 w-full max-w-sm">
            {!showNewMission && (
              <button
                onClick={() => {
                  setShowNewMission(true)
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }}
                className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors h-[72px]"
              >
                <Sparkles className="w-6 h-6 shrink-0" />
                <span className="text-center leading-tight text-xs truncate max-w-full">{t('missionSidebar.startCustomMission')}</span>
              </button>
            )}
            <button
              onClick={() => setShowBrowser(true)}
              className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors h-[72px]"
            >
              <Globe className="w-6 h-6 shrink-0" />
              <span className="text-center leading-tight text-xs truncate max-w-full">{t('layout.missionSidebar.browseCommunityMissions')}</span>
            </button>
            <button
              onClick={() => setShowMissionControl(true)}
              className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium bg-linear-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-500 hover:to-indigo-500 transition-colors shadow-lg shadow-purple-500/25 h-[72px]"
            >
              <Rocket className="w-6 h-6 shrink-0" />
              <span className="text-center leading-tight text-xs truncate max-w-full">{t('layout.missionSidebar.missionControl')}</span>
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
            <div className="w-64 border-r border-border bg-secondary/20 flex flex-col overflow-hidden shrink-0">
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
                            <Bookmark className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
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
                          ? "bg-card text-foreground shadow-xs"
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
                          ? "bg-card text-foreground shadow-xs"
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
            {/* Back to missions list.
             * Always visible when an activeMission is set — this is the only
             * UI path that clears activeMission. Previously this was gated on
             * listTotalMissions > 1 (#6137), but that trapped users who
             * filtered via missionSearchQuery down to a single result with
             * no way to return to the full list (#6145). Safest fix: always
             * show the button when activeMission != null.
             * #10522 — Return to whichever panel view the user came from
             * (history list or CTA dashboard) rather than always resetting. */}
            {activeMission != null && (
              <button
                onClick={() => {
                  setActiveMission(null)
                  // Restore history panel state to match origin view
                  if (lastPanelView === 'history') {
                    setShowHistoryPanel(true)
                  }
                }}
                className="flex items-center gap-1 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-b border-border shrink-0"
              >
                <ChevronLeft className="w-3 h-3" />
                {t('missionSidebar.backToMissions', { count: listTotalMissions })}
              </button>
            )}
            <MissionChat
              key={activeMission?.id}
              mission={activeMission}
              isFullScreen={isFullScreen}
              onToggleFullScreen={() => setFullScreen(true)}
              onOpenOrbitDialog={(prefill) => {
                setOrbitDialogPrefill(prefill)
                setShowOrbitDialog(true)
              }}
            />
          </div>
        </div>
      ) : !showHistoryPanel ? (
        /* #10522 — Default dashboard view when history panel is hidden.
         * Prioritizes chat interface with quick-action buttons. The History
         * icon in the header toggles the full mission list. */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-400/60 mb-4" />
          <p className="text-foreground font-medium">{t('missionSidebar.readyToHelp', { defaultValue: 'Ready to help' })}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('missionSidebar.startMissionPrompt')}
          </p>
          <div className="grid grid-cols-3 gap-2 mt-4 w-full max-w-sm">
            {!showNewMission && (
              <button
                onClick={() => {
                  setLastPanelView('dashboard')
                  setShowNewMission(true)
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }}
                className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors h-[72px]"
              >
                <Sparkles className="w-6 h-6 shrink-0" />
                <span className="text-center leading-tight text-xs truncate max-w-full">{t('missionSidebar.startCustomMission')}</span>
              </button>
            )}
            <button
              onClick={() => setShowBrowser(true)}
              className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors h-[72px]"
            >
              <Globe className="w-6 h-6 shrink-0" />
              <span className="text-center leading-tight text-xs truncate max-w-full">{t('layout.missionSidebar.browseCommunityMissions')}</span>
            </button>
            <button
              onClick={() => setShowMissionControl(true)}
              className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium bg-linear-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-500 hover:to-indigo-500 transition-colors shadow-lg shadow-purple-500/25 h-[72px]"
            >
              <Rocket className="w-6 h-6 shrink-0" />
              <span className="text-center leading-tight text-xs truncate max-w-full">{t('layout.missionSidebar.missionControl')}</span>
            </button>
          </div>
          {/* Hint to open history when missions exist */}
          {listTotalMissions > 0 && (
            <button
              onClick={toggleHistoryPanel}
              className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-primary cursor-pointer hover:underline underline-offset-2 transition-colors rounded-md px-2 py-1 -mx-2 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
            >
              <History className="w-3.5 h-3.5" />
              {t('missionSidebar.viewHistory', {
                defaultValue: 'View {{count}} previous missions',
                count: listTotalMissions })}
            </button>
          )}
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
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary/50"
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
                    <Bookmark className="w-4 h-4 text-purple-400 shrink-0" />
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
                    <div className="flex items-center gap-1.5 shrink-0">
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
                    setLastPanelView('history')
                    // Always show the mission's chat first (#4549)
                    setActiveMission(mission.id)
                    // Also open Mission Control dialog for planning missions
                    if (mission.title === 'Mission Control Planning' || mission.context?.missionControl) {
                      setShowMissionControl(true)
                    }
                  }}
                  onDismiss={() => dismissMission(mission.id)}
                  onTerminate={() => cancelMission(mission.id)}
                  onRollback={handleRollback}
                  onExpand={() => {
                    setLastPanelView('history')
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
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
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
          onUseInMissionControl={(chartName: string) => {
            setShowBrowser(false)
            setPendingKubaraChart(chartName)
            setShowMissionControl(true)
          }}
        />
      </Suspense>

      {/* Mission Control Dialog */}
      <MissionControlDialog
        open={showMissionControl}
        onClose={() => {
          setShowMissionControl(false)
          setPendingKubaraChart(undefined)
          setPendingReviewPlan(undefined)
        }}
        initialKubaraChart={pendingKubaraChart}
        reviewPlanEncoded={pendingReviewPlan}
      />

      {/* Standalone Orbit Mission Dialog */}
      {showOrbitDialog && (
        <StandaloneOrbitDialog
          onClose={() => { setShowOrbitDialog(false); setOrbitDialogPrefill(undefined) }}
          prefill={orbitDialogPrefill}
        />
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

  // Blocked missions are stuck on preflight failure / missing credentials /
  // RBAC denial (#5933). `failed` is deliberately excluded (#7918): failed
  // missions are terminal and are filtered out of the active list by
  // `isActiveMission`, so including them here produced a badge count the
  // user could not reconcile with the visible active list.
  const needsAttention = missions.filter(m =>
    m.status === 'waiting_input' || m.status === 'blocked'
  ).length

  const runningCount = missions.filter(m => m.status === 'running').length
  /**
   * Active mission count — excludes saved/completed/failed/cancelled (#5947).
   * Previously this only filtered out 'saved' missions, which caused the
   * toggle-button badge to include terminal missions and overstate activity.
   */
  const activeCount = missions.filter(isActiveMission).length

  // Always show toggle when sidebar is closed (even with no missions)
  if (isSidebarOpen) {
    return null
  }

  return (
    <button
      onClick={openSidebar}
      data-tour="ai-missions-toggle"
      data-testid="mission-sidebar-toggle"
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
      ) : activeCount > 0 ? (
        <span className={isMobile ? 'text-xs' : 'text-sm'}>{t('missionSidebar.missionCount', { count: activeCount })}</span>
      ) : (
        <span className={isMobile ? 'text-xs' : 'text-sm'}>{t('missionSidebar.aiMissions')}</span>
      )}
      <ChevronRight className={cn(isMobile ? 'w-3 h-3' : 'w-4 h-4', isMobile && '-rotate-90')} />
    </button>
  )
}
