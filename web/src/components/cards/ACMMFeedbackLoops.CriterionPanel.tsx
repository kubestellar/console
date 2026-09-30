/**
 * Single criterion row (with optional dimension header / level-break
 * divider, lock prompt, and expanded detail panel) for ACMMFeedbackLoops.
 *
 * Extracted from ACMMFeedbackLoops.tsx to keep the main component focused
 * on data orchestration and rendering.
 */
import { Fragment } from 'react'
import { Check, X, ChevronDown, ChevronRight, Flag, Sparkles, Lock, Unlock, Eye } from 'lucide-react'
import { SOURCES_BY_ID } from '../../lib/acmm/sources'
import type { Criterion } from '../../lib/acmm/sources/types'
import { detectionLabel } from '../../lib/acmm/missionPrompts'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import {
  SOURCE_LABELS,
  SOURCE_COLORS,
  SOURCE_FILES,
  CONSOLE_REPO,
  CROSS_CUTTING_LABELS,
  proposeChangeUrl,
  type ViewMode,
} from './ACMMFeedbackLoops.helpers'

interface CriterionRowPanelProps {
  criterion: Criterion
  prevCriterion: Criterion | undefined
  idx: number
  viewMode: ViewMode
  earnedLevel: number
  nextLevel: number
  missingForNext: number
  levelBreakMissing: number
  detected: boolean
  isExpanded: boolean
  isLocked: boolean
  isLockPromptOpen: boolean
  locksOverridden: boolean
  repo: string
  t: (key: string) => string
  onToggleExpand: () => void
  onLockPromptToggle: () => void
  onCloseLockPrompt: () => void
  onOverrideLocks: () => void
  onCloseExpanded: () => void
  onLaunchOne: (c: Criterion) => void
  onLaunchCumulativeLevelUp: (level: number) => void
}

export function CriterionRowPanel({
  criterion: c,
  prevCriterion,
  idx,
  viewMode,
  earnedLevel,
  nextLevel,
  missingForNext,
  levelBreakMissing,
  detected,
  isExpanded,
  isLocked,
  isLockPromptOpen,
  locksOverridden,
  repo,
  t,
  onToggleExpand,
  onLockPromptToggle,
  onCloseLockPrompt,
  onOverrideLocks,
  onCloseExpanded,
  onLaunchOne,
  onLaunchCumulativeLevelUp,
}: CriterionRowPanelProps) {
  // In cross-cutting view, insert a section header when the dimension
  // changes between adjacent items.
  const prevDim = prevCriterion?.crossCutting
  const showDimHeader = viewMode === 'cross-cutting' && c.crossCutting && c.crossCutting !== prevDim
  const dimHeader = showDimHeader && c.crossCutting ? (
    <div key={`dim-${c.crossCutting}`} className="text-xs uppercase tracking-wide text-purple-400 font-medium pt-2 pb-1 px-2 border-b border-purple-500/20">
      {CROSS_CUTTING_LABELS[c.crossCutting]}
    </div>
  ) : null

  // Level-break divider: in "by-level" view, insert a "Level up to L{N}"
  // CTA between the last item of level N-1 and the first item of level N.
  // The previous item's level determines the boundary — if it differs
  // from the current item's level and both have levels, we're crossing a
  // boundary.
  //
  // Fix #8849/#8850 — L1 ALSO needs a header marker so the first group
  // isn't visually anonymous. When idx === 0 and the first item has a
  // level, we render a non-actionable "Level N" marker (typically L1)
  // using the same divider component.
  const prevLevel = prevCriterion?.level ?? 0
  const curLevel = c.level ?? 0
  const isFirstLevelMarker = viewMode === 'by-level' && idx === 0 && curLevel > 0
  const showLevelBreak =
    viewMode === 'by-level' &&
    (isFirstLevelMarker || (curLevel > prevLevel && prevLevel > 0 && curLevel >= 2))
  /** Whether this level-break button is actionable. Only the immediate
   *  next level above earned is active; higher levels are "locked" until
   *  the preceding one is completed. */
  const levelBreakActive = curLevel <= earnedLevel + 1 || locksOverridden
  // For the L1 starting marker (#8850), there is no "level up to L1"
  // action — L1 is the baseline. We show a parallel visual marker that
  // says "Level 1 — Foundation" with the same border/background
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
        // L1 has no "level up" action — it's where everyone starts. Keep
        // the column balanced with a small label so the divider matches
        // L2/L3 proportions visually.
        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground">
          Baseline
        </span>
      ) : levelBreakActive ? (
        <button
          type="button"
          onClick={() => onLaunchCumulativeLevelUp(curLevel)}
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

  return (
    <Fragment>{dimHeader}{levelBreak}<div
      className={`rounded-md transition-colors ${
        isLocked ? 'bg-muted/10 hover:bg-muted/20 opacity-60' : 'bg-muted/20 hover:bg-muted/40'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (isLocked) {
            onLockPromptToggle()
            return
          }
          onToggleExpand()
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
        <span className="text-xs font-mono text-muted-foreground w-6 text-right shrink-0">
          {c.level ? `L${c.level}` : ''}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate">{c.name}</div>
          <div className="text-xs text-muted-foreground truncate">{c.description}</div>
        </div>
        {c.crossCutting && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 bg-purple-500/20 text-purple-400 cursor-help"
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
        <div className="px-8 pb-2 pt-1 text-xs border-t border-border/30 flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">
            Locked — reach <span className="font-mono text-foreground">L{nextLevel}</span> first
            {missingForNext > 0 && (
              <> ({missingForNext} {missingForNext === 1 ? 'criterion' : 'criteria'} still missing)</>
            )}.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCloseLockPrompt}
              className="text-muted-foreground hover:text-foreground"
            >
              Stay focused
            </button>
            <button
              type="button"
              onClick={onOverrideLocks}
              className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300"
            >
              <Unlock className="w-2.5 h-2.5" />
              Override anyway
            </button>
          </div>
        </div>
      )}
      {!isLocked && isExpanded && (
        // Fix #8851 — previously the click just made the bar taller, giving
        // no signal that a distinct "detail view" had opened. We now render
        // an inset detail panel with its own header and an explicit Close
        // control, so the click-to-open interaction is unambiguous and
        // dismissable.
        <div className="mx-2 mb-2 rounded-md border border-border/60 bg-background/60 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/20 rounded-t-md">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Details — {c.name}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCloseExpanded()
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('actions.close')}
              title={t('actions.close')}
            >
              <X className="w-3 h-3" />
              {t('actions.close')}
            </button>
          </div>
          <div className="px-3 pb-2 pt-1.5 text-xs space-y-1.5">
          {/* Details blurb — what it is, why it matters, how a mission implements it */}
          {c.details && (
            <p className="text-xs leading-relaxed text-muted-foreground/90 py-1">
              {c.details}
            </p>
          )}
          {SOURCES_BY_ID[c.source]?.url && (
            <div>
              <span className="text-muted-foreground">Cited from:</span>{' '}
              <a
                href={sanitizeUrl(SOURCES_BY_ID[c.source].url)}
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
                per-recommendation "Launch" button on the Your Role card so
                users get the same affordance from either entry point. */}
            {!detected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onLaunchOne(c)
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
}
