/**
 * Mission Landing Page
 *
 * Lightweight standalone page for deep-linked missions
 * (e.g., /missions/cve-2026-3864-nfs-csi-path-traversal).
 *
 * Renders instantly without loading the full dashboard SPA — shows a
 * CSS mockup of the console dashboard as a blurred background with the
 * mission details in a centered card overlay. Only boots the full app
 * when the user clicks "Import & Open Console".
 *
 * Background uses a CSS-only dashboard mockup (sidebar + card grid) that
 * creates visual curiosity about the full product without loading any
 * heavy assets.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { MissionExport } from '../../lib/missions/types'
import { getHomeBrowseMissionsRoute } from '../../config/routes'
import { emitMissionError, emitPageView } from '../../lib/analytics'
import {
  MAX_PREVIEW_STEPS,
  TYPE_COLORS,
  DEFAULT_TYPE_COLOR,
  TABS,
  type TabId,
} from './MissionLandingPage.constants'
import { fetchMissionBySlug } from './MissionLandingPage.api'
import { DashboardMockup, SectionBadge } from './MissionLandingPage.parts'

export function MissionLandingPage() {
  const { missionId } = useParams<{ missionId: string }>()
  const navigate = useNavigate()
  const [mission, setMission] = useState<MissionExport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('install')

  useEffect(() => {
    if (!missionId) {
      setError('No mission specified')
      emitMissionError('unknown', 'no_mission_specified')
      setLoading(false)
      return
    }

    emitPageView(`/missions/${missionId}`)

    fetchMissionBySlug(missionId).then((result) => {
      if (result) {
        setMission(result.mission)
      } else {
        setError('Mission not found')
        emitMissionError(missionId, 'mission_not_found')
      }
      setLoading(false)
    })
  }, [missionId])

  const handleImport = () => {
    // Navigate to the full console with the import param — the sidebar
    // will detect it and directly import the mission (no browser popup).
    // Pass the already-fetched mission via navigation state to skip
    // the 13-directory race lookup on the receiving end (~2s saved).
    navigate(`/?import=${missionId || ''}`, {
      replace: true,
      state: mission ? { prefetchedMission: mission } : undefined,
    })
  }

  const handleBrowseAll = () => {
    navigate(getHomeBrowseMissionsRoute(), { replace: true })
  }

  const typeColor = mission?.type ? (TYPE_COLORS[mission.type] || DEFAULT_TYPE_COLOR) : DEFAULT_TYPE_COLOR

  // Determine which tabs have content
  const activeTabDef = TABS.find((t) => t.id === activeTab) || TABS[0]
  const activeSteps = mission ? activeTabDef.getSteps(mission) : []
  const visibleSteps = activeSteps.slice(0, MAX_PREVIEW_STEPS)
  const hiddenStepCount = Math.max(activeSteps.length - MAX_PREVIEW_STEPS, 0)

  // Calculate a fixed height from the tallest tab so switching tabs doesn't shift layout.
  // We measure the max number of visible steps (capped at MAX_PREVIEW_STEPS) across all
  // tabs, then add space for the "+N more" overflow line if any tab exceeds the cap.
  /** Height per step row in px (step title + description + gap) */
  const STEP_ROW_HEIGHT_PX = 42
  /** Extra height for the "+N more steps" overflow line */
  const STEP_OVERFLOW_LINE_PX = 28
  /** Minimum height when no tabs have content */
  const EMPTY_TAB_HEIGHT_PX = 120

  const allTabStepCounts = mission ? TABS.map((t) => t.getSteps(mission).length) : []
  const maxStepCount = Math.max(...allTabStepCounts, 0)
  const maxVisibleRows = Math.min(maxStepCount, MAX_PREVIEW_STEPS)
  const hasOverflow = maxStepCount > MAX_PREVIEW_STEPS
  const stepAreaHeight = maxVisibleRows > 0
    ? maxVisibleRows * STEP_ROW_HEIGHT_PX + (hasOverflow ? STEP_OVERFLOW_LINE_PX : 0)
    : EMPTY_TAB_HEIGHT_PX

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Blurred dashboard mockup background — visual curiosity driver */}
      <DashboardMockup />

      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-foreground/5 bg-background/60 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <span className="text-sm font-semibold text-foreground/80 tracking-wide">KubeStellar Console</span>
        </div>
        <button
          onClick={handleBrowseAll}
          className="text-xs text-foreground/50 hover:text-foreground/80 transition-colors"
        >
          Browse all missions
        </button>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-57px)] px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-sm text-foreground/50">Loading mission...</p>
          </div>
        ) : error ? (
          <div className="max-w-md text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4m0 4h.01M3.6 20h16.8a1 1 0 0 0 .87-1.5L12.87 3.5a1 1 0 0 0-1.74 0L2.73 18.5A1 1 0 0 0 3.6 20z"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">{error}</h2>
            <p className="text-sm text-foreground/50 mb-6">
              This mission could not be found in the knowledge base.
            </p>
            <button
              onClick={handleBrowseAll}
              className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
            >
              Browse all missions
            </button>
          </div>
        ) : mission ? (
          <div className="w-full max-w-2xl">
            {/* Mission card */}
            <div className="bg-card/95 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
              {/* Card header */}
              <div className="p-6 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded border ${typeColor}`}>
                    {mission.type}
                  </span>
                  {mission.missionClass && (
                    <span className="px-2 py-0.5 text-xs text-foreground/40 bg-foreground/5 rounded border border-foreground/10">
                      {mission.missionClass}
                    </span>
                  )}
                  {mission.cncfProject && (
                    <span className="px-2 py-0.5 text-xs text-emerald-400/70 bg-emerald-500/10 rounded border border-emerald-500/20">
                      {mission.cncfProject}
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-bold text-foreground leading-tight mb-2">
                  {mission.title}
                </h1>
                {mission.description && (
                  <p className="text-sm text-foreground/60 leading-relaxed">
                    {mission.description}
                  </p>
                )}
                {mission.tags && mission.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {mission.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 text-2xs text-foreground/40 bg-foreground/5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Section availability badges */}
                <div className="flex items-center gap-2 mt-4">
                  <SectionBadge present={(mission.steps || []).length > 0} label="Install" />
                  <SectionBadge present={(mission.uninstall || []).length > 0} label="Uninstall" />
                  <SectionBadge present={(mission.upgrade || []).length > 0} label="Upgrade" />
                  <SectionBadge present={(mission.troubleshooting || []).length > 0} label="Troubleshoot" />
                </div>
              </div>

              {/* Tabs */}
              <div className="border-t border-foreground/5">
                <div className="flex">
                  {TABS.map((tab) => {
                    const hasContent = mission ? tab.getSteps(mission).length > 0 : false
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
                          activeTab === tab.id
                            ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                            : hasContent
                              ? 'border-transparent text-foreground/50 hover:text-foreground/70 hover:bg-foreground/2'
                              : 'border-transparent text-foreground/20 cursor-default'
                        }`}
                        disabled={!hasContent}
                      >
                        <span className="mr-1.5">{tab.icon}</span>
                        {tab.label}
                        {hasContent && (
                          <span className="ml-1 text-2xs opacity-60">
                            ({tab.getSteps(mission).length})
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tab content — fixed height prevents layout shift when switching tabs */}
              <div className="p-6 pt-4" style={{ height: `${stepAreaHeight}px`, overflow: 'auto' }}>
                {activeSteps.length > 0 ? (
                  <div className="space-y-2.5">
                    {visibleSteps.map((step, i) => (
                      <div key={i} className="flex items-start gap-3 group">
                        <div className="shrink-0 w-5 h-5 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mt-0.5">
                          <span className="text-2xs font-bold text-purple-400">{i + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground/80 font-medium">{step.title}</p>
                          {step.description && (
                            <p className="text-2xs text-foreground/30 mt-0.5 line-clamp-1">{step.description.split('\n')[0]}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {hiddenStepCount > 0 && (
                      <p className="text-xs text-foreground/30 pl-8">
                        +{hiddenStepCount} more step{hiddenStepCount > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-foreground/30 text-center py-4">
                    {activeTabDef.emptyMessage}
                  </p>
                )}
              </div>

              {/* CTA */}
              <div className="p-6 pt-2 border-t border-foreground/5 flex flex-col gap-3">
                <button
                  onClick={handleImport}
                  className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-purple-500/25 flex items-center justify-center gap-2 text-sm"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                  Import &amp; Open Console
                </button>
                <p className="text-center text-2xs text-foreground/25">
                  Opens the full KubeStellar Console with this mission ready to run
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

