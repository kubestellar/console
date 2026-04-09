/**
 * Rewards Panel - shows user's coins, achievements, and ways to earn
 */

import { useState } from 'react'
import { Coins, Trophy, Gift, Bug, Lightbulb, Star, ChevronRight, GitPullRequest, GitMerge, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { Github } from '@/lib/icons'
import { StatusBadge } from '../ui/StatusBadge'
import { useRewards, REWARD_ACTIONS, ACHIEVEMENTS } from '../../hooks/useRewards'
import { GitHubInviteModal, GitHubInviteButton } from './GitHubInvite'
import { LinkedInShareCard } from './LinkedInShare'
import { GITHUB_REWARD_LABELS } from '../../types/rewards'
import type { GitHubContribution } from '../../types/rewards'

export function RewardsPanel() {
  const [showGitHubInvite, setShowGitHubInvite] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { totalCoins, earnedAchievements, recentEvents, hasEarnedAction, getActionCount, githubRewards, githubPoints, localCoins, bonusPoints, refreshGitHubRewards } = useRewards()

  const handleRefreshGitHub = async () => {
    setIsRefreshing(true)
    try {
      await refreshGitHubRewards()
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Coin Balance */}
      <div className="p-6 rounded-xl bg-gradient-to-br from-yellow-500/10 via-yellow-500/5 to-orange-500/10 border border-yellow-500/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Your Balance</p>
            <div className="flex items-center gap-3">
              <Coins className="w-8 h-8 text-yellow-500" />
              <span className="text-4xl font-bold text-yellow-400">{totalCoins.toLocaleString()}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">KubeStellar Coins</p>
            <p className="text-sm text-yellow-400">Earn more below!</p>
          </div>
        </div>
        {(githubPoints > 0 || localCoins > 0) && (
          <div className="mt-3 pt-3 border-t border-yellow-500/10 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span title="Points from GitHub contributions (PRs, issues) — shown on the public leaderboard">
              GitHub: <span className="text-green-400 font-medium">{githubPoints.toLocaleString()}</span>
            </span>
            {bonusPoints > 0 && (
              <>
                <span className="text-muted-foreground/40">+</span>
                <span title="Bonus points awarded by maintainer for challenges, videos, etc.">
                  Bonus: <span className="text-pink-400 font-medium">{bonusPoints.toLocaleString()}</span>
                </span>
              </>
            )}
            <span className="text-muted-foreground/40">+</span>
            <span title="Coins from in-app activity (missions, games, sharing) — stored in your browser only">
              Console: <span className="text-purple-400 font-medium">{localCoins.toLocaleString()}</span>
            </span>
            <span className="text-muted-foreground/40">=</span>
            <span className="text-yellow-400 font-medium">{totalCoins.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Ways to Earn */}
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-4">
          <Gift className="w-5 h-5 text-purple-400" />
          Ways to Earn Coins
        </h3>

        <div className="space-y-3">
          {/* GitHub Invite */}
          <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Github className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-foreground">Invite via GitHub</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Invite friends to contribute to KubeStellar
                </p>
                <div className="flex items-center justify-between">
                  <GitHubInviteButton onClick={() => setShowGitHubInvite(true)} />
                  {hasEarnedAction('github_invite') && (
                    <span className="text-xs text-green-400">Bonus earned!</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* LinkedIn Share */}
          <LinkedInShareCard />

          {/* Bug Reports */}
          <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Bug className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium text-foreground">Report Bugs</h4>
                  <StatusBadge color="yellow">+{REWARD_ACTIONS.bug_report.coins} each</StatusBadge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Found a bug? Report it on GitHub to earn coins!
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Reports: {getActionCount('bug_report')}
                </p>
              </div>
            </div>
          </div>

          {/* Feature Suggestions */}
          <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium text-foreground">Suggest Features</h4>
                  <StatusBadge color="yellow">+{REWARD_ACTIONS.feature_suggestion.coins} each</StatusBadge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Have an idea? Submit feature requests to earn coins!
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Suggestions: {getActionCount('feature_suggestion')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GitHub Contributions */}
      {githubRewards && githubRewards.breakdown && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Github className="w-5 h-5 text-foreground" />
              GitHub Contributions
            </h3>
            <button
              onClick={handleRefreshGitHub}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Points breakdown */}
          <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">GitHub Points</span>
              <span className="text-lg font-bold text-blue-400">{githubPoints.toLocaleString()}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {githubRewards.breakdown.prs_merged > 0 && (
                <StatusBadge color="purple" rounded="full" icon={<GitMerge className="w-3 h-3" />}>
                  {githubRewards.breakdown.prs_merged} Merged
                </StatusBadge>
              )}
              {githubRewards.breakdown.prs_opened > 0 && (
                <StatusBadge color="green" rounded="full" icon={<GitPullRequest className="w-3 h-3" />}>
                  {githubRewards.breakdown.prs_opened} PRs
                </StatusBadge>
              )}
              {githubRewards.breakdown.bug_issues > 0 && (
                <StatusBadge color="red" rounded="full" icon={<Bug className="w-3 h-3" />}>
                  {githubRewards.breakdown.bug_issues} Bugs
                </StatusBadge>
              )}
              {githubRewards.breakdown.feature_issues > 0 && (
                <StatusBadge color="yellow" rounded="full" icon={<Lightbulb className="w-3 h-3" />}>
                  {githubRewards.breakdown.feature_issues} Features
                </StatusBadge>
              )}
              {githubRewards.breakdown.other_issues > 0 && (
                <StatusBadge color="purple" rounded="full" className="!bg-gray-500/20 !text-muted-foreground dark:!bg-gray-400/20" icon={<AlertCircle className="w-3 h-3" />}>
                  {githubRewards.breakdown.other_issues} Issues
                </StatusBadge>
              )}
            </div>
          </div>

          {/* Recent contributions list */}
          {githubRewards.contributions?.length > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg">
              {githubRewards.contributions.slice(0, 20).map((contrib: GitHubContribution, idx: number) => (
                <a
                  key={`${contrib.repo}-${contrib.number}-${contrib.type}-${idx}`}
                  href={contrib.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <ContributionIcon type={contrib.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate group-hover:text-blue-400 transition-colors">
                        {contrib.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {contrib.repo} #{contrib.number} · {GITHUB_REWARD_LABELS[contrib.type]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-xs text-yellow-400 font-medium">+{contrib.points}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </a>
              ))}
            </div>
          )}

          {githubRewards.from_cache && (
            <p className="text-xs text-muted-foreground mt-2">
              {(() => {
                // Show lastUpdated timestamp when displaying cached GitHub rewards data
                const lastUpdated = githubRewards.cached_at ? new Date(githubRewards.cached_at) : null
                return lastUpdated ? `Cached ${lastUpdated.toLocaleTimeString()}` : 'Cached'
              })()}
            </p>
          )}
        </div>
      )}

      {/* Achievements */}
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-4">
          <Trophy className="w-5 h-5 text-yellow-400" />
          Achievements
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((achievement) => {
            const isEarned = earnedAchievements.some(a => a.id === achievement.id)
            return (
              <div
                key={achievement.id}
                className={`p-3 rounded-lg border text-center transition-all ${
                  isEarned
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-secondary/30 border-border opacity-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center ${
                  isEarned ? 'bg-yellow-500/20' : 'bg-secondary'
                }`}>
                  <Star className={`w-5 h-5 ${isEarned ? 'text-yellow-400' : 'text-muted-foreground'}`} />
                </div>
                <p className={`text-sm font-medium ${isEarned ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {achievement.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {achievement.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Activity */}
      {recentEvents.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-4">
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
            Recent Activity
          </h3>

          <div className="space-y-2">
            {recentEvents.slice(0, 5).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
              >
                <div className="flex items-center gap-3">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-foreground">
                    {REWARD_ACTIONS[event.action]?.label || event.action}
                  </span>
                </div>
                <span className="text-sm text-yellow-400 font-medium">
                  +{event.coins}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GitHub Invite Modal */}
      <GitHubInviteModal
        isOpen={showGitHubInvite}
        onClose={() => setShowGitHubInvite(false)}
      />
    </div>
  )
}

function ContributionIcon({ type }: { type: string }) {
  switch (type) {
    case 'pr_merged':
      return <GitMerge className="w-4 h-4 text-purple-400 flex-shrink-0" />
    case 'pr_opened':
      return <GitPullRequest className="w-4 h-4 text-green-400 flex-shrink-0" />
    case 'issue_bug':
      return <Bug className="w-4 h-4 text-red-400 flex-shrink-0" />
    case 'issue_feature':
      return <Lightbulb className="w-4 h-4 text-yellow-400 flex-shrink-0" />
    default:
      return <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  }
}
