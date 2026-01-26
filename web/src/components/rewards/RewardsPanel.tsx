/**
 * Rewards Panel - shows user's coins, achievements, and ways to earn
 */

import { useState } from 'react'
import { Coins, Trophy, Gift, Github, Bug, Lightbulb, Star, ChevronRight } from 'lucide-react'
import { useRewards, REWARD_ACTIONS, ACHIEVEMENTS } from '../../hooks/useRewards'
import { GitHubInviteModal, GitHubInviteButton } from './GitHubInvite'
import { LinkedInShareCard } from './LinkedInShare'

export function RewardsPanel() {
  const [showGitHubInvite, setShowGitHubInvite] = useState(false)
  const { totalCoins, earnedAchievements, recentEvents, hasEarnedAction, getActionCount } = useRewards()

  return (
    <div className="space-y-6">
      {/* Coin Balance */}
      <div className="p-6 rounded-xl bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-orange-500/10 border border-yellow-500/20">
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
                  <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs">
                    +{REWARD_ACTIONS.bug_report.coins} each
                  </span>
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
                  <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs">
                    +{REWARD_ACTIONS.feature_suggestion.coins} each
                  </span>
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

      {/* Achievements */}
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-4">
          <Trophy className="w-5 h-5 text-amber-400" />
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
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-secondary/30 border-border opacity-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center ${
                  isEarned ? 'bg-amber-500/20' : 'bg-secondary'
                }`}>
                  <Star className={`w-5 h-5 ${isEarned ? 'text-amber-400' : 'text-muted-foreground'}`} />
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
