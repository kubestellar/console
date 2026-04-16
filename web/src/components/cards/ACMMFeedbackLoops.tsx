/**
 * ACMM Feedback Loops Card
 *
 * Checklist of all criteria from all registered sources, grouped by
 * source with a badge. Users can filter by source, by level, or by
 * detected/missing status.
 */

import { useMemo, useState } from 'react'
import { Check, X, Filter, ChevronDown, ChevronRight, Flag, Sparkles, Lock, Unlock } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'
import { useMissions } from '../../hooks/useMissions'
import { ALL_CRITERIA, SOURCES_BY_ID } from '../../lib/acmm/sources'
import type { Criterion, SourceId } from '../../lib/acmm/sources/types'
import { detectionLabel, singleCriterionPrompt, levelCompletionPrompt } from '../../lib/acmm/missionPrompts'

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

/** Highest level where 70%+ of that level's ACMM criteria are detected.
 *  Walks L1→L5 and stops at the first level that fails the threshold. */
function computeEarnedLevel(detectedIds: Set<string>): number {
  let earned = 1
  for (let n = 2; n <= 5; n++) {
    const required = ALL_CRITERIA.filter((c) => c.source === 'acmm' && c.level === n)
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
  const { scan, repo } = useACMM()
  const { detectedIds, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = scan
  const { startMission } = useMissions()

  const [sourceFilter, setSourceFilter] = useState<SourceId | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
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
    return ALL_CRITERIA.filter((c) => {
      if (sourceFilter !== 'all' && c.source !== sourceFilter) return false
      const detected = detectedIds.has(c.id)
      if (statusFilter === 'detected' && !detected) return false
      if (statusFilter === 'missing' && detected) return false
      return true
    })
  }, [detectedIds, sourceFilter, statusFilter])

  /** Still-missing criteria at earnedLevel — drives the override prompt
   *  copy and the sticky "finish this level" footer button. */
  const missingAtEarnedList = useMemo(
    () => ALL_CRITERIA.filter((c) => c.source === 'acmm' && c.level === earnedLevel && !detectedIds.has(c.id)),
    [earnedLevel, detectedIds],
  )
  const missingAtEarned = missingAtEarnedList.length

  function launchLevelCompletion() {
    if (missingAtEarnedList.length === 0) return
    startMission({
      title: `Finish ACMM L${earnedLevel} for ${repo}`,
      description: `Add the ${missingAtEarnedList.length} missing L${earnedLevel} criteria to ${repo}`,
      type: 'custom',
      initialPrompt: levelCompletionPrompt(missingAtEarnedList, earnedLevel, repo),
      context: { repo, earnedLevel, criterionIds: missingAtEarnedList.map((c) => c.id) },
    })
  }

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
            title={locksOverridden ? 'Locks overridden for this session — click to re-lock' : `Locked above L${earnedLevel} — click to override`}
          >
            {locksOverridden ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
            {locksOverridden ? 'Unlocked' : `L${earnedLevel}`}
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
        {filtered.map((c) => {
          const detected = detectedIds.has(c.id)
          const isExpanded = expandedId === c.id
          // Lock criteria above earnedLevel until the user finishes their
          // current level (or chooses to override). Criteria without a
          // level (structural ones) are never locked.
          const isLocked = !locksOverridden && !!c.level && c.level > earnedLevel
          const isLockPromptOpen = lockPromptId === c.id
          return (
            <div
              key={c.id}
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
                  <Lock className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                ) : isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                )}
                {isLocked ? (
                  <Lock className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                ) : detected ? (
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
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full ${SOURCE_COLORS[c.source]}`}
                  title={SOURCES_BY_ID[c.source]?.citation}
                >
                  {SOURCE_LABELS[c.source]}
                </span>
              </button>
              {isLocked && isLockPromptOpen && (
                <div className="px-8 pb-2 pt-1 text-[10px] border-t border-border/30 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">
                    Locked — finish <span className="font-mono text-foreground">L{earnedLevel}</span> first
                    {missingAtEarned > 0 && (
                      <> ({missingAtEarned} {missingAtEarned === 1 ? 'criterion' : 'criteria'} still missing)</>
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
                <div className="px-8 pb-2 pt-0 text-[10px] space-y-1.5 border-t border-border/30">
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

      {/* Sticky "finish this level" footer — gamification: gives the user
          a one-click way to take on the missing criteria at their
          earnedLevel, which is exactly what they need to unlock the next
          one. Hidden once the level is complete or at L5 (terminal). */}
      {missingAtEarned > 0 && earnedLevel < 5 && (
        <button
          type="button"
          onClick={launchLevelCompletion}
          className="mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 rounded-md transition-colors"
          title={`Launch a mission that adds the ${missingAtEarned} missing L${earnedLevel} criteria to ${repo}, unlocking L${earnedLevel + 1}`}
        >
          <Sparkles className="w-3 h-3" />
          Help me finish L{earnedLevel} ({missingAtEarned} missing) → unlock L{earnedLevel + 1}
        </button>
      )}
    </div>
  )
}

export default ACMMFeedbackLoops
