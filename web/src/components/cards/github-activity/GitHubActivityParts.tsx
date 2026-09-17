import { GitPullRequest, GitBranch, Star, Users, Package, X, Plus, Check, AlertCircle } from 'lucide-react'
import type { TFunction } from 'i18next'
import { Skeleton } from '../../ui/Skeleton'
import { Input } from '../../ui/Input'
import { cn } from '../../../lib/cn'
import type { ViewMode } from '../GitHubActivity.types'
import { TIME_RANGES, type TimeRange, type GitHubActivityStats } from '../GitHubActivity.sorting'

export function GitHubActivitySkeleton() {
  return (
    <div className="h-full flex flex-col min-h-card">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <Skeleton variant="text" width={150} height={16} />
        <Skeleton variant="rounded" width={100} height={28} />
      </div>
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-4">
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
      <div className="space-y-2">
        <Skeleton variant="rounded" height={70} />
        <Skeleton variant="rounded" height={70} />
        <Skeleton variant="rounded" height={70} />
      </div>
    </div>
  )
}

interface GitHubRepoEditorProps {
  savedRepos: string[]
  currentRepo: string
  repoInput: string
  setRepoInput: (value: string) => void
  onAddRepo: () => void
  onSelectRepo: (repo: string) => void
  onRemoveRepo: (repo: string) => void
  onDone: () => void
  t: TFunction<['cards', 'common']>
  /** 'error' renders the error-state variant (yellow active pill, extra icon) */
  variant?: 'default' | 'error'
}

// Inline repo editor (matching GitHubCIMonitor pattern)
export function GitHubRepoEditor({
  savedRepos,
  currentRepo,
  repoInput,
  setRepoInput,
  onAddRepo,
  onSelectRepo,
  onRemoveRepo,
  onDone,
  t,
  variant = 'default' }: GitHubRepoEditorProps) {
  const isError = variant === 'error'
  const labels = isError
    ? { add: t('cards:github.addRepo'), done: t('cards:github.done'), remove: t('cards:github.removeRepo') }
    : { add: t('cards:githubActivity.addRepo'), done: t('cards:githubActivity.done'), remove: t('cards:githubActivity.removeRepo') }
  return (
    <div className={cn('rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 mb-3 space-y-2', !isError && 'shrink-0')}>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputSize="sm"
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAddRepo()}
          placeholder="owner/repo (e.g., facebook/react)"
          className="flex-1 rounded bg-secondary border border-border text-foreground"
        />
        <button
          onClick={onAddRepo}
          disabled={!repoInput.trim()}
          className="p-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
          title={labels.add}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDone}
          className="p-1 rounded hover:bg-secondary text-muted-foreground"
          title={labels.done}
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {savedRepos.map((repo) => (
          <span
            key={repo}
            onClick={() => onSelectRepo(repo)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors",
              repo === currentRepo
                ? isError
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
                  : "bg-purple-500/30 text-purple-400 border border-purple-500/50"
                : "bg-purple-500/10 text-purple-400/70 border border-purple-500/20 hover:bg-purple-500/20"
            )}
          >
            {isError && repo === currentRepo && <AlertCircle className="w-3 h-3" />}
            {repo}
            {savedRepos.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveRepo(repo) }}
                className="hover:text-red-400 transition-colors"
                title={labels.remove}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

// Placeholder stats grid shown while the card is in an error state
export function GitHubStatsPlaceholder({ t }: { t: TFunction<['cards', 'common']> }) {
  return (
    <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-4">
      <div className="bg-secondary/30 rounded-lg p-3 border border-border/50 opacity-50">
        <div className="flex items-center gap-2 mb-1">
          <GitPullRequest className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-muted-foreground">{t('cards:github.openPRs')}</span>
        </div>
        <div className="text-lg font-bold text-muted-foreground">--</div>
      </div>
      <div className="bg-secondary/30 rounded-lg p-3 border border-border/50 opacity-50">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-4 h-4 text-green-400" />
          <span className="text-xs text-muted-foreground">{t('cards:github.merged')}</span>
        </div>
        <div className="text-lg font-bold text-muted-foreground">--</div>
      </div>
      <div className="bg-secondary/30 rounded-lg p-3 border border-border/50 opacity-50">
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle className="w-4 h-4 text-orange-400" />
          <span className="text-xs text-muted-foreground">{t('cards:github.openIssues')}</span>
        </div>
        <div className="text-lg font-bold text-muted-foreground">--</div>
      </div>
      <div className="bg-secondary/30 rounded-lg p-3 border border-border/50 opacity-50">
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-4 h-4 text-yellow-400" />
          <span className="text-xs text-muted-foreground">{t('cards:github.stars')}</span>
        </div>
        <div className="text-lg font-bold text-muted-foreground">--</div>
      </div>
    </div>
  )
}

export function GitHubStatsGrid({ stats, t }: { stats: GitHubActivityStats; t: TFunction<['cards', 'common']> }) {
  return (
    <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-3 shrink-0">
      <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
        <div className="flex items-center gap-2 mb-1">
          <GitPullRequest className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-muted-foreground">{t('cards:github.openPRs')}</span>
        </div>
        <div className="text-lg font-bold">{stats.openPRs}</div>
        {stats.stalePRs > 0 && (
          <div className="text-xs text-yellow-400 mt-1">{stats.stalePRs} {t('cards:github.stale')}</div>
        )}
      </div>
      <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-4 h-4 text-green-400" />
          <span className="text-xs text-muted-foreground">{t('cards:github.merged')}</span>
        </div>
        <div className="text-lg font-bold">{stats.mergedPRs}</div>
      </div>
      <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle className="w-4 h-4 text-orange-400" />
          <span className="text-xs text-muted-foreground">Open Issues</span>
        </div>
        <div className="text-lg font-bold">{stats.openIssues}</div>
        {stats.staleIssues > 0 && (
          <div className="text-xs text-yellow-400 mt-1">{stats.staleIssues} {t('cards:github.stale')}</div>
        )}
      </div>
      <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-4 h-4 text-yellow-400" />
          <span className="text-xs text-muted-foreground">Stars</span>
        </div>
        <div className="text-lg font-bold">{stats.stars}</div>
      </div>
    </div>
  )
}

function getViewModeTabs(t: TFunction<['cards', 'common']>): { value: ViewMode; icon: typeof GitPullRequest; label: string }[] {
  return [
    { value: 'prs', icon: GitPullRequest, label: t('cards:github.pullRequests') },
    { value: 'issues', icon: AlertCircle, label: t('cards:github.issues') },
    { value: 'releases', icon: Package, label: t('cards:github.releases') },
    { value: 'contributors', icon: Users, label: t('cards:github.contributors') },
  ]
}

// View Mode Tabs (act as filter pills)
export function GitHubViewModeTabs({
  viewMode,
  setViewMode,
  t }: { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void; t: TFunction<['cards', 'common']> }) {
  return (
    <div className="flex items-center gap-1 mb-3 overflow-x-auto shrink-0">
      {getViewModeTabs(t).map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setViewMode(value)}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap',
            viewMode === value
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <Icon className="w-3 h-3 inline mr-1" />
          {label}
        </button>
      ))}
    </div>
  )
}

export function GitHubTimeRangeControls({
  timeRange,
  setTimeRange,
  t }: { timeRange: TimeRange; setTimeRange: (range: TimeRange) => void; t: TFunction<['cards', 'common']> }) {
  return (
    <div className="flex items-center gap-2 mb-3 shrink-0">
      <span className="text-xs text-muted-foreground">{t('cards:github.timeRange')}:</span>
      {TIME_RANGES.map(range => (
        <button
          key={range.value}
          onClick={() => setTimeRange(range.value)}
          className={cn(
            'px-2 py-1 text-xs rounded transition-colors',
            timeRange === range.value
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:bg-secondary/50'
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  )
}
