/**
 * Filter/controls row for ACMMFeedbackLoops: view-mode toggle, source
 * filter, re-scan button, lock-status chip, and status filter.
 *
 * Extracted from ACMMFeedbackLoops.tsx to keep the main component focused
 * on data orchestration and rendering.
 */
import { Filter, Lock, Unlock, RefreshCw } from 'lucide-react'
import type { SourceId } from '../../lib/acmm/sources/types'
import { SOURCE_LABELS, type StatusFilter, type ViewMode } from './ACMMFeedbackLoops.helpers'

interface ACMMFilterPanelProps {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  sourceFilter: SourceId | 'all'
  setSourceFilter: (s: SourceId | 'all') => void
  statusFilter: StatusFilter
  setStatusFilter: (s: StatusFilter) => void
  earnedLevel: number
  locksOverridden: boolean
  onOverrideLocks: () => void
  onRelock: () => void
  isRescanLoading: boolean
  isRescanRefreshing: boolean
  onRescan: () => void
}

const SOURCES: (SourceId | 'all')[] = ['all', 'acmm', 'fullsend', 'agentic-engineering-framework', 'claude-reflect']
const STATUS_FILTERS: StatusFilter[] = ['all', 'detected', 'missing']

export function ACMMFilterPanel({
  viewMode,
  setViewMode,
  sourceFilter,
  setSourceFilter,
  statusFilter,
  setStatusFilter,
  earnedLevel,
  locksOverridden,
  onOverrideLocks,
  onRelock,
  isRescanLoading,
  isRescanRefreshing,
  onRescan,
}: ACMMFilterPanelProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap w-full">
      {/* View mode toggle: By Level / Cross-cutting */}
      {(['by-level', 'cross-cutting'] as const).map((m) => (
        <button
          key={m}
          onClick={() => setViewMode(m)}
          className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
            viewMode === m
              ? 'bg-purple-500/30 text-purple-300'
              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
          }`}
        >
          {m === 'by-level' ? 'By Level' : 'Cross-cutting'}
        </button>
      ))}
      <span className="w-px h-3 bg-border/50" />
      <Filter className="w-3.5 h-3.5 text-muted-foreground" />
      {SOURCES.map((s) => (
        <button
          key={s}
          onClick={() => setSourceFilter(s)}
          className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
            sourceFilter === s
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
          }`}
        >
          {s === 'all' ? 'All' : SOURCE_LABELS[s]}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1">
        {/* Re-scan: force a fresh ACMM scan bypassing the server cache */}
        <button
          type="button"
          onClick={onRescan}
          disabled={isRescanLoading || isRescanRefreshing}
          className="p-1 min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-50"
          title="Re-scan current repo (bypasses server cache)"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRescanRefreshing ? 'animate-spin' : ''}`} />
        </button>
        {/* Lock-status chip — gamification: rows above earnedLevel are
            locked until the user finishes their current level. Click to
            toggle the session-scoped override. */}
        <button
          type="button"
          onClick={locksOverridden ? onRelock : onOverrideLocks}
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors ${
            locksOverridden
              ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
          }`}
          title={locksOverridden ? 'Locks overridden for this session — click to re-lock' : `Locked above L${earnedLevel + 1} — click to override`}
        >
          {locksOverridden ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
          {locksOverridden ? 'Unlocked' : `≤ L${earnedLevel + 1}`}
        </button>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
