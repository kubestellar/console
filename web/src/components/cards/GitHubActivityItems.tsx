import { memo } from 'react'
import { GitPullRequest, Package, TrendingUp, AlertCircle, Clock, CheckCircle, XCircle, GitMerge } from 'lucide-react'
import { formatTimeAgo } from '../../lib/formatters'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import type { GitHubPR, GitHubIssue, GitHubRelease, GitHubContributor } from './GitHubActivity.types'

const MS_PER_DAY_STALE = 14 * 24 * 60 * 60 * 1000
function isStale(date: string): boolean { return (Date.now() - new Date(date).getTime()) > MS_PER_DAY_STALE }

// Sub-components for rendering different item types
const PRItem = memo(function PRItem({ pr }: { pr: GitHubPR }) {
  const { t } = useTranslation(['cards', 'common'])
  const isOpen = pr.state === 'open'
  const isMerged = pr.merged_at != null
  const isStaleItem = isOpen && isStale(pr.updated_at)

  const statusText = isMerged ? t('cards:github.merged') : isOpen ? t('cards:github.open') : t('cards:github.closed')
  const statusTitle = isMerged ? t('cards:github.mergedPR') : isOpen ? t('cards:github.openPR') : t('cards:github.closedPR')

  return (
    <a
      href={sanitizeUrl(pr.html_url)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block p-3 rounded-lg hover:bg-secondary/40 border transition-colors",
        isOpen
          ? "bg-green-500/5 border-green-500/20 hover:border-green-500/30"
          : isMerged
            ? "bg-purple-500/5 border-purple-500/20 hover:border-purple-500/30"
            : "bg-secondary/20 border-border/50"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5" title={statusTitle}>
          {isMerged ? (
            <GitMerge className="w-4 h-4 text-purple-400" />
          ) : isOpen ? (
            <GitPullRequest className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate">#{pr.number} {pr.title}</span>
            {/* Status badge */}
            <span className={cn(
              "text-xs px-2 py-0.5 rounded shrink-0",
              isMerged
                ? "bg-purple-500/20 text-purple-400"
                : isOpen
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
            )}>
              {statusText}
            </span>
            {pr.draft && (
              <StatusBadge color="gray" size="md" className="shrink-0">{t('cards:github.draft')}</StatusBadge>
            )}
            {isStaleItem && (
              <StatusBadge color="yellow" size="md" className="shrink-0">{t('cards:github.stale')}</StatusBadge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <img src={pr.user.avatar_url} alt={pr.user.login} className="w-4 h-4 rounded-full" loading="lazy" width={16} height={16} />
              {pr.user.login}
            </span>
            <span className="flex items-center gap-1" title={`Updated ${formatTimeAgo(pr.updated_at, { extended: true })}`}>
              <Clock className="w-3 h-3" />
              {formatTimeAgo(pr.updated_at, { extended: true })}
            </span>
          </div>
        </div>
      </div>
    </a>
  )
})

const IssueItem = memo(function IssueItem({ issue }: { issue: GitHubIssue }) {
  const { t } = useTranslation(['cards', 'common'])
  const isOpen = issue.state === 'open'
  const isStaleItem = isOpen && isStale(issue.updated_at)

  return (
    <a
      href={sanitizeUrl(issue.html_url)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block p-3 rounded-lg hover:bg-secondary/40 border transition-colors",
        isOpen
          ? "bg-orange-500/5 border-orange-500/20 hover:border-orange-500/30"
          : "bg-secondary/20 border-border/50"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5" title={isOpen ? t('cards:github.openIssue') : t('cards:github.closedIssue')}>
          {isOpen ? (
            <AlertCircle className="w-4 h-4 text-orange-400" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate">#{issue.number} {issue.title}</span>
            {/* Status badge - show Open or Closed */}
            <span className={cn(
              "text-xs px-2 py-0.5 rounded shrink-0",
              isOpen
                ? "bg-orange-500/20 text-orange-400"
                : "bg-green-500/20 text-green-400"
            )}>
              {isOpen ? t('cards:github.open') : t('cards:github.closed')}
            </span>
            {isStaleItem && (
              <StatusBadge color="yellow" size="md" className="shrink-0">{t('cards:github.stale')}</StatusBadge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <img src={issue.user.avatar_url} alt={issue.user.login} className="w-4 h-4 rounded-full" loading="lazy" width={16} height={16} />
              {issue.user.login}
            </span>
            <span className="flex items-center gap-1" title={`Updated ${formatTimeAgo(issue.updated_at, { extended: true })}`}>
              <Clock className="w-3 h-3" />
              {formatTimeAgo(issue.updated_at, { extended: true })}
            </span>
            {issue.comments > 0 && (
              <span title={`${issue.comments} ${t('cards:github.comments')}`}>{issue.comments} {t('cards:github.comments')}</span>
            )}
          </div>
        </div>
      </div>
    </a>
  )
})

const ReleaseItem = memo(function ReleaseItem({ release }: { release: GitHubRelease }) {
  const { t } = useTranslation(['cards'])
  return (
    <a
      href={sanitizeUrl(release.html_url)}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Package className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{release.name || release.tag_name}</span>
            {release.prerelease && (
              <StatusBadge color="orange" size="md">{t('cards:github.preRelease')}</StatusBadge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{release.author.login}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(release.published_at, { extended: true })}
            </span>
          </div>
        </div>
      </div>
    </a>
  )
})

const ContributorItem = memo(function ContributorItem({ contributor }: { contributor: GitHubContributor }) {
  const { t } = useTranslation(['cards'])
  return (
    <a
      href={sanitizeUrl(contributor.html_url)}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <img src={contributor.avatar_url} alt={contributor.login} className="w-10 h-10 rounded-full" loading="lazy" width={40} height={40} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{contributor.login}</div>
          <div className="text-xs text-muted-foreground">
            {contributor.contributions} {t('cards:github.contributions')}
          </div>
        </div>
        <TrendingUp className="w-4 h-4 text-green-400" aria-hidden="true" />
      </div>
    </a>
  )
})

export { PRItem, IssueItem, ReleaseItem, ContributorItem }
