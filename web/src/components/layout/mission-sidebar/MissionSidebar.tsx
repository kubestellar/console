import { useState, useEffect, useRef, useCallback } from 'react'
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
  MessageSquarePlus,
  Send,
  Globe,
  Bookmark,
  Play,
  Trash2,
  CheckCircle2,
  Eye,
  ShieldOff,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useMissions } from '../../../hooks/useMissions'
import { useMobile } from '../../../hooks/useMobile'
import { StatusBadge } from '../../ui/StatusBadge'
import { cn } from '../../../lib/cn'
import { AgentSelector } from '../../agent/AgentSelector'
import { AgentIcon } from '../../agent/AgentIcon'
import { MissionBrowser } from '../../missions/MissionBrowser'
import { MissionDetailView } from '../../missions/MissionDetailView'
import type { MissionExport } from '../../../lib/missions/types'
import type { Mission } from '../../../hooks/useMissions'
import type { FontSize } from './types'
import { MissionListItem } from './MissionListItem'
import { MissionChat } from './MissionChat'
import { ClusterSelectionDialog } from '../../missions/ClusterSelectionDialog'
import { useTranslation } from 'react-i18next'
import { SAVED_TOAST_MS, FOCUS_DELAY_MS } from '../../../lib/constants/network'

export function MissionSidebar() {
  const { t } = useTranslation(['common'])
  const { missions, activeMission, isSidebarOpen, isSidebarMinimized, isFullScreen, setActiveMission, closeSidebar, dismissMission, minimizeSidebar, expandSidebar, setFullScreen, selectedAgent, startMission, saveMission, runSavedMission, openSidebar } = useMissions()
  const { isMobile } = useMobile()
  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(new Set())
  const [fontSize, setFontSize] = useState<FontSize>('base')
  const [showNewMission, setShowNewMission] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [newMissionPrompt, setNewMissionPrompt] = useState('')
  const [showSavedToast, setShowSavedToast] = useState<string | null>(null)
  /** Countdown seconds remaining for the saved-mission toast */
  const [toastCountdown, setToastCountdown] = useState(0)
  const [viewingMission, setViewingMission] = useState<MissionExport | null>(null)
  const [viewingMissionRaw, setViewingMissionRaw] = useState(false)
  const newMissionInputRef = useRef<HTMLTextAreaElement>(null)
  // Cluster selection for install missions
  const [pendingRunMissionId, setPendingRunMissionId] = useState<string | null>(null)

  // Deep-link: open MissionBrowser via ?mission= (specific) or ?browse=missions (explorer)
  // Direct import: ?import= fetches and imports mission directly (no browser popup)
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkMission = searchParams.get('mission')
  const directImportSlug = searchParams.get('import')
  const browseParam = searchParams.get('browse')

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

    // Fetch and import the mission in the background
    const paths = [
      `solutions/security/${directImportSlug}.json`,
      `solutions/cncf-generated/${directImportSlug}.json`,
      `solutions/${directImportSlug}.json`,
      `solutions/platform/${directImportSlug}.json`,
      `solutions/install/${directImportSlug}.json`,
    ]

    const tryImport = async () => {
      for (const path of paths) {
        try {
          const res = await fetch(`/api/missions/file?path=${encodeURIComponent(path)}`)
          if (!res.ok) continue
          const raw = await res.text()
          const parsed = JSON.parse(raw)
          const { validateMissionExport } = await import('../../../lib/missions/types')
          const result = validateMissionExport(parsed)
          if (result.valid) {
            handleImportMission(result.data)
            return
          }
        } catch {
          continue
        }
      }
      // Fallback: open the browser if direct import failed
      setShowBrowser(true)
    }

    tryImport()
  }, [directImportSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Split missions into saved (library) and active
  const savedMissions = missions.filter(m => m.status === 'saved')
  const activeMissions = missions.filter(m => m.status !== 'saved')

  const handleImportMission = useCallback((mission: MissionExport) => {
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
      initialPrompt: mission.resolution?.summary || mission.description,
    })
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
      const interval = setInterval(() => {
        setToastCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
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
  }, [saveMission, openSidebar, setActiveMission])

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
      description: s.description,
    })),
  }), [])

  const handleViewSavedMission = useCallback((m: Mission) => {
    setViewingMission(savedMissionToExport(m))
    setViewingMissionRaw(false)
  }, [savedMissionToExport])

  // Run mission — for install/deploy types, show cluster picker first
  const handleRunMission = useCallback((missionId: string) => {
    const mission = missions.find(m => m.id === missionId)
    const isInstall = mission?.importedFrom?.missionClass === 'install' || mission?.type === 'deploy'
    if (isInstall) {
      setPendingRunMissionId(missionId)
    } else {
      runSavedMission(missionId)
    }
  }, [missions, runSavedMission])

  const pendingMission = pendingRunMissionId ? missions.find(m => m.id === pendingRunMissionId) : null

  // Escape key: exit fullscreen first, then close sidebar
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullScreen) {
          setFullScreen(false)
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

  // Helper to get provider string for AgentIcon
  const getAgentProvider = (agent: string | null | undefined) => {
    switch (agent) {
      case 'claude': return 'anthropic'
      case 'openai': return 'openai'
      case 'gemini': return 'google'
      case 'bob': return 'bob'
      case 'claude-code': return 'anthropic-local'
      default: return agent || 'anthropic'
    }
  }

  // Minimized sidebar view (thin strip) - desktop only
  if (isSidebarMinimized && !isMobile) {
    return (
      <div className={cn(
        "fixed top-16 right-0 bottom-0 w-12 bg-card/95 backdrop-blur-sm border-l border-border shadow-xl z-40 flex flex-col items-center py-4",
        "transition-transform duration-300 ease-in-out",
        !isSidebarOpen && "translate-x-full pointer-events-none"
      )}>
        <button
          onClick={expandSidebar}
          className="p-2 hover:bg-secondary rounded transition-colors mb-4"
          title={t('missionSidebar.expandSidebar')}
        >
          <PanelRightOpen className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="flex flex-col items-center gap-2">
          <AgentIcon provider={getAgentProvider(selectedAgent)} className="w-5 h-5 text-primary" />
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
          "transition-[width,top,border,transform] duration-300 ease-in-out",
          // Mobile: bottom sheet
          isMobile && "inset-x-0 bottom-0 rounded-t-2xl border-t max-h-[80vh]",
          isMobile && !isSidebarOpen && "translate-y-full pointer-events-none",
          isMobile && isSidebarOpen && "translate-y-0",
          // Desktop: right sidebar
          !isMobile && isFullScreen && "inset-0 top-16 border-l-0 rounded-none",
          !isMobile && !isFullScreen && "top-16 right-0 bottom-0 w-[680px] border-l shadow-xl",
          !isMobile && !isSidebarOpen && "translate-x-full pointer-events-none"
        )}
      >
      {/* Mobile drag handle */}
      {isMobile && (
        <div className="flex justify-center py-2 md:hidden">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <AgentIcon provider={getAgentProvider(selectedAgent)} className="w-5 h-5" />
          <h2 className="font-semibold text-foreground text-sm md:text-base">{t('missionSidebar.aiMissions')}</h2>
          {needsAttention > 0 && (
            <StatusBadge color="purple" rounded="full">{needsAttention}</StatusBadge>
          )}
        </div>
        {/* Agent Selector */}
        <div className="flex items-center gap-2">
          {/* New Mission Button */}
          <button
            onClick={() => {
              setShowNewMission(!showNewMission)
              if (!showNewMission) {
                setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
              }
            }}
            className={cn(
              "p-1.5 rounded transition-colors",
              showNewMission
                ? "bg-primary text-primary-foreground"
                : "hover:bg-secondary text-muted-foreground hover:text-foreground"
            )}
            title={t('missionSidebar.startNewMission')}
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
          {/* Browse Community Missions */}
          <button
            onClick={() => setShowBrowser(true)}
            className="p-1.5 rounded transition-colors hover:bg-secondary text-muted-foreground hover:text-foreground"
            title="Browse community missions"
          >
            <Globe className="w-4 h-4" />
          </button>
          <AgentSelector compact={!isFullScreen} />
          {/* Font size controls */}
          <div className="flex items-center gap-1 border border-border rounded-lg px-1">
            <button
              onClick={() => setFontSize(prev => prev === 'base' ? 'sm' : prev === 'lg' ? 'base' : 'sm')}
              disabled={fontSize === 'sm'}
              className="p-1 hover:bg-secondary rounded transition-colors disabled:opacity-30"
              title={t('missionSidebar.decreaseFontSize')}
            >
              <Minus className="w-3 h-3 text-muted-foreground" />
            </button>
            <Type className="w-3 h-3 text-muted-foreground" />
            <button
              onClick={() => setFontSize(prev => prev === 'sm' ? 'base' : prev === 'base' ? 'lg' : 'lg')}
              disabled={fontSize === 'lg'}
              className="p-1 hover:bg-secondary rounded transition-colors disabled:opacity-30"
              title={t('missionSidebar.increaseFontSize')}
            >
              <Plus className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          {/* Fullscreen and minimize - desktop only */}
          {!isMobile && (isFullScreen ? (
            <button
              onClick={() => setFullScreen(false)}
              className="p-1 hover:bg-secondary rounded transition-colors"
              title={t('missionSidebar.exitFullScreen')}
            >
              <Minimize2 className="w-5 h-5 text-muted-foreground" />
            </button>
          ) : (
            <>
              <button
                onClick={() => setFullScreen(true)}
                className="p-1 hover:bg-secondary rounded transition-colors"
                title={t('missionSidebar.fullScreen')}
              >
                <Maximize2 className="w-5 h-5 text-muted-foreground" />
              </button>
              <button
                onClick={minimizeSidebar}
                className="p-1 hover:bg-secondary rounded transition-colors"
                title={t('missionSidebar.minimizeSidebar')}
              >
                <PanelRightClose className="w-5 h-5 text-muted-foreground" />
              </button>
            </>
          ))}
          <button
            onClick={closeSidebar}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title={t('missionSidebar.closeSidebar')}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
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
                    initialPrompt: newMissionPrompt,
                  })
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
                      })
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
            <p className="text-sm font-medium text-green-400">Mission imported</p>
            {toastCountdown > 0 && (
              <span className="text-2xs text-green-400/40 ml-auto">{toastCountdown}s</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mb-2">{showSavedToast}</p>
          {toastCountdown > 0 && (
            <p className="text-2xs text-muted-foreground/70 mb-2">
              Your mission is ready. Click <strong className="text-foreground">Run</strong> below to start, or view its steps first.
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

      {missions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <AgentIcon provider={getAgentProvider(selectedAgent)} className="w-12 h-12 opacity-50 mb-4" />
          <p className="text-muted-foreground">{t('missionSidebar.noActiveMissions')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('missionSidebar.startMissionPrompt')}
          </p>
          <div className="flex items-center gap-2 mt-4">
            {!showNewMission && (
              <button
                onClick={() => {
                  setShowNewMission(true)
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <MessageSquarePlus className="w-4 h-4" />
                {t('missionSidebar.startCustomMission')}
              </button>
            )}
            <button
              onClick={() => setShowBrowser(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
            >
              <Globe className="w-4 h-4" />
              Browse Missions
            </button>
          </div>
        </div>
      ) : activeMission ? (
        <div className={cn(
          "flex-1 flex min-h-0",
          isFullScreen && "w-full"
        )}>
          {/* Fullscreen: show saved missions panel on left */}
          {isFullScreen && savedMissions.length > 0 && (
            <div className="w-64 border-r border-border bg-secondary/20 flex flex-col overflow-hidden flex-shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <Bookmark className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-semibold text-foreground">Saved Missions</span>
                <StatusBadge color="yellow" size="xs" rounded="full" className="ml-auto">{savedMissions.length}</StatusBadge>
              </div>
              <div className="flex-1 overflow-y-auto scroll-enhanced p-1.5 space-y-1">
                {savedMissions.map(m => (
                  <div
                    key={m.id}
                    className="group p-2 rounded-lg hover:bg-secondary/60 transition-colors cursor-pointer border border-transparent hover:border-border"
                    onClick={() => handleViewSavedMission(m)}
                  >
                    <div className="flex items-start gap-2">
                      <Bookmark className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
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
          <div className="flex-1 flex flex-col min-h-0">
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
          {/* Saved missions section */}
          {savedMissions.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                <Bookmark className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-semibold text-foreground">Saved Missions</span>
                <StatusBadge color="yellow" size="xs" rounded="full">{savedMissions.length}</StatusBadge>
              </div>
              <div className="space-y-1.5">
                {savedMissions.map(m => (
                  <div
                    key={m.id}
                    className="group flex items-center gap-3 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors cursor-pointer"
                    onClick={() => handleViewSavedMission(m)}
                  >
                    <Bookmark className="w-4 h-4 text-yellow-500 flex-shrink-0" />
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
                        title="View mission details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRunMission(m.id) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        title="Run this mission"
                      >
                        <Play className="w-3 h-3" /> Run
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); dismissMission(m.id) }}
                        className="p-1.5 text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                        title="Remove from library"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active missions section */}
          {activeMissions.length > 0 && (
            <>
              {savedMissions.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="text-xs font-semibold text-foreground">Active Missions</span>
                  <span className="text-2xs bg-secondary px-1.5 py-0.5 rounded-full">{activeMissions.length}</span>
                </div>
              )}
              {[...activeMissions].reverse().map((mission) => (
                <MissionListItem
                  key={mission.id}
                  mission={mission}
                  isActive={false}
                  onClick={() => setActiveMission(mission.id)}
                  onDismiss={() => dismissMission(mission.id)}
                  onExpand={() => { setActiveMission(mission.id); setFullScreen(true) }}
                  isCollapsed={collapsedMissions.has(mission.id)}
                  onToggleCollapse={() => toggleMissionCollapse(mission.id)}
                />
              ))}
            </>
          )}

          {/* Empty state when only saved missions, no active */}
          {activeMissions.length === 0 && savedMissions.length > 0 && (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">No active missions. Click <strong>Run</strong> on a saved mission to start it.</p>
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
          onKeyDown={(e) => { if (e.key === 'Escape') setViewingMission(null) }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className={cn(
            "relative bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col",
            isMobile ? "inset-2 fixed" : "w-[900px] max-h-[85vh]"
          )}>
            {/* Close button */}
            <button
              onClick={() => setViewingMission(null)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto scroll-enhanced p-6">
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

      {/* Mission Browser Dialog */}
      <MissionBrowser
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        onImport={handleImportMission}
        initialMission={deepLinkMission || undefined}
      />

      {/* Cluster Selection Dialog for install missions */}
      {pendingRunMissionId && (
        <ClusterSelectionDialog
          open
          missionTitle={pendingMission?.title ?? 'Mission'}
          onSelect={(cluster) => {
            runSavedMission(pendingRunMissionId, cluster || undefined)
            setPendingRunMissionId(null)
          }}
          onCancel={() => setPendingRunMissionId(null)}
        />
      )}
    </>
  )
}

// Toggle button for the sidebar (shown when sidebar is closed)
export function MissionSidebarToggle() {
  const { t } = useTranslation(['common'])
  const { missions, isSidebarOpen, openSidebar, selectedAgent } = useMissions()
  const { isMobile } = useMobile()

  const needsAttention = missions.filter(m =>
    m.status === 'waiting_input' || m.status === 'failed'
  ).length

  const runningCount = missions.filter(m => m.status === 'running').length

  // Helper to get provider string for AgentIcon
  const getAgentProvider = (agent: string | null | undefined) => {
    switch (agent) {
      case 'claude': return 'anthropic'
      case 'openai': return 'openai'
      case 'gemini': return 'google'
      case 'bob': return 'bob'
      case 'claude-code': return 'anthropic-local'
      default: return agent || 'anthropic'
    }
  }

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
      <AgentIcon provider={getAgentProvider(selectedAgent)} className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
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
