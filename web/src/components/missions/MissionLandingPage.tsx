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
import { validateMissionExport } from '../../lib/missions/types'
import type { MissionExport, MissionStep } from '../../lib/missions/types'

// ============================================================================
// Constants
// ============================================================================

/** Timeout for fetching mission content from the API (ms) */
const FETCH_TIMEOUT_MS = 10_000

/** Maximum number of steps to preview before truncating */
const MAX_PREVIEW_STEPS = 5

/** Badge colors by mission type */
const TYPE_COLORS: Record<string, string> = {
  repair: 'bg-red-500/20 text-red-400 border-red-500/30',
  troubleshoot: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  deploy: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  upgrade: 'bg-green-500/20 text-green-400 border-green-500/30',
  analyze: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  custom: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

/** Default badge style for unknown types */
const DEFAULT_TYPE_COLOR = 'bg-slate-500/20 text-slate-400 border-slate-500/30'

/** Tab definitions for mission content sections */
type TabId = 'install' | 'uninstall' | 'upgrade' | 'troubleshoot'

interface TabDef {
  id: TabId
  label: string
  icon: string
  getSteps: (m: MissionExport) => MissionStep[]
  emptyMessage: string
}

const TABS: TabDef[] = [
  {
    id: 'install',
    label: 'Install',
    icon: '📦',
    getSteps: (m) => m.steps || [],
    emptyMessage: 'Install steps not available.',
  },
  {
    id: 'uninstall',
    label: 'Uninstall',
    icon: '🗑️',
    getSteps: (m) => m.uninstall || [],
    emptyMessage: 'Uninstall steps not yet available for this mission.',
  },
  {
    id: 'upgrade',
    label: 'Update / Upgrade',
    icon: '⬆️',
    getSteps: (m) => m.upgrade || [],
    emptyMessage: 'Upgrade steps not yet available for this mission.',
  },
  {
    id: 'troubleshoot',
    label: 'Troubleshooting',
    icon: '🔧',
    getSteps: (m) => m.troubleshooting || [],
    emptyMessage: 'Troubleshooting steps not yet available for this mission.',
  },
]

// ============================================================================
// Helpers
// ============================================================================

/**
 * Known subdirectories under solutions/ in console-kb.
 * Used for fast direct lookups before falling back to the index.
 */
const KB_SOLUTION_DIRS = [
  'cncf-install',
  'cncf-generated',
  'security',
  'platform-install',
  'llm-d',
  'multi-cluster',
  'troubleshoot',
  'troubleshooting',
  'cost-optimization',
  'networking',
  'observability',
  'workloads',
] as const

/**
 * Resolve a mission slug to candidate file paths in console-kb.
 * Tries every known subdirectory plus the root solutions/ folder.
 */
function buildMissionPaths(slug: string): string[] {
  const paths = KB_SOLUTION_DIRS.map((dir) => `solutions/${dir}/${slug}.json`)
  paths.push(`solutions/${slug}.json`)
  return paths
}

/**
 * Try fetching a single candidate path and return the validated mission if found.
 */
async function tryFetchMission(path: string): Promise<{ mission: MissionExport; raw: string } | null> {
  try {
    const url = `/api/missions/file?path=${encodeURIComponent(path)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null

    const raw = await res.text()
    const parsed = JSON.parse(raw)
    const result = validateMissionExport(parsed)
    return result.valid ? { mission: result.data, raw } : null
  } catch {
    return null
  }
}

/**
 * Race all candidate paths — resolve as soon as the first one succeeds.
 * Uses Promise.any so we return the instant ANY path finds the mission,
 * without waiting for the remaining 404s to complete. AbortController
 * cancels in-flight requests once a winner is found.
 */
async function raceForMission(
  paths: string[],
): Promise<{ mission: MissionExport; raw: string } | null> {
  const controller = new AbortController()

  const attempt = async (path: string): Promise<{ mission: MissionExport; raw: string }> => {
    const url = `/api/missions/file?path=${encodeURIComponent(path)}`
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error('not found')
    const raw = await res.text()
    const parsed = JSON.parse(raw)
    const result = validateMissionExport(parsed)
    if (!result.valid) throw new Error('invalid')
    controller.abort()
    return { mission: result.data, raw }
  }

  try {
    return await Promise.any(paths.map(attempt))
  } catch {
    return null
  }
}

/**
 * Fetch a mission by slug. Races all known-directory lookups — resolves as
 * soon as the first succeeds (typically <300ms with warm cache). Falls back
 * to the full index.json for missions in nested subdirectories.
 */
async function fetchMissionBySlug(slug: string): Promise<{ mission: MissionExport; raw: string } | null> {
  const paths = buildMissionPaths(slug)
  const hit = await raceForMission(paths)
  if (hit) return hit

  // Fallback: search the full index.json for missions with a matching slug.
  // Catches missions in nested subdirectories not listed in KB_SOLUTION_DIRS.
  try {
    const res = await fetch('/api/missions/file?path=solutions/index.json', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.ok) {
      const index = await res.json() as { missions?: Array<{ path: string }> }
      const missions = index.missions || []
      const match = missions.find((m) => {
        const filename = (m.path || '').split('/').pop() || ''
        return filename.replace('.json', '') === slug
      })
      if (match) return tryFetchMission(match.path)
    }
  } catch {
    // Fallback exhausted
  }

  return null
}

// ============================================================================
// Dashboard Mockup Background
// ============================================================================

/** CSS-only mockup of the console dashboard — creates visual curiosity */
function DashboardMockup() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-30 blur-[2px]">
      {/* Sidebar */}
      <div className="absolute left-0 top-0 bottom-0 w-[52px] bg-[#0f1218] border-r border-white/5">
        {/* Logo area */}
        <div className="h-12 flex items-center justify-center border-b border-white/5">
          <div className="w-6 h-6 rounded bg-purple-500/30" />
        </div>
        {/* Nav items */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 flex items-center justify-center">
            <div className={`w-5 h-5 rounded ${i === 0 ? 'bg-purple-500/40' : 'bg-white/5'}`} />
          </div>
        ))}
      </div>

      {/* Main content area */}
      <div className="ml-[52px] p-4">
        {/* Top bar */}
        <div className="h-10 mb-4 flex items-center gap-3">
          <div className="w-32 h-6 rounded bg-white/5" />
          <div className="flex-1" />
          <div className="w-8 h-8 rounded-full bg-white/5" />
          <div className="w-8 h-8 rounded-full bg-white/5" />
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* Large card */}
          <div className="col-span-2 h-48 rounded-xl bg-[#111318] border border-white/5 p-4">
            <div className="w-24 h-3 rounded bg-white/8 mb-3" />
            <div className="grid grid-cols-4 gap-2 h-32">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-white/[0.02] border border-white/5 p-2">
                  <div className="w-full h-2 rounded bg-white/5 mb-2" />
                  <div className="w-3/4 h-6 rounded bg-purple-500/10" />
                </div>
              ))}
            </div>
          </div>
          {/* Tall card */}
          <div className="row-span-2 rounded-xl bg-[#111318] border border-white/5 p-4">
            <div className="w-20 h-3 rounded bg-white/8 mb-3" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${i < 2 ? 'bg-red-500/40' : i < 4 ? 'bg-yellow-500/30' : 'bg-green-500/30'}`} />
                <div className="flex-1 h-2 rounded bg-white/5" />
              </div>
            ))}
          </div>
          {/* Bottom row cards */}
          <div className="h-40 rounded-xl bg-[#111318] border border-white/5 p-4">
            <div className="w-16 h-3 rounded bg-white/8 mb-3" />
            <div className="h-24 rounded bg-gradient-to-t from-blue-500/5 to-transparent" />
          </div>
          <div className="h-40 rounded-xl bg-[#111318] border border-white/5 p-4">
            <div className="w-20 h-3 rounded bg-white/8 mb-3" />
            <div className="flex gap-1 h-24 items-end">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-purple-500/15"
                  style={{ height: `${20 + Math.sin(i * 0.8) * 40 + 30}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dim overlay to darken the mockup */}
      <div className="absolute inset-0 bg-[#0a0a0a]/40" />
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

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
      setLoading(false)
      return
    }

    fetchMissionBySlug(missionId).then((result) => {
      if (result) {
        setMission(result.mission)
      } else {
        setError('Mission not found')
      }
      setLoading(false)
    })
  }, [missionId])

  const handleImport = () => {
    // Navigate to the full console with the import param — the sidebar
    // will detect it and directly import the mission (no browser popup)
    navigate(`/?import=${missionId || ''}`, { replace: true })
  }

  const handleBrowseAll = () => {
    navigate('/?browse=missions', { replace: true })
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
    <div className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
      {/* Blurred dashboard mockup background — visual curiosity driver */}
      <DashboardMockup />

      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0a0a0a]/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <span className="text-sm font-semibold text-white/80 tracking-wide">KubeStellar Console</span>
        </div>
        <button
          onClick={handleBrowseAll}
          className="text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          Browse all missions
        </button>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-57px)] px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-sm text-white/50">Loading mission...</p>
          </div>
        ) : error ? (
          <div className="max-w-md text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4m0 4h.01M3.6 20h16.8a1 1 0 0 0 .87-1.5L12.87 3.5a1 1 0 0 0-1.74 0L2.73 18.5A1 1 0 0 0 3.6 20z"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">{error}</h2>
            <p className="text-sm text-white/50 mb-6">
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
            <div className="bg-[#111318]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
              {/* Card header */}
              <div className="p-6 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded border ${typeColor}`}>
                    {mission.type}
                  </span>
                  {mission.missionClass && (
                    <span className="px-2 py-0.5 text-xs text-white/40 bg-white/5 rounded border border-white/10">
                      {mission.missionClass}
                    </span>
                  )}
                  {mission.cncfProject && (
                    <span className="px-2 py-0.5 text-xs text-emerald-400/70 bg-emerald-500/10 rounded border border-emerald-500/20">
                      {mission.cncfProject}
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-bold text-white leading-tight mb-2">
                  {mission.title}
                </h1>
                {mission.description && (
                  <p className="text-sm text-white/60 leading-relaxed">
                    {mission.description}
                  </p>
                )}
                {mission.tags && mission.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {mission.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 text-2xs text-white/40 bg-white/5 rounded-full">
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
              <div className="border-t border-white/5">
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
                              ? 'border-transparent text-white/50 hover:text-white/70 hover:bg-white/[0.02]'
                              : 'border-transparent text-white/20 cursor-default'
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
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mt-0.5">
                          <span className="text-2xs font-bold text-purple-400">{i + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80 font-medium">{step.title}</p>
                          {step.description && (
                            <p className="text-2xs text-white/30 mt-0.5 line-clamp-1">{step.description.split('\n')[0]}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {hiddenStepCount > 0 && (
                      <p className="text-xs text-white/30 pl-8">
                        +{hiddenStepCount} more step{hiddenStepCount > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-white/30 text-center py-4">
                    {activeTabDef.emptyMessage}
                  </p>
                )}
              </div>

              {/* CTA */}
              <div className="p-6 pt-2 border-t border-white/5 flex flex-col gap-3">
                <button
                  onClick={handleImport}
                  className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-purple-500/25 flex items-center justify-center gap-2 text-sm"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                  Import &amp; Open Console
                </button>
                <p className="text-center text-2xs text-white/25">
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

/** Small badge indicating whether a mission section has content */
function SectionBadge({ present, label }: { present: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-2xs rounded-full border ${
      present
        ? 'text-green-400/70 bg-green-500/8 border-green-500/20'
        : 'text-white/15 bg-white/[0.02] border-white/5'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${present ? 'bg-green-500/60' : 'bg-white/10'}`} />
      {label}
    </span>
  )
}
