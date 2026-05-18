import { AlertCircle, Bug, ExternalLink, GitMerge, GitPullRequest, Lightbulb, RefreshCw } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { Github, Linkedin } from '@/lib/icons'
import { emitLinkedInShare } from '../../lib/analytics'
import { GITHUB_REWARD_LABELS } from '../../types/rewards'
import type { GitHubContribution } from '../../types/rewards'
import { GitHubContributionIcon } from './FeatureRequestTypes'
import type { GitHubContributionsSectionProps } from './UpdatesTab.types'
import { isTriaged } from '../../hooks/useFeatureRequests'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'

const LINKEDIN_POPUP_SIZE = 600

export function GitHubContributionsSection({
  currentGitHubLogin,
  githubRewards,
  githubPoints,
  isGitHubRefreshing,
  onRefreshGitHub,
  requests,
  requestsLoading,
}: GitHubContributionsSectionProps) {
  return (
    <>
      <div className="p-2 border-b border-border/50 flex items-center justify-between shrink-0">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Github className="w-3 h-3" />
          {currentGitHubLogin ? `${currentGitHubLogin}'s` : ''} GitHub Contributions
          {githubRewards && (
            <span className="ml-1 text-yellow-400 font-bold">{githubPoints.toLocaleString()} coins</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {githubRewards && githubPoints > 0 && (
            <button
              onClick={() => {
                const breakdown = githubRewards.breakdown
                const prCount = (breakdown?.prs_merged ?? 0) + (breakdown?.prs_opened ?? 0)
                const issueCount = (breakdown?.bug_issues ?? 0) + (breakdown?.feature_issues ?? 0) + (breakdown?.other_issues ?? 0)
                const text = `I've earned ${githubPoints.toLocaleString()} contributor coins on the KubeStellar Console! ${prCount > 0 ? `${prCount} PRs` : ''}${prCount > 0 && issueCount > 0 ? ' and ' : ''}${issueCount > 0 ? `${issueCount} issues` : ''} contributed to the open-source KubeStellar project.`
                const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://kubestellar.io')}&summary=${encodeURIComponent(text)}`
                window.open(linkedInUrl, '_blank', `noopener,noreferrer,width=${LINKEDIN_POPUP_SIZE},height=${LINKEDIN_POPUP_SIZE}`)
                emitLinkedInShare('feature_request')
              }}
              className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-linkedin transition-colors"
              title={`Share ${githubPoints.toLocaleString()} coins on LinkedIn`}
            >
              <Linkedin className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onRefreshGitHub}
            disabled={isGitHubRefreshing}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isGitHubRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {githubRewards?.breakdown && (
        <div className="px-3 py-2 border-b border-border/50 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {githubRewards.breakdown.prs_merged > 0 && (
              <StatusBadge color="purple" size="xs" rounded="full" icon={<GitMerge className="w-2.5 h-2.5" />}>
                {githubRewards.breakdown.prs_merged} Merged
              </StatusBadge>
            )}
            {githubRewards.breakdown.prs_opened > 0 && (
              <StatusBadge color="green" size="xs" rounded="full" icon={<GitPullRequest className="w-2.5 h-2.5" />}>
                {githubRewards.breakdown.prs_opened} PRs
              </StatusBadge>
            )}
            {githubRewards.breakdown.bug_issues > 0 && (
              <StatusBadge
                color="red"
                size="xs"
                rounded="full"
                icon={<Bug className="w-2.5 h-2.5" />}
                title="All bug-labeled GitHub issues you authored across our orgs. The Rewards panel's 'Report Bugs' counter only includes bugs submitted through this console and will be smaller."
              >
                {githubRewards.breakdown.bug_issues} Bugs
              </StatusBadge>
            )}
            {githubRewards.breakdown.feature_issues > 0 && (
              <StatusBadge
                color="yellow"
                size="xs"
                rounded="full"
                icon={<Lightbulb className="w-2.5 h-2.5" />}
                title="All feature-labeled GitHub issues you authored across our orgs. The Rewards panel's 'Suggest Features' counter only includes features submitted through this console and will be smaller."
              >
                {githubRewards.breakdown.feature_issues} Features
              </StatusBadge>
            )}
            {githubRewards.breakdown.other_issues > 0 && (
              <StatusBadge color="purple" size="xs" rounded="full" className="bg-gray-500/20! text-muted-foreground!" icon={<AlertCircle className="w-2.5 h-2.5" />}>
                {githubRewards.breakdown.other_issues} Issues
              </StatusBadge>
            )}
          </div>
        </div>
      )}

      {!githubRewards ? (
        <EmptyContributionState message="Log in with GitHub to see contributions" />
      ) : !githubRewards.contributions?.length ? (
        <EmptyContributionState message="No contributions found — open issues or PRs to earn points" />
      ) : (
        (() => {
          const requestsReady = !requestsLoading && requests.length > 0
          const untriagedIssueNumbers = new Set(
            (requests || [])
              .filter((request) => !isTriaged(request.status) && request.github_issue_number)
              .map((request) => request.github_issue_number),
          )

          return githubRewards.contributions.map((contribution: GitHubContribution, index: number) => {
            const isConsoleIssue = contribution.type.startsWith('issue_') && contribution.repo?.includes('console')
            const isUntriaged = requestsReady
              ? untriagedIssueNumbers.has(contribution.number)
              : isConsoleIssue

            return (
              <a
                key={`${contribution.repo}-${contribution.number}-${contribution.type}-${index}`}
                href={sanitizeUrl(contribution.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2.5 border-b border-border/50 hover:bg-secondary/30 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <GitHubContributionIcon type={contribution.type} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm text-foreground truncate group-hover:text-blue-400 transition-colors ${isUntriaged ? 'blur-xs select-none' : ''}`}>
                      {contribution.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{currentGitHubLogin} · {contribution.repo} #{contribution.number} · {GITHUB_REWARD_LABELS[contribution.type]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-yellow-400 font-medium">+{contribution.points}</span>
                  <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </a>
            )
          })
        })()
      )}

      {githubRewards && currentGitHubLogin && (
        <div className="p-2.5 border-t border-border/50 text-center">
          <a
            href={`https://github.com/search?q=author:${encodeURIComponent(currentGitHubLogin)}+org:kubestellar+org:llm-d+org:clubanderson&type=issues&s=updated&o=desc`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all contributions on GitHub
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {githubRewards?.from_cache && (
        <div className="p-2 border-t border-border/50">
          <p className="text-2xs text-muted-foreground text-center">
            Cached {new Date(githubRewards.cached_at).toLocaleTimeString()}
          </p>
        </div>
      )}
    </>
  )
}

function EmptyContributionState({ message }: { message: string }) {
  return (
    <div className="p-6 text-center text-muted-foreground">
      <Github className="w-6 h-6 mx-auto mb-2 opacity-50" />
      <p className="text-xs">{message}</p>
    </div>
  )
}
