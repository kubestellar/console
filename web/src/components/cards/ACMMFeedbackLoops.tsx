/**
 * ACMM Feedback Loops Card
 *
 * Checklist of all criteria from all registered sources, grouped by
 * source with a badge. Users can filter by source, by level, or by
 * detected/missing status.
 */

import { useMemo, useState } from 'react'
import { Check, X, Filter, ChevronDown, ChevronRight, Flag } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'
import { ALL_CRITERIA } from '../../lib/acmm/sources'
import type { Criterion, DetectionHint, SourceId } from '../../lib/acmm/sources/types'

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

/** File each source's criteria live in — used for "propose a change" links. */
const SOURCE_FILES: Record<SourceId, string> = {
  acmm: 'web/src/lib/acmm/sources/acmm.ts',
  fullsend: 'web/src/lib/acmm/sources/fullsend.ts',
  'agentic-engineering-framework': 'web/src/lib/acmm/sources/agentic-engineering-framework.ts',
  'claude-reflect': 'web/src/lib/acmm/sources/claude-reflect.ts',
}

const CONSOLE_REPO = 'kubestellar/console'

function detectionLabel(hint: DetectionHint): string {
  const patterns = Array.isArray(hint.pattern) ? hint.pattern : [hint.pattern]
  return patterns.join(' · ')
}

function proposeChangeUrl(c: Criterion): string {
  const title = encodeURIComponent(`ACMM criterion fix: ${c.id}`)
  const body = encodeURIComponent(
    `**Criterion:** \`${c.id}\` (${SOURCE_LABELS[c.source]})\n` +
      `**Name:** ${c.name}\n` +
      `**Current detection (${c.detection.type}):** \`${detectionLabel(c.detection)}\`\n\n` +
      `**What's wrong with the current criteria?**\n<!-- e.g. missed files in my repo, over-matches, wrong level -->\n\n` +
      `**Suggested detection pattern:**\n<!-- e.g. include additional paths, switch to glob, etc. -->\n\n` +
      `**Source file:** \`${SOURCE_FILES[c.source]}\``,
  )
  return `https://github.com/${CONSOLE_REPO}/issues/new?title=${title}&body=${body}&labels=acmm,criterion-feedback`
}

export function ACMMFeedbackLoops() {
  const { scan } = useACMM()
  const { detectedIds, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = scan

  const [sourceFilter, setSourceFilter] = useState<SourceId | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
          const isExpanded = expandedId === c.id
          return (
            <div
              key={c.id}
              className="rounded-md bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
                aria-expanded={isExpanded}
                title={'Show detection rule'}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                )}
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
              </button>
              {isExpanded && (
                <div className="px-8 pb-2 pt-0 text-[10px] space-y-1.5 border-t border-border/30">
                  <div>
                    <span className="text-muted-foreground">Detection ({c.detection.type}):</span>{' '}
                    <code className="font-mono bg-background/60 px-1 py-0.5 rounded">
                      {detectionLabel(c.detection)}
                    </code>
                  </div>
                  {c.referencePath && (
                    <div>
                      <span className="text-muted-foreground">Reference:</span>{' '}
                      <a
                        href={`https://github.com/${CONSOLE_REPO}/blob/main/${c.referencePath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        {c.referencePath}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://github.com/${CONSOLE_REPO}/blob/main/${SOURCE_FILES[c.source]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground underline"
                    >
                      View source
                    </a>
                    <a
                      href={proposeChangeUrl(c)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300"
                    >
                      <Flag className="w-2.5 h-2.5" />
                      Propose a change
                    </a>
                  </div>
                </div>
              )}
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
