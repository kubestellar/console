import { useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react'
import { useSidebarResize } from './useSidebarResize'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { MissionResolution } from './MissionResolution'
import { MissionListPanel } from './MissionListPanel'
import { safeLazy } from '../../../lib/safeLazy'
import { ConfirmDialog, isAnyModalOpen } from '../../../lib/modals'
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
  Rocket,
  History } from 'lucide-react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
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
import { StandaloneOrbitDialog } from '../../missions/StandaloneOrbitDialog'
import { MissionChat } from './MissionChat'
import { ClusterSelectionDialog } from '../../missions/ClusterSelectionDialog'
import { SaveResolutionDialog } from '../../missions/SaveResolutionDialog'
import { useResolutions, detectIssueSignature, type Resolution } from '../../../hooks/useResolutions'
import { useTranslation } from 'react-i18next'
import { SAVED_TOAST_MS, FOCUS_DELAY_MS } from '../../../lib/constants/network'
import { MISSION_FILE_FETCH_TIMEOUT_MS } from '../../missions/browser/missionCache'
import { isDemoMode } from '../../../lib/demoMode'
import { ROUTES } from '../../../config/routes'

const ATTENTION_MISSION_STATUSES: ReadonlySet<Mission['status']> = new Set(['waiting_input', 'blocked'])
const BACKGROUND_EXECUTION_STATUSES: ReadonlySet<Mission['status']> = new Set(['pending', 'running', 'cancelling'])
const BACKGROUND_MISSION_PREVIEW_LIMIT = 3
const MISSION_BROWSER_QUERY_KEY = 'browse'
const MISSION_BROWSER_QUERY_VALUE = 'missions'
const MISSION_DEEP_LINK_QUERY_KEY = 'mission'
const MISSION_VIEW_QUERY_KEY = 'view'
const MISSION_CHAT_VIEW = 'chat'
const MISSION_IMPORT_QUERY_KEY = 'import'
const MISSION_CONTROL_QUERY_KEY = 'mission-control'
const MISSION_PLAN_QUERY_KEY = 'plan'
const MISSION_BROWSER_HISTORY_STATE_KEY = 'kscMissionBrowserOpen'
const FULLSCREEN_KNOWLEDGE_PANEL_WIDTH_CLASS = 'w-80 xl:w-96'
const MISSION_CONTROL_BUTTON_CLASSES = 'appearance-none isolate overflow-hidden border border-transparent bg-linear-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25 hover:from-purple-500 hover:to-indigo-500'

function getMissionAttentionCount(missions: Mission[]): number {
  return missions.filter(mission => ATTENTION_MISSION_STATUSES.has(mission.status)).length
}

function matchesMissionSearch(mission: Mission, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  return mission.title.toLowerCase().includes(normalizedQuery) || mission.description.toLowerCase().includes(normalizedQuery)
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
  const { sidebarWidth, isResizing, isTablet, handleResizeStart } = useSidebarResize()

  // Track tablet range (>= mobile but < lg). In this range the sidebar is
  // rendered as an overlay that does NOT push main content — pushing at
  // tablet widths squeezes main below the sidebar min width and can cause
  // ~10px content overlap (issue 6388).

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

  const [showNewMission, setShowNewMission] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showMissionControl, setShowMissionControl] = useState(false)
  /** Increments when sidebar CTAs should force a brand-new Mission Control session. */
  const [missionControlFreshSessionToken, setMissionControlFreshSessionToken] = useState<number | undefined>(undefined)
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
  const [pendingDismissMissionId, setPendingDismissMissionId] = useState<string | null>(null)
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
      ...(activeMission.messages || []).slice(0, 3).map(m => m.content),
    ].join('\n')
    const signature = detectIssueSignature(content)
    if (!signature.type || signature.type === 'Unknown') return []
    return findSimilarResolutions(signature as { type: string }, { minSimilarity: 0.4, limit: 5 })
  })()

  const handleApplyResolution = (resolution: Resolution) => {
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
    const stepsText = (resolution.resolution.steps || []).length > 0
      ? `\n\nSteps:\n${(resolution.resolution.steps || []).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`
      : ''
    const applyMessage = `Please apply this saved resolution:\n\n**${resolution.title}**\n\n${resolution.resolution.summary}${stepsText}${resolution.resolution.yaml ? `\n\nYAML:\n\`\`\`yaml\n${resolution.resolution.yaml}\n\`\`\`` : ''}`
    sendMessage(activeMission.id, applyMessage)
  }

  // Deep-link: open MissionBrowser via ?mission= (specific) or ?browse=missions (explorer)
  // Deep-link: open MissionControlDialog via ?mission-control=open (#6474)
  // Direct import: ?import= fetches and imports mission directly (no browser popup)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const browserHistoryEntryRef = useRef(false)
  const deepLinkMission = searchParams.get(MISSION_DEEP_LINK_QUERY_KEY)
  const missionViewParam = searchParams.get(MISSION_VIEW_QUERY_KEY)
  const directImportSlug = searchParams.get(MISSION_IMPORT_QUERY_KEY)
  const browseParam = searchParams.get(MISSION_BROWSER_QUERY_KEY)
  const missionControlParam = searchParams.get(MISSION_CONTROL_QUERY_KEY)
  const isMissionBrowserRoute = location.pathname === ROUTES.MISSIONS
  const isMissionChatView = missionViewParam === MISSION_CHAT_VIEW
  const fullScreenMissionFromUrl = isMissionChatView && deepLinkMission
    ? missions.find(mission => mission.id === deepLinkMission) || null
    : null
  const isMissionBrowserDeepLink = !isMissionChatView && (Boolean(deepLinkMission) || browseParam === MISSION_BROWSER_QUERY_VALUE || isMissionBrowserRoute)
  /** Mission pre-fetched by MissionLandingPage and passed via navigation state */
  const prefetchedMission = (location.state as { prefetchedMission?: MissionExport } | null)?.prefetchedMission

  const getMissionBrowserSearchParams = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete(MISSION_DEEP_LINK_QUERY_KEY)
    nextParams.delete(MISSION_BROWSER_QUERY_KEY)
    return nextParams
  }

  const openMissionBrowser = () => {
    if (typeof window !== 'undefined' && !isMissionBrowserDeepLink && !browserHistoryEntryRef.current) {
      const currentState = window.history.state
      const nextState = currentState && typeof currentState === 'object'
        ? { ...(currentState as Record<string, unknown>), [MISSION_BROWSER_HISTORY_STATE_KEY]: true }
        : { [MISSION_BROWSER_HISTORY_STATE_KEY]: true }
      window.history.pushState(nextState, '', window.location.href)
      browserHistoryEntryRef.current = true
    }
    setShowBrowser(true)
  }

  const closeMissionBrowser = () => {
    if (isMissionBrowserRoute) {
      const nextParams = getMissionBrowserSearchParams()
      const nextSearch = nextParams.toString()
      setShowBrowser(false)
      navigate({ pathname: ROUTES.HOME, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
      return
    }
    if (isMissionBrowserDeepLink) {
      setShowBrowser(false)
      setSearchParams(getMissionBrowserSearchParams(), { replace: true })
      return
    }
    if (browserHistoryEntryRef.current && typeof window !== 'undefined') {
      window.history.back()
      return
    }
    setShowBrowser(false)
  }

  const openFreshMissionControl = useCallback(() => {
    setPendingKubaraChart(undefined)
    setPendingReviewPlan(undefined)
    setMissionControlFreshSessionToken((prev) => (prev ?? 0) + 1)
    setShowMissionControl(true)
  }, [])

  const openExistingMissionControl = useCallback(() => {
    setPendingKubaraChart(undefined)
    setPendingReviewPlan(undefined)
    setMissionControlFreshSessionToken(undefined)
    setShowMissionControl(true)
  }, [])

  useEffect(() => {
    if (isMissionBrowserDeepLink) {
      setShowBrowser(true)
    }
  }, [isMissionBrowserDeepLink])

  useEffect(() => {
    if (!isMissionChatView) return

    if (!fullScreenMissionFromUrl) {
      if (deepLinkMission) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete(MISSION_DEEP_LINK_QUERY_KEY)
        nextParams.delete(MISSION_VIEW_QUERY_KEY)
        setSearchParams(nextParams, { replace: true })
      }
      return
    }

    // Hydrate sidebar state from URL once when view=chat is present.
    // Deps are limited to URL-derived values only — including isSidebarOpen,
    // isSidebarMinimized, isFullScreen, or activeMission?.id would make this
    // effect re-run after user-initiated close/minimize/back actions and undo
    // them while the URL still shows view=chat (#13149).
    setActiveMission(fullScreenMissionFromUrl.id)
    openSidebar() // also clears isSidebarMinimized
    setFullScreen(true)
  }, [
    deepLinkMission,
    fullScreenMissionFromUrl,
    isMissionChatView,
    openSidebar,
    searchParams,
    setActiveMission,
    setFullScreen,
    setSearchParams,
  ])

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)

    if (isFullScreen && activeMission) {
      nextParams.set(MISSION_DEEP_LINK_QUERY_KEY, activeMission.id)
      nextParams.set(MISSION_VIEW_QUERY_KEY, MISSION_CHAT_VIEW)
    } else if (searchParams.get(MISSION_VIEW_QUERY_KEY) === MISSION_CHAT_VIEW) {
      nextParams.delete(MISSION_VIEW_QUERY_KEY)
      if (!activeMission || searchParams.get(MISSION_DEEP_LINK_QUERY_KEY) === activeMission.id) {
        nextParams.delete(MISSION_DEEP_LINK_QUERY_KEY)
      }
    } else {
      return
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [activeMission, isFullScreen, searchParams, setSearchParams])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      if (!showBrowser) return
      browserHistoryEntryRef.current = false
      setShowBrowser(false)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [showBrowser])

  // #6474 — ?mission-control=open opens the MissionControlDialog.
  // Parallel to the ?browse=missions deep-link above. Gives users a
  // shareable URL and makes Missions.spec.ts e2e tests actually work.
  useEffect(() => {
    if (missionControlParam === 'open') {
      openFreshMissionControl()
      const newParams = new URLSearchParams(searchParams)
      newParams.delete(MISSION_CONTROL_QUERY_KEY)
      setSearchParams(newParams, { replace: true })
    } else if (missionControlParam === 'review') {
      const planParam = searchParams.get(MISSION_PLAN_QUERY_KEY)
      if (planParam) {
        setPendingKubaraChart(undefined)
        setPendingReviewPlan(planParam)
        setMissionControlFreshSessionToken(undefined)
        setShowMissionControl(true)
      }
      const newParams = new URLSearchParams(searchParams)
      newParams.delete(MISSION_CONTROL_QUERY_KEY)
      newParams.delete(MISSION_PLAN_QUERY_KEY)
      setSearchParams(newParams, { replace: true })
    }
  }, [missionControlParam, openFreshMissionControl, searchParams, setSearchParams])

  // Direct import from landing page — fetch mission content and import it
  // without opening the MissionBrowser dialog
  useEffect(() => {
    if (!directImportSlug) return

    // Clear the param immediately to prevent re-triggering
    const newParams = new URLSearchParams(searchParams)
    newParams.delete(MISSION_IMPORT_QUERY_KEY)
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
      openMissionBrowser()
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
  const normalizedMissionSearchQuery = missionSearchQuery.trim().toLowerCase()
  const savedMissions = useMemo(
    () => (missions || []).filter(m => m.status === 'saved' && matchesMissionSearch(m, normalizedMissionSearchQuery)),
    [missions, normalizedMissionSearchQuery]
  )
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
  const activeMissions = useMemo(
    () => (missions || [])
      .filter(m => m.status !== 'saved' && matchesMissionSearch(m, normalizedMissionSearchQuery))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [missions, normalizedMissionSearchQuery]
  )

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
  const savedMissionToExport = useCallback((m: Mission): MissionExport => ({
    version: '1.0',
    title: m.importedFrom?.title || m.title,
    description: m.importedFrom?.description || m.description,
    type: m.type,
    tags: m.importedFrom?.tags || [],
    missionClass: m.importedFrom?.missionClass as MissionExport['missionClass'],
    cncfProject: m.importedFrom?.cncfProject,
    steps: (m.importedFrom?.steps || []).map(s => ({
      title: s.title,
      description: s.description })) }), [])

  const handleViewSavedMission = useCallback((m: Mission) => {
    setViewingMission(savedMissionToExport(m))
    setViewingMissionRaw(false)
  }, [savedMissionToExport])

  // Run mission — in demo mode (Netlify), block and open the install dialog instead.
  // For install/deploy types in live mode, show cluster picker first.
  const handleRunMission = useCallback((missionId: string) => {
    if (isDemoMode()) {
      window.dispatchEvent(new CustomEvent('open-install'))
      return
    }
    const mission = (missions || []).find(m => m.id === missionId)
    const isInstall = mission?.importedFrom?.missionClass === 'install' || mission?.type === 'deploy'
    if (isInstall) {
      setPendingRunMissionId(missionId)
    } else {
      runSavedMission(missionId)
    }
  }, [missions, runSavedMission])

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
  const needsAttention = getMissionAttentionCount(missions)

  const runningMissions = missions
    .filter(mission => BACKGROUND_EXECUTION_STATUSES.has(mission.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const runningMissionPreview = runningMissions.slice(0, BACKGROUND_MISSION_PREVIEW_LIMIT)
  const runningCount = missions.filter(m => m.status === 'running').length
  const getRunningMissionStatusLabel = (status: Mission['status']) => {
    switch (status) {
      case 'pending':
        return t('missionSidebar.statusLabels.pending', { defaultValue: 'Starting…' })
      case 'cancelling':
        return t('missionSidebar.statusLabels.cancelling', { defaultValue: 'Cancelling…' })
      case 'running':
      default:
        return t('missionSidebar.statusLabels.running', { defaultValue: 'Running' })
    }
  }

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

  const sidebarSavedMissionItems = useMemo(() => savedMissions.map(m => (
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
          onClick={(e) => { e.stopPropagation(); setPendingDismissMissionId(m.id) }}
          className="p-1.5 text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
          title={t('layout.missionSidebar.removeFromLibrary')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )), [handleRunMission, handleViewSavedMission, savedMissions, t])

  const shouldRenderMinimizedSidebar = isSidebarOpen && isSidebarMinimized && !isMobile
  const shouldRenderExpandedSidebar = isSidebarOpen && !isSidebarMinimized

  // Minimized sidebar view (thin strip) - desktop only
  if (shouldRenderMinimizedSidebar) {
    return (
      <div
        className={cn(
        "fixed top-16 right-0 bottom-0 w-12 bg-card/95 backdrop-blur-xs border-l border-border shadow-xl z-sidebar flex flex-col items-center py-4",
        "transition-transform duration-300 ease-in-out"
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
      {shouldRenderExpandedSidebar && (
        <>
          {/* Mobile backdrop */}
          {/* issue 6742 — tabIndex=-1 removes the backdrop from the Tab order, aria-hidden
              hides it from assistive tech. The sidebar itself handles close semantics. */}
          {isMobile && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-overlay md:hidden"
              onClick={closeSidebar}
              tabIndex={-1}
              aria-hidden="true"
            />
          )}
          {/* Tablet backdrop — the sidebar renders as an overlay at < lg so main
              content isn't squeezed. A tap-out backdrop mirrors mobile UX (issue 6388). */}
          {!isMobile && isTablet && !isFullScreen && (
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
              "fixed bg-card border-border flex min-h-0 flex-col overflow-hidden shadow-2xl",
              isMobile ? "z-modal" : "z-sidebar",
              !isResizing && "transition-[width,top,border,transform] duration-300 ease-in-out",
              // Mobile: bottom sheet
              // vh fallback before dvh so browsers without dynamic-viewport-unit
              // support still cap the sheet height (#6548).
              isMobile && "inset-x-0 bottom-0 rounded-t-2xl border-t max-h-[80vh] max-h-[80dvh] translate-y-0",
              // Desktop: right sidebar
              !isMobile && isFullScreen && "inset-0 top-16 border-l-0 rounded-none",
              !isMobile && !isFullScreen && "top-16 right-0 bottom-0 border-l shadow-xl"
            )}
            style={!isMobile && !isFullScreen ? { width: sidebarWidth } : undefined}
          >
      {/* Desktop resize handle (left edge) */}
      {!isMobile && !isFullScreen && isSidebarOpen && (
        <SidebarResizeHandle
          onResizeStart={handleResizeStart}
          label={t('missionSidebar.resizeHandleTooltip')}
        />
      )}

      {/* Mobile drag handle */}
      {isMobile && (
        <div className="flex justify-center py-2 md:hidden">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 p-3 md:p-4 border-b border-border min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <LogoWithStar className="w-5 h-5 shrink-0" />
          <h2 className="font-semibold text-foreground text-sm md:text-base truncate">{t('missionSidebar.aiMissions')}</h2>
          {needsAttention > 0 && (
            <StatusBadge color="purple" rounded="full">{needsAttention}</StatusBadge>
          )}
        </div>
        {/* Toolbar and window controls — split so close/minimize never overflow */}
        <div className="flex items-center gap-1.5 shrink-0" role="toolbar" aria-label={t('missionSidebar.headerActions', { defaultValue: 'Mission panel actions' })}>
          {/* + button with dropdown — outside overflow-hidden so the dropdown isn't clipped */}
          <div className="relative mr-1 shrink-0" ref={addMenuRef}>
            <button
              type="button"
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
                  type="button"
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
                  type="button"
                  onClick={() => { setShowAddMenu(false); openMissionBrowser() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                >
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  Browse Community
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddMenu(false); openFreshMissionControl() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                >
                  <Rocket className="w-4 h-4 text-muted-foreground" />
                  Mission Control
                </button>
                {/* History toggle on mobile — desktop uses a standalone icon button (#10522) */}
                {isMobile && listTotalMissions > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMenu(false)
                      if (activeMission) {
                        setActiveMission(null)
                        setShowHistoryPanel(true)
                      } else {
                        toggleHistoryPanel()
                      }
                    }}
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
              onClick={() => {
                if (activeMission) {
                  // In chat mode the history panel is hidden behind the chat view;
                  // navigate back to the list and open history so the click is visible.
                  setActiveMission(null)
                  setShowHistoryPanel(true)
                } else {
                  toggleHistoryPanel()
                }
              }}
              className={cn(
                "relative p-1.5 rounded transition-colors ring-1 mr-1 shrink-0",
                showHistoryPanel && !activeMission
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
          {/* Optional toolbar buttons — keep the selector fully visible while the title truncates first */}
          <div className="flex items-center gap-1 min-w-0 shrink-0">
            <AgentSelector compact={!isFullScreen} className="shrink-0" />
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

      {runningMissions.length > 0 && !activeMission && !showHistoryPanel && (
        <div className="mx-3 mt-2 rounded-lg border border-primary/30 bg-primary/10 p-3">
          <div className="flex items-start gap-2">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {t('missionSidebar.backgroundMissionsRunning', { count: runningMissions.length })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('missionSidebar.backgroundMissionsHint', { defaultValue: 'Missions keep running even if you close Mission Control or this panel. Open history to follow live status and progress.' })}
              </p>
              <div className="mt-3 space-y-2">
                {runningMissionPreview.map((mission) => (
                  <button
                    key={mission.id}
                    type="button"
                    onClick={() => {
                      setLastPanelView('history')
                      setActiveMission(mission.id)
                    }}
                    className="w-full rounded-md border border-primary/20 bg-background/60 px-2.5 py-2 text-left transition-colors hover:bg-background"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">{mission.title}</span>
                      <span className="shrink-0 text-2xs text-primary">{getRunningMissionStatusLabel(mission.status)}</span>
                    </div>
                    <p className="mt-1 truncate text-2xs text-muted-foreground">{mission.currentStep || mission.description}</p>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-2xs text-muted-foreground">
                  {runningMissions.length > BACKGROUND_MISSION_PREVIEW_LIMIT
                    ? t('missionSidebar.moreRunningMissions', {
                        count: runningMissions.length - BACKGROUND_MISSION_PREVIEW_LIMIT,
                        defaultValue: '+{{count}} more running in history',
                      })
                    : t('missionSidebar.backgroundMissionsPersist', {
                        defaultValue: 'Closing this view will not stop the running missions.',
                      })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLastPanelView('history')
                    setShowHistoryPanel(true)
                  }}
                  className="shrink-0 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                  {t('missionSidebar.viewRunningMissions', { defaultValue: 'View running missions' })}
                </button>
              </div>
            </div>
          </div>
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
          <div className="flex flex-col gap-2.5 mt-5 w-full max-w-xs">
            {!showNewMission && (
              <button
                type="button"
                onClick={() => {
                  setShowNewMission(true)
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }}
                className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Sparkles className="w-5 h-5 shrink-0" />
                <span className="text-left leading-snug">{t('missionSidebar.startCustomMission')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openMissionBrowser()}
              className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
            >
              <Globe className="w-5 h-5 shrink-0" />
              <span className="text-left leading-snug">{t('layout.missionSidebar.browseCommunityMissions')}</span>
            </button>
            <button
              type="button"
              onClick={openFreshMissionControl}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                MISSION_CONTROL_BUTTON_CLASSES
              )}
            >
              <Rocket className="w-5 h-5 shrink-0" />
              <span className="text-left leading-snug">{t('layout.missionSidebar.missionControl')}</span>
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
            <MissionResolution
              savedMissions={savedMissions}
              relatedResolutions={relatedResolutions}
              allResolutionsCount={allResolutions.length}
              resolutionPanelView={resolutionPanelView}
              onSetResolutionPanelView={setResolutionPanelView}
              onApplyResolution={handleApplyResolution}
              onSaveNewResolution={() => setShowSaveResolutionDialog(true)}
              onViewMission={handleViewSavedMission}
              onRunMission={handleRunMission}
              onRemoveMission={(id) => setPendingDismissMissionId(id)}
              panelWidthClass={FULLSCREEN_KNOWLEDGE_PANEL_WIDTH_CLASS}
            />
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
          <div className="mt-4 grid w-full max-w-sm grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2">
            {!showNewMission && (
              <button
                type="button"
                onClick={() => {
                  setLastPanelView('dashboard')
                  setShowNewMission(true)
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }}
                className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Sparkles className="h-6 w-6 shrink-0" />
                <span className="max-w-full text-center text-xs leading-tight whitespace-normal break-words">{t('missionSidebar.startCustomMission')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openMissionBrowser()}
              className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              <Globe className="h-6 w-6 shrink-0" />
              <span className="max-w-full text-center text-xs leading-tight whitespace-normal break-words">{t('layout.missionSidebar.browseCommunityMissions')}</span>
            </button>
            <button
              type="button"
              onClick={openFreshMissionControl}
              className={cn(
                'flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                MISSION_CONTROL_BUTTON_CLASSES
              )}
            >
              <Rocket className="h-6 w-6 shrink-0" />
              <span className="max-w-full text-center text-xs leading-tight whitespace-normal break-words">{t('layout.missionSidebar.missionControl')}</span>
            </button>
          </div>
          {/* Hint to open history when missions exist */}
          {listTotalMissions > 0 && (
            <button
              type="button"
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
        <MissionListPanel
          missions={missions}
          savedMissions={savedMissions}
          activeMissions={activeMissions}
          visibleActiveMissions={visibleActiveMissions}
          hasMoreMissions={hasMoreMissions}
          visibleMissionCount={visibleMissionCount}
          onLoadMore={() => setVisibleMissionCount(prev => prev + MISSIONS_PAGE_SIZE)}
          missionSearchQuery={missionSearchQuery}
          onSearchChange={setMissionSearchQuery}
          collapsedMissions={collapsedMissions}
          onToggleCollapse={toggleMissionCollapse}
          onSelectMission={(id) => {
            setLastPanelView('history')
            setActiveMission(id)
          }}
          onDismissMission={dismissMission}
          onCancelMission={cancelMission}
          onExpandMission={(id) => {
            setLastPanelView('history')
            setActiveMission(id)
            setFullScreen(true)
          }}
          onRollback={handleRollback}
          onOpenMissionControl={openExistingMissionControl}
          onOpenOrbitDialog={() => setShowOrbitDialog(true)}
          onRunSavedMission={runSavedMission}
          isFullScreen={isFullScreen}
          savedMissionItems={sidebarSavedMissionItems}
        />
      )}
          </div>
        </>
      )}

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
          onClose={closeMissionBrowser}
          onImport={handleImportMission}
          initialMission={deepLinkMission || undefined}
          onUseInMissionControl={(chartName: string) => {
            closeMissionBrowser()
            setPendingKubaraChart(chartName)
            setPendingReviewPlan(undefined)
            setMissionControlFreshSessionToken(undefined)
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
          setMissionControlFreshSessionToken(undefined)
        }}
        initialKubaraChart={pendingKubaraChart}
        reviewPlanEncoded={pendingReviewPlan}
        freshSessionToken={missionControlFreshSessionToken}
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
          onSaved={() => setResolutionPanelView('history')}
        />
      )}
      <ConfirmDialog
        isOpen={pendingDismissMissionId !== null}
        onClose={() => setPendingDismissMissionId(null)}
        onConfirm={() => {
          if (pendingDismissMissionId) dismissMission(pendingDismissMissionId)
          setPendingDismissMissionId(null)
        }}
        title={t('layout.missionSidebar.deleteMission')}
        message={t('layout.missionSidebar.deleteMissionConfirm')}
        confirmLabel={t('common.delete')}
        variant="danger"
      />
    </>
  )
}

// Toggle button for the sidebar (shown when sidebar is closed)
export function MissionSidebarToggle() {
  const { t } = useTranslation(['common'])
  const { missions, isSidebarOpen, openSidebar } = useMissions()
  const { isMobile } = useMobile()
  const needsAttention = getMissionAttentionCount(missions)
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
      type="button"
      onClick={openSidebar}
      data-tour="ai-missions-toggle"
      data-testid="mission-sidebar-toggle"
      className={cn(
        'fixed flex items-center gap-2 rounded-full border border-border bg-card text-foreground shadow-lg transition-all z-50 hover:bg-secondary',
        // Mobile: smaller padding, bottom right
        isMobile ? 'px-3 py-2 right-4 bottom-4' : 'px-4 py-3 right-4 bottom-4',
        needsAttention > 0 && 'ring-2 ring-purple-500/30'
      )}
      title={t('missionSidebar.openAIMissions')}
    >
      <LogoWithStar className={cn(isMobile ? 'w-4 h-4' : 'w-5 h-5', needsAttention > 0 && 'text-purple-400')} />
      {runningCount > 0 && (
        <Loader2 className={isMobile ? 'w-3 h-3 animate-spin text-purple-400' : 'w-4 h-4 animate-spin text-purple-400'} />
      )}
      <span className={cn(isMobile ? 'text-xs' : 'text-sm', needsAttention > 0 && 'font-medium')}>
        {activeCount > 0 ? t('missionSidebar.missionCount', { count: activeCount }) : t('missionSidebar.aiMissions')}
      </span>
      {needsAttention > 0 && (
        <StatusBadge color="purple" size={isMobile ? 'xs' : 'sm'} variant="solid" rounded="full">
          {needsAttention}
        </StatusBadge>
      )}
      <ChevronRight className={cn(isMobile ? 'w-3 h-3' : 'w-4 h-4', isMobile && '-rotate-90', needsAttention > 0 && 'text-purple-400')} />
    </button>
  )
}
