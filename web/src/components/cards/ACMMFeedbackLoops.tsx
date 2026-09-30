/**
 * ACMM Feedback Loops Card
 *
 * Checklist of all criteria from all registered sources, grouped by
 * source with a badge. Users can filter by source, by level, or by
 * detected/missing status.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Sparkles } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { Button } from '../ui/Button'
import { useACMM } from '../acmm/ACMMProvider'
import { useMissions } from '../../hooks/useMissions'
import { ALL_CRITERIA } from '../../lib/acmm/sources'
import type { Criterion, SourceId } from '../../lib/acmm/sources/types'
import { singleCriterionPrompt, levelCompletionPrompt, cumulativeLevelUpPrompt } from '../../lib/acmm/missionPrompts'
import { emitACMMMissionLaunched, emitACMMLevelMissionLaunched } from '../../lib/analytics'
import {
  type StatusFilter,
  type ViewMode,
  MAX_MATURITY_LEVEL,
  readLocksOverridden,
  persistLocksOverridden,
  computeEarnedLevel,
} from './ACMMFeedbackLoops.helpers'
import { ACMMFilterPanel } from './ACMMFeedbackLoops.FilterPanel'
import { CriterionRowPanel } from './ACMMFeedbackLoops.CriterionPanel'

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
  const { showSkeleton, showEmptyState } = useCardLoadingState({
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

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 gap-2">
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">{t('cards:acmmFeedbackLoops.loadFailed', 'Failed to load criteria')}</p>
          <p className="text-xs mt-1">{t('cards:acmmFeedbackLoops.tryRefresh', 'Please refresh the page or try again later.')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => scan.refetch()}
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    )
  }

  return (
    // Fill parent container width (issue #8847) — no artificial max-width cap.
    // Controls row uses `justify-between` so left filters and right actions
    // anchor to the card edges instead of clumping in the center.
    <div className="h-full w-full flex flex-col p-2 gap-2">
      <ACMMFilterPanel
        viewMode={viewMode}
        setViewMode={setViewMode}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        earnedLevel={earnedLevel}
        locksOverridden={locksOverridden}
        onOverrideLocks={overrideLocks}
        onRelock={relock}
        isRescanLoading={scan.isLoading}
        isRescanRefreshing={scan.isRefreshing}
        onRescan={() => scan.forceRefetch()}
      />

      <div className="flex-1 overflow-y-auto space-y-1">
        {filtered.map((c, idx) => {
          const curLevel = c.level ?? 0
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
            <CriterionRowPanel
              key={c.id}
              criterion={c}
              prevCriterion={idx > 0 ? filtered[idx - 1] : undefined}
              idx={idx}
              viewMode={viewMode}
              earnedLevel={earnedLevel}
              nextLevel={nextLevel}
              missingForNext={missingForNext}
              levelBreakMissing={(cumulativeMissing[curLevel] || []).length}
              detected={detected}
              isExpanded={isExpanded}
              isLocked={isLocked}
              isLockPromptOpen={isLockPromptOpen}
              locksOverridden={locksOverridden}
              repo={repo}
              t={t}
              onToggleExpand={() => setExpandedId(isExpanded ? null : c.id)}
              onLockPromptToggle={() => setLockPromptId(isLockPromptOpen ? null : c.id)}
              onCloseLockPrompt={() => setLockPromptId(null)}
              onOverrideLocks={overrideLocks}
              onCloseExpanded={() => setExpandedId(null)}
              onLaunchOne={launchOne}
              onLaunchCumulativeLevelUp={launchCumulativeLevelUp}
            />
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
