/**
 * ACMM Feedback Loops Card
 *
 * Checklist of all criteria from all registered sources, grouped by
 * source with a badge. Users can filter by source, by level, or by
 * detected/missing status.
 */

import { useMemo, useState } from 'react'
import { Check, X, Filter } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'
import { ALL_CRITERIA } from '../../lib/acmm/sources'
import type { SourceId } from '../../lib/acmm/sources/types'

type StatusFilter = 'all' | 'detected' | 'missing'

const SOURCE_LABELS: Record<SourceId, string> = {
  acmm: 'ACMM',
  fullsend: 'Fullsend',
  'agentic-engineering-framework': 'AEF',
  'claude-reflect': 'Reflect',
}

const SOURCE_COLORS: Record<SourceId, string> = {
  acmm: 'bg-primary/20 text-primary',
  fullsend: 'bg-orange-500/20 text-orange-400',
  'agentic-engineering-framework': 'bg-cyan-500/20 text-cyan-400',
  'claude-reflect': 'bg-green-500/20 text-green-400',
}

export function ACMMFeedbackLoops() {
  const { scan } = useACMM()
  const { detectedIds, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = scan

  const [sourceFilter, setSourceFilter] = useState<SourceId | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const hasData = detectedIds.size > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  const filtered = useMemo(() => {
    return ALL_CRITERIA.filter((c) => {
      if (sourceFilter !== 'all' && c.source !== sourceFilter) return false
      const detected = detectedIds.has(c.id)
      if (statusFilter === 'detected' && !detected) return false
      if (statusFilter === 'missing' && detected) return false
      return true
    })
  }, [detectedIds, sourceFilter, statusFilter])

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={6} />
  }

  const sources: (SourceId | 'all')[] = ['all', 'acmm', 'fullsend', 'agentic-engineering-framework', 'claude-reflect']

  return (
    <div className="h-full flex flex-col p-2 gap-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {sources.map((s) => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
              sourceFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {s === 'all' ? 'All' : SOURCE_LABELS[s]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {(['all', 'detected', 'missing'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
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

      <div className="flex-1 overflow-y-auto space-y-1">
        {filtered.map((c) => {
          const detected = detectedIds.has(c.id)
          return (
            <div
              key={c.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              {detected ? (
                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              ) : (
                <X className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{c.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{c.description}</div>
              </div>
              {c.level && (
                <span className="text-[10px] font-mono text-muted-foreground">L{c.level}</span>
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${SOURCE_COLORS[c.source]}`}>
                {SOURCE_LABELS[c.source]}
              </span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-4">
            No criteria match the current filter
          </div>
        )}
      </div>
    </div>
  )
}

export default ACMMFeedbackLoops
