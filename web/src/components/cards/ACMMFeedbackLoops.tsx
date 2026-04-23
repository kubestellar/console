/**
 * ACMM Feedback Loops Card
 *
 * Checklist of all criteria from all registered sources, grouped by
 * source with a badge. Users can filter by source, by level, or by
 * detected/missing status.
 */

import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X, Filter, ChevronDown, ChevronRight, Flag, Sparkles, Lock, Unlock, Eye, RefreshCw } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'
import { useMissions } from '../../hooks/useMissions'
import { ALL_CRITERIA, SOURCES_BY_ID } from '../../lib/acmm/sources'
import type { Criterion, SourceId } from '../../lib/acmm/sources/types'
import { detectionLabel, singleCriterionPrompt, levelCompletionPrompt, cumulativeLevelUpPrompt } from '../../lib/acmm/missionPrompts'
import { emitACMMMissionLaunched, emitACMMLevelMissionLaunched } from '../../lib/analytics'

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
/** Mirrors the badge-function threshold: a level is "earned" once 70% of
 *  its criteria are detected. Anything above earnedLevel is locked
 *  (gamification — finish what you're on before the next level opens). */
const LEVEL_COMPLETION_THRESHOLD = 0.7
const LOCK_OVERRIDE_KEY = 'kc-acmm-locks-overridden'

function readLocksOverridden(): boolean {
  try {
    return sessionStorage.getItem(LOCK_OVERRIDE_KEY) === '1'
  } catch {
    return false
  }
}

function persistLocksOverridden(v: boolean) {
  try {
    if (v) sessionStorage.setItem(LOCK_OVERRIDE_KEY, '1')
    else sessionStorage.removeItem(LOCK_OVERRIDE_KEY)
  } catch {
    // ignore
  }
}

/** Maximum maturity level (L6 = Autonomous) */
const MAX_MATURITY_LEVEL = 6

/** Highest level where 70%+ of that level's scannable ACMM criteria are
 *  detected. Walks L2→L6 and stops at the first level that fails the
 *  threshold. Non-scannable items are excluded from the calculation. */
function computeEarnedLevel(detectedIds: Set<string>): number {
  let earned = 1
  for (let n = 2; n <= MAX_MATURITY_LEVEL; n++) {
    const required = ALL_CRITERIA.filter(
      (c) => c.source === 'acmm' && c.level === n && c.scannable !== false,
    )
    if (required.length === 0) continue
    const detected = required.filter((c) => detectedIds.has(c.id)).length
    if (detected / required.length >= LEVEL_COMPLETION_THRESHOLD) {
      earned = n
    } else {
      break
    }
  }
  return earned
}

type ViewMode = 'by-level' | 'cross-cutting'

/** Cross-cutting dimension labels */
const CROSS_CUTTING_LABELS = {
  learning: 'Learning & Feedback',
  traceability: 'Traceability & Audit',
} as const

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
  const { t } = useTranslation()
  const { scan, repo } = useACMM()
  const { detectedIds, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = scan
  const { startMission } = useMissions()

  const [sourceFilter, setSourceFilter] = useState<SourceId | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('by-level')
  /** Session-scoped override that unlocks all higher-level criteria.
   *  Persisted to sessionStorage so refreshes within the tab survive,
   *  but a fresh tab/session re-locks the gamification gate. */
  const [locksOverridden, setLocksOverridden] = useState<boolean>(() => readLocksOverridden())
  /** Which row's lock-prompt is currently open (null = none). */
  const [lockPromptId, setLockPromptId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const earnedLevel = useMemo(() => computeEarnedLevel(detectedIds), [detectedIds])

  function overrideLocks() {
    setLocksOverridden(true)
    persistLocksOverridden(true)
    setLockPromptId(null)
  }

  function relock() {
    setLocksOverridden(false)
    persistLocksOverridden(false)
  }

  function launchOne(c: Criterion) {
    emitACMMMissionLaunched(repo, c.id, c.source, c.level ?? 0)
    startMission({
      title: `Add ACMM criterion: ${c.name}`,
      description: `Add "${c.name}" to ${repo}`,
      type: 'custom',
      initialPrompt: singleCriterionPrompt(c, repo),
      context: { repo, criterionId: c.id },
    })
  }

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
    let items = ALL_CRITERIA
      .filter((c) => {
        // Cross-cutting view: only show items with a crossCutting tag
        if (viewMode === 'cross-cutting' && !c.crossCutting) return false
        if (sourceFilter !== 'all' && c.source !== sourceFilter) return false
        const detected = detectedIds.has(c.id)
        if (statusFilter === 'detected' && !detected) return false
        if (statusFilter === 'missing' && detected) return false
        return true
      })

    if (viewMode === 'cross-cutting') {
      // Group by cross-cutting dimension, then by level within each
      items = items.sort((a, b) => {
        const dimOrder = (c: typeof a) => c.crossCutting === 'learning' ? 0 : 1
        const dimDiff = dimOrder(a) - dimOrder(b)
        if (dimDiff !== 0) return dimDiff
        return (a.level ?? 99) - (b.level ?? 99)
      })
    } else {
      // Sort by level (ascending) so all sources mix by maturity tier.
      // Criteria without a level sort last.
      items = items.sort((a, b) => (a.level ?? 99) - (b.level ?? 99))
    }
    return items
  }, [detectedIds, sourceFilter, statusFilter, viewMode])

  /** The level the user is working toward — the one ABOVE earnedLevel.
   *  For L1 repos earnedLevel=1, so nextLevel=2 (the first level with
   *  actual criteria). At L5, nextLevel=6 which is past the ceiling. */
  const nextLevel = earnedLevel + 1
  /** Missing criteria at the NEXT level — what the user needs to add to
   *  level up. Drives both the lock-prompt copy and the sticky "reach
   *  next level" footer button. */
  const missingForNextList = useMemo(
    () => ALL_CRITERIA.filter((c) => c.source === 'acmm' && c.level === nextLevel && !detectedIds.has(c.id)),
    [nextLevel, detectedIds],
  )
  const missingForNext = missingForNextList.length

  /** Cumulative missing criteria for each level boundary (L2 through L6).
   *  E.g. cumulativeMissing[3] = all undetected criteria from L1+L2+L3.
   *  Used by the section break "Level up" buttons. */
  const cumulativeMissing = useMemo(() => {
    const result: Record<number, Criterion[]> = {}
    for (let targetLevel = 2; targetLevel <= MAX_MATURITY_LEVEL; targetLevel++) {
      result[targetLevel] = ALL_CRITERIA.filter(
        (c) => c.source === 'acmm' && c.level != null && c.level <= targetLevel && !detectedIds.has(c.id),
      )
    }
    return result
  }, [detectedIds])

  /** Launch a cumulative level-up mission for all missing criteria L1..targetLevel. */
  function launchCumulativeLevelUp(targetLevel: number) {
    const missing = cumulativeMissing[targetLevel] || []
    if (missing.length === 0) return
    emitACMMLevelMissionLaunched(repo, targetLevel, missing.length)
    startMission({
      title: `Reach ACMM L${targetLevel} for ${repo}`,
      description: `Add ${missing.length} missing criteria (L1-L${targetLevel}) to ${repo}`,
      type: 'custom',
      initialPrompt: cumulativeLevelUpPrompt(missing, targetLevel, repo),
      context: { repo, targetLevel, criterionIds: missing.map((c) => c.id) },
    })
  }

  function launchLevelCompletion() {
    if (missingForNextList.length === 0) return
    emitACMMLevelMissionLaunched(repo, nextLevel, missingForNextList.length)
    startMission({
      title: `Reach ACMM L${nextLevel} for ${repo}`,
      description: `Add the ${missingForNextList.length} missing L${nextLevel} criteria to ${repo}`,
      type: 'custom',
      initialPrompt: levelCompletionPrompt(missingForNextList, nextLevel, repo),
      context: { repo, targetLevel: nextLevel, criterionIds: missingForNextList.map((c) => c.id) },
    })
  }

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={6} />
  }

  const sources: (SourceId | 'all')[] = ['all', 'acmm', 'fullsend', 'agentic-engineering-framework', 'claude-reflect']

  return (
    // Fill parent container width (issue #8847) — no artificial max-width cap.
    // Controls row uses `justify-between` so left filters and right actions
    // anchor to the card edges instead of clumping in the center.
    <div className="h-full w-full flex flex-col p-2 gap-2">
      <div className="flex items-center gap-1.5 flex-wrap w-full">
        {/* View mode toggle: By Level / Cross-cutting */}
        {(['by-level', 'cross-cutting'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
              viewMode === m
                ? 'bg-violet-500/30 text-violet-300'
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {m === 'by-level' ? 'By Level' : 'Cross-cutting'}
          </button>
        ))}
        <span className="w-px h-3 bg-border/50" />
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
          {/* Re-scan: force a fresh ACMM scan bypassing the server cache */}
          <button
            type="button"
            onClick={() => scan.forceRefetch()}
            disabled={scan.isLoading || scan.isRefreshing}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-50"
            title="Re-scan current repo (bypasses server cache)"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${scan.isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
          {/* Lock-status chip — gamification: rows above earnedLevel are
              locked until the user finishes their current level. Click to
              toggle the session-scoped override. */}
          <button
            type="button"
            onClick={locksOverridden ? relock : overrideLocks}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full transition-colors ${
              locksOverridden
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
            title={locksOverridden ? 'Locks overridden for this session — click to re-lock' : `Locked above L${earnedLevel + 1} — click to override`}
          >
            {locksOverridden ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
            {locksOverridden ? 'Unlocked' : `≤ L${earnedLevel + 1}`}
          </button>
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
        {filtered.map((c, idx) => {
          // In cross-cutting view, insert a section header when the
          // dimension changes between adjacent items.
          const prevDim = idx > 0 ? filtered[idx - 1].crossCutting : undefined
          const showDimHeader = viewMode === 'cross-cutting' && c.crossCutting && c.crossCutting !== prevDim
          const dimHeader = showDimHeader && c.crossCutting ? (
            <div key={`dim-${c.crossCutting}`} className="text-[10px] uppercase tracking-wide text-violet-400 font-medium pt-2 pb-1 px-2 border-b border-violet-500/20">
              {CROSS_CUTTING_LABELS[c.crossCutting]}
            </div>
          ) : null

          // Level-break divider: in "by-level" view, insert a "Level up
          // to L{N}" CTA between the last item of level N-1 and the
          // first item of level N. The previous item's level determines
          // the boundary — if it differs from the current item's level
          // and both have levels, we're crossing a boundary.
          //
          // Fix #8849/#8850 — L1 ALSO needs a header marker so the first
          // group isn't visually anonymous. When idx === 0 and the first
          // item has a level, we render a non-actionable "Level N" marker
          // (typically L1) using the same divider component.
          const prevLevel = idx > 0 ? (filtered[idx - 1].level ?? 0) : 0
          const curLevel = c.level ?? 0
          const isFirstLevelMarker = viewMode === 'by-level' && idx === 0 && curLevel > 0
          const showLevelBreak =
            viewMode === 'by-level' &&
            (isFirstLevelMarker || (curLevel > prevLevel && prevLevel > 0 && curLevel >= 2))
          /** Whether this level-break button is actionable. Only the
           *  immediate next level above earned is active; higher levels
           *  are "locked" until the preceding one is completed. */
          const levelBreakActive = curLevel <= earnedLevel + 1 || locksOverridden
          const levelBreakMissing = (cumulativeMissing[curLevel] || []).length
          // For the L1 starting marker (#8850), there is no "level up to L1"
          // action — L1 is the baseline. We show a parallel visual marker
          // that says "Level 1 — Foundation" with the same border/background
          // treatment so L1 has the same structural divider that L2/L3 do.
          const isBaselineMarker = isFirstLevelMarker && curLevel <= 1
          const levelBreak = showLevelBreak ? (
            <div
              key={`level-break-${curLevel}`}
              className={`flex items-center gap-3 py-2.5 px-4 my-1 rounded-md border-y transition-colors ${
                levelBreakActive
                  ? 'bg-linear-to-r from-purple-500/10 to-transparent border-purple-500/20'
                  : 'bg-linear-to-r from-muted/10 to-transparent border-border/20 opacity-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${levelBreakActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {isBaselineMarker ? `Level ${curLevel} — Foundation` : `Reach Level ${curLevel}`}
                </span>
                {!isBaselineMarker && levelBreakMissing > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {levelBreakMissing} {levelBreakMissing === 1 ? 'criterion' : 'criteria'} to go
                  </span>
                )}
              </div>
              {isBaselineMarker ? (
                // L1 has no "level up" action — it's where everyone starts.
                // Keep the column balanced with a small label so the divider
                // matches L2/L3 proportions visually.
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground">
                  Baseline
                </span>
              ) : levelBreakActive ? (
                <button
                  type="button"
                  onClick={() => launchCumulativeLevelUp(curLevel)}
                  disabled={levelBreakMissing === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-default"
                  title={levelBreakMissing > 0
                    ? `Launch a mission to implement all ${levelBreakMissing} missing criteria through L${curLevel}`
                    : `All criteria through L${curLevel} are already detected`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {levelBreakMissing > 0 ? 'Level up' : 'Complete'}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground">
                  <Lock className="w-3.5 h-3.5" />
                  Complete L{curLevel - 1} first
                </span>
              )}
            </div>
          ) : null

          const detected = detectedIds.has(c.id)
          const isExpanded = expandedId === c.id
          // Lock criteria above earnedLevel until the user finishes their
          // current level (or chooses to override). Criteria without a
          // level (structural ones) are never locked.
          // Lock criteria TWO+ levels above earned. The next level (earnedLevel+1)
          // stays unlocked — that's what the user is actively working toward.
          const isLocked = !locksOverridden && !!c.level && c.level > earnedLevel + 1
          const isLockPromptOpen = lockPromptId === c.id
          return (
            <Fragment key={c.id}>{dimHeader}{levelBreak}<div
              className={`rounded-md transition-colors ${
                isLocked ? 'bg-muted/10 hover:bg-muted/20 opacity-60' : 'bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (isLocked) {
                    setLockPromptId(isLockPromptOpen ? null : c.id)
                    return
                  }
                  setExpandedId(isExpanded ? null : c.id)
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
                aria-expanded={isLocked ? isLockPromptOpen : isExpanded}
                title={isLocked ? `Locked — finish L${earnedLevel} first` : 'Show detection rule'}
              >
                {isLocked ? (
                  <Lock className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                ) : isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                )}
                {isLocked ? (
                  <Lock className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                ) : c.scannable === false ? (
                  <span title="Not yet scannable — practice-based"><Eye className="w-4 h-4 text-muted-foreground/30 shrink-0" /></span>
                ) : detected ? (
                  <Check className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                )}
                {/* Fixed-width level column for clean alignment */}
                <span className="text-[10px] font-mono text-muted-foreground w-6 text-right shrink-0">
                  {c.level ? `L${c.level}` : ''}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{c.description}</div>
                </div>
                {c.crossCutting && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 bg-violet-500/20 text-violet-400 cursor-help"
                    title={c.crossCutting === 'learning'
                      ? 'Cross-cutting: Learning & Feedback — how the system encodes learnings and improves over time'
                      : 'Cross-cutting: Traceability & Audit — how agent actions are logged, attributed, and reviewable'}
                  >
                    {c.crossCutting === 'learning' ? 'Learning' : 'Traceability'}
                  </span>
                )}
                {c.scannable === false && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 bg-muted/40 text-muted-foreground/60">
                    practice
                  </span>
                )}
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${SOURCE_COLORS[c.source]}`}
                  title={SOURCES_BY_ID[c.source]?.citation}
                >
                  {SOURCE_LABELS[c.source]}
                </span>
              </button>
              {isLocked && isLockPromptOpen && (
                <div className="px-8 pb-2 pt-1 text-[10px] border-t border-border/30 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Locked — reach <span className="font-mono text-foreground">L{nextLevel}</span> first
                    {missingForNext > 0 && (
                      <> ({missingForNext} {missingForNext === 1 ? 'criterion' : 'criteria'} still missing)</>
                    )}.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLockPromptId(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Stay focused
                    </button>
                    <button
                      type="button"
                      onClick={overrideLocks}
                      className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300"
                    >
                      <Unlock className="w-2.5 h-2.5" />
                      Override anyway
                    </button>
                  </div>
                </div>
              )}
              {!isLocked && isExpanded && (
                // Fix #8851 — previously the click just made the bar taller,
                // giving no signal that a distinct "detail view" had opened.
                // We now render an inset detail panel with its own header and
                // an explicit Close control, so the click-to-open interaction
                // is unambiguous and dismissable.
                <div className="mx-2 mb-2 rounded-md border border-border/60 bg-background/60 shadow-xs">
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/20 rounded-t-md">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Details — {c.name}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedId(null)
                      }}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={t('actions.close')}
                      title={t('actions.close')}
                    >
                      <X className="w-3 h-3" />
                      {t('actions.close')}
                    </button>
                  </div>
                  <div className="px-3 pb-2 pt-1.5 text-[10px] space-y-1.5">
                  {/* Details blurb — what it is, why it matters, how a mission implements it */}
                  {c.details && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground/90 py-1">
                      {c.details}
                    </p>
                  )}
                  {SOURCES_BY_ID[c.source]?.url && (
                    <div>
                      <span className="text-muted-foreground">Cited from:</span>{' '}
                      <a
                        href={SOURCES_BY_ID[c.source].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        title={SOURCES_BY_ID[c.source]?.citation}
                      >
                        {SOURCES_BY_ID[c.source].name}
                      </a>
                      {SOURCES_BY_ID[c.source]?.citation && (
                        <span className="ml-1 text-muted-foreground/70 italic">
                          — {SOURCES_BY_ID[c.source].citation}
                        </span>
                      )}
                    </div>
                  )}
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
                  <div className="flex items-center gap-3 flex-wrap">
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
                    {/* AI mission star — only offered for missing loops; an
                        already-detected loop has nothing to add. Mirrors the
                        per-recommendation "Launch" button on the Your Role
                        card so users get the same affordance from either
                        entry point. */}
                    {!detected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          launchOne(c)
                        }}
                        className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary/80"
                        title={`Ask the selected agent to add the "${c.name}" criterion to ${repo}`}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        Ask agent for help
                      </button>
                    )}
                  </div>
                  </div>
                </div>
              )}
            </div></Fragment>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-4">
            No criteria match the current filter
          </div>
        )}
      </div>

      {/* Sticky "finish this level" footer — gamification: gives the user
          a one-click way to take on the missing criteria at their
          earnedLevel, which is exactly what they need to unlock the next
          one. Hidden once the level is complete or at L5 (terminal). */}
      {missingForNext > 0 && nextLevel <= MAX_MATURITY_LEVEL && (
        <button
          type="button"
          onClick={launchLevelCompletion}
          className="mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 rounded-md transition-colors"
          title={`Launch a mission that adds the ${missingForNext} missing L${nextLevel} criteria to ${repo}`}
        >
          <Sparkles className="w-3 h-3" />
          Help me reach L{nextLevel} ({missingForNext} criteria to go)
        </button>
      )}
    </div>
  )
}

export default ACMMFeedbackLoops
