/**
 * MissionBrowserFilterPanel
 *
 * The collapsible filter bar rendered below the top bar in the Mission Browser.
 * Contains: match-percent buttons, source filter, category filter, class filter,
 * maturity filter, difficulty filter, CNCF project text input, and top-tag chips.
 *
 * Extracted from MissionBrowser.tsx (issue #8624).
 */

import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { CATEGORY_FILTERS } from './missionBrowserConstants'

interface FacetCounts {
  clusterMatched: number
  community: number
  missionClass: Map<string, number>
  maturity: Map<string, number>
  difficulty: Map<string, number>
  topTags: { tag: string; count: number }[]
}

interface MissionBrowserFilterPanelProps {
  activeFilterCount: number
  onClearAllFilters: () => void

  minMatchPercent: number
  onMinMatchPercentChange: (value: number) => void

  matchSourceFilter: 'all' | 'cluster' | 'community'
  onMatchSourceFilterChange: (value: 'all' | 'cluster' | 'community') => void

  categoryFilter: string
  onCategoryFilterChange: (value: string) => void

  missionClassFilter: string
  onMissionClassFilterChange: (value: string) => void

  maturityFilter: string
  onMaturityFilterChange: (value: string) => void

  difficultyFilter: string
  onDifficultyFilterChange: (value: string) => void

  cncfFilter: string
  onCncfFilterChange: (value: string) => void

  selectedTags: Set<string>
  onTagToggle: (tag: string) => void
  onClearTags: () => void

  facetCounts: FacetCounts

  recommendationsTotal: number
  filteredRecommendationsCount: number
}

const MATCH_PCT_OPTIONS = [0, 25, 50, 75] as const

export function MissionBrowserFilterPanel({
  activeFilterCount,
  onClearAllFilters,
  minMatchPercent,
  onMinMatchPercentChange,
  matchSourceFilter,
  onMatchSourceFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  missionClassFilter,
  onMissionClassFilterChange,
  maturityFilter,
  onMaturityFilterChange,
  difficultyFilter,
  onDifficultyFilterChange,
  cncfFilter,
  onCncfFilterChange,
  selectedTags,
  onTagToggle,
  onClearTags,
  facetCounts,
  recommendationsTotal,
  filteredRecommendationsCount,
}: MissionBrowserFilterPanelProps) {
  const { t } = useTranslation('common')
  const showZeroResultsGuidance = recommendationsTotal > 0 && filteredRecommendationsCount === 0 && activeFilterCount > 0

  return (
    <div className="px-4 py-2.5 bg-card border-b border-border space-y-2 max-h-[40vh] md:max-h-[50vh] overflow-y-auto">
      <div className="flex items-center gap-3 flex-wrap">
        {activeFilterCount > 0 && (
          <button
            onClick={onClearAllFilters}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
          >
            <X className="w-3 h-3" />
            {t('actions.clearAll')}
          </button>
        )}

        <span className="text-xs text-muted-foreground font-medium">{t('missionBrowser.match')}</span>
        <div className="flex items-center gap-1">
          {MATCH_PCT_OPTIONS.map((pct) => (
            <button
              key={pct}
              onClick={() => onMinMatchPercentChange(pct)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-full transition-colors tabular-nums',
                minMatchPercent === pct
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              {pct === 0 ? t('missionBrowser.matchAny') : `≥${pct}%`}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        <span className="text-xs text-muted-foreground font-medium">{t('missionBrowser.source')}</span>
        <div className="flex items-center gap-1">
          {(
            [
              ['all', t('missionBrowser.sourceAll'), null],
              ['cluster', t('missionBrowser.sourceCluster'), facetCounts.clusterMatched],
              ['community', t('missionBrowser.sourceCommunity'), facetCounts.community],
            ] as const
          ).map(([val, label, count]) => (
            <button
              key={val}
              onClick={() => onMatchSourceFilterChange(val)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-full transition-colors',
                matchSourceFilter === val
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              {label}
              {count != null ? ` (${count})` : ''}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        <span className="text-xs text-muted-foreground font-medium">{t('missionBrowser.category')}</span>
        <div className="flex items-center gap-1">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryFilterChange(cat)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-full transition-colors',
                categoryFilter === cat
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">{t('missionBrowser.class')}</span>
        <div className="flex items-center gap-1">
          {['All', ...Array.from(facetCounts.missionClass.keys())].map((cls) => (
            <button
              key={cls}
              onClick={() => onMissionClassFilterChange(cls)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-full transition-colors capitalize',
                missionClassFilter === cls
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              {cls === 'All' ? cls : `${cls} (${facetCounts.missionClass.get(cls) || 0})`}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        <span className="text-xs text-muted-foreground font-medium">{t('missionBrowser.maturity')}</span>
        <div className="flex items-center gap-1">
          {['All', ...Array.from(facetCounts.maturity.keys())].map((mat) => (
            <button
              key={mat}
              onClick={() => onMaturityFilterChange(mat)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-full transition-colors capitalize',
                maturityFilter === mat
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              {mat === 'All' ? mat : `${mat} (${facetCounts.maturity.get(mat) || 0})`}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        <span className="text-xs text-muted-foreground font-medium">{t('missionBrowser.difficulty')}</span>
        <div className="flex items-center gap-1">
          {['All', ...Array.from(facetCounts.difficulty.keys())].map((diff) => (
            <button
              key={diff}
              onClick={() => onDifficultyFilterChange(diff)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-full transition-colors capitalize',
                difficultyFilter === diff
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              {diff === 'All' ? diff : `${diff} (${facetCounts.difficulty.get(diff) || 0})`}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        <span className="text-xs text-muted-foreground font-medium">{t('missionBrowser.cncf')}</span>
        <input
          type="text"
          value={cncfFilter}
          onChange={(e) => onCncfFilterChange(e.target.value)}
          placeholder={t('missionBrowser.cncfPlaceholder')}
          className="w-36 px-2 py-0.5 text-[11px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/40"
        />
      </div>

      {facetCounts.topTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">{t('missionBrowser.tags')}</span>
          {facetCounts.topTags.map(({ tag, count }: { tag: string; count: number }) => (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-full transition-colors',
                selectedTags.has(tag)
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              {tag} <span className="opacity-60">({count})</span>
            </button>
          ))}
          {selectedTags.size > 0 && (
            <button
              onClick={onClearTags}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              {t('missionBrowser.clearTags')}
            </button>
          )}
        </div>
      )}

      {recommendationsTotal > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground">
            {activeFilterCount > 0
              ? t('missionBrowser.filteredSummary', { shown: filteredRecommendationsCount, total: recommendationsTotal })
              : t('missionBrowser.summary', { shown: filteredRecommendationsCount, total: recommendationsTotal })}
          </div>
          {showZeroResultsGuidance && (
            <div className="text-[11px] text-muted-foreground">
              <div>{t('missionBrowser.noMissionsMatchFilters')}</div>
              <button
                onClick={onClearAllFilters}
                className="mt-1 underline text-purple-400 hover:text-purple-300"
              >
                {t('missionBrowser.clearAllFiltersAction')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
