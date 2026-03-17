/**
 * Mission Landing Page
 *
 * Lightweight standalone page for deep-linked missions
 * (e.g., /missions/cve-2026-3864-nfs-csi-path-traversal).
 *
 * Renders instantly without loading the full dashboard SPA — shows a
 * blurred console screenshot as background with the mission details
 * in a centered card. Only boots the full app when the user clicks
 * "Import & Open Console".
 *
 * This eliminates the 3-step loading delay:
 *   old: dashboard loads → browser opens → mission fetches
 *   new: landing page shows → mission fetches in parallel → instant
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { validateMissionExport } from '../../lib/missions/types'
import type { MissionExport } from '../../lib/missions/types'

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

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve a mission slug to a file path in console-kb.
 * Tries common locations: security/, cncf-generated/, and root solutions/.
 */
function buildMissionPaths(slug: string): string[] {
  return [
    `solutions/security/${slug}.json`,
    `solutions/cncf-generated/${slug}.json`,
    `solutions/${slug}.json`,
    `solutions/platform/${slug}.json`,
    `solutions/install/${slug}.json`,
  ]
}

async function fetchMissionBySlug(slug: string): Promise<{ mission: MissionExport; raw: string } | null> {
  const paths = buildMissionPaths(slug)

  for (const path of paths) {
    try {
      const url = `/api/missions/file?path=${encodeURIComponent(path)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!res.ok) continue

      const raw = await res.text()
      const parsed = JSON.parse(raw)
      const result = validateMissionExport(parsed)
      if (result.valid) {
        return { mission: result.data, raw }
      }
    } catch {
      continue
    }
  }

  // Try the search index as fallback
  try {
    const res = await fetch('/api/missions/browse?path=solutions', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.ok) {
      const entries = await res.json()
      const match = (entries || []).find((e: { name: string }) =>
        e.name.replace('.json', '') === slug
      )
      if (match) {
        const fileRes = await fetch(`/api/missions/file?path=${encodeURIComponent(match.path)}`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (fileRes.ok) {
          const raw = await fileRes.text()
          const parsed = JSON.parse(raw)
          const result = validateMissionExport(parsed)
          if (result.valid) return { mission: result.data, raw }
        }
      }
    }
  } catch {
    // Fallback exhausted
  }

  return null
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
    // Navigate to the full console with the mission param — the sidebar
    // will detect it and open the browser with auto-import
    navigate(`/?mission=${encodeURIComponent(missionId || '')}`, { replace: true })
  }

  const handleBrowseAll = () => {
    navigate('/?browse=missions', { replace: true })
  }

  const typeColor = mission?.type ? (TYPE_COLORS[mission.type] || DEFAULT_TYPE_COLOR) : DEFAULT_TYPE_COLOR
  const steps = mission?.steps || []
  const visibleSteps = steps.slice(0, MAX_PREVIEW_STEPS)
  const hiddenStepCount = Math.max(steps.length - MAX_PREVIEW_STEPS, 0)

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
      {/* Blurred console background — uses a gradient that mimics the dashboard */}
      <div
        className="absolute inset-0 opacity-20 blur-sm"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(124, 58, 237, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
            linear-gradient(180deg, #0f172a 0%, #0a0a0a 100%)
          `,
        }}
      />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
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
            <div className="bg-[#111318]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              {/* Card header */}
              <div className="p-6 pb-4 border-b border-white/5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded border ${typeColor}`}>
                        {mission.type}
                      </span>
                      {mission.missionClass && (
                        <span className="px-2 py-0.5 text-xs text-white/40 bg-white/5 rounded border border-white/10">
                          {mission.missionClass}
                        </span>
                      )}
                    </div>
                    <h1 className="text-xl font-bold text-white leading-tight">
                      {mission.title}
                    </h1>
                  </div>
                </div>
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
              </div>

              {/* Steps preview */}
              {steps.length > 0 && (
                <div className="p-6 pt-4">
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                    Steps ({steps.length})
                  </h3>
                  <div className="space-y-2">
                    {visibleSteps.map((step, i) => (
                      <div key={i} className="flex items-start gap-3 group">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mt-0.5">
                          <span className="text-2xs font-bold text-purple-400">{i + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80 font-medium truncate">{step.title}</p>
                        </div>
                      </div>
                    ))}
                    {hiddenStepCount > 0 && (
                      <p className="text-xs text-white/30 pl-8">
                        +{hiddenStepCount} more step{hiddenStepCount > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="p-6 pt-2 flex flex-col gap-3">
                <button
                  onClick={handleImport}
                  className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-purple-500/20 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Import &amp; Open Console
                </button>
                <p className="text-center text-2xs text-white/30">
                  Opens KubeStellar Console with this mission ready to run
                </p>
              </div>
            </div>

            {/* Author attribution */}
            {mission.author && (
              <p className="text-center text-xs text-white/20 mt-4">
                Created by {mission.author}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
