/**
 * ContributorLadder — shows current level, progress to next, and the full ladder
 */

import { useState } from 'react'
import {
  Telescope, Compass, Map, Rocket, Shield, Star, Crown, Sparkles,
  Coins, ChevronDown, ChevronUp, Linkedin,
} from 'lucide-react'
import { useRewards } from '../../hooks/useRewards'
import { getContributorLevel, CONTRIBUTOR_LEVELS } from '../../types/rewards'
import type { ContributorLevel } from '../../types/rewards'

const LEVEL_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Telescope,
  Compass,
  Map,
  Rocket,
  Shield,
  Star,
  Crown,
  Sparkles,
}

function LevelIcon({ level, className }: { level: ContributorLevel; className?: string }) {
  const Icon = LEVEL_ICONS[level.icon] || Star
  return <Icon className={className} />
}

/** Compact banner showing coins + level for the top of the Updates tab */
export function ContributorBanner() {
  const { totalCoins, githubPoints } = useRewards()
  const { current, next, progress, coinsToNext } = getContributorLevel(totalCoins)
  const [showLadder, setShowLadder] = useState(false)

  const handleLinkedInShare = () => {
    const text = `I'm a Level ${current.rank} "${current.name}" contributor on the KubeStellar Console with ${totalCoins.toLocaleString()} coins! Join the open-source KubeStellar project and start your contributor journey.`
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://kubestellar.io')}&summary=${encodeURIComponent(text)}`
    window.open(linkedInUrl, '_blank', 'width=600,height=600')
  }

  return (
    <div className="border-b border-border/50">
      {/* Main banner */}
      <div className="px-3 py-2.5">
        {/* Top row: coins + level badge + share */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-lg font-bold text-yellow-400">{totalCoins.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">coins</span>
            </div>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${current.bgClass} ${current.borderClass}`}>
              <LevelIcon level={current} className={`w-3 h-3 ${current.textClass}`} />
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${current.textClass}`}>
                {current.name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {totalCoins > 0 && (
              <button
                onClick={handleLinkedInShare}
                className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-[#0A66C2] transition-colors"
                title={`Share your ${current.name} status on LinkedIn`}
              >
                <Linkedin className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowLadder(!showLadder)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showLadder ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Levels
            </button>
          </div>
        </div>

        {/* Progress bar to next level */}
        {next ? (
          <div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span className={current.textClass}>{current.name}</span>
              <span>{coinsToNext.toLocaleString()} coins to {next.name}</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  current.color === 'gray' ? 'bg-gray-400' :
                  current.color === 'blue' ? 'bg-blue-400' :
                  current.color === 'cyan' ? 'bg-cyan-400' :
                  current.color === 'green' ? 'bg-green-400' :
                  current.color === 'purple' ? 'bg-purple-400' :
                  current.color === 'amber' ? 'bg-amber-400' :
                  current.color === 'orange' ? 'bg-orange-400' :
                  'bg-yellow-400'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-yellow-400 text-center">
            Max level reached!
          </div>
        )}

        {githubPoints > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Includes {githubPoints.toLocaleString()} from GitHub contributions
          </p>
        )}
      </div>

      {/* Expandable ladder */}
      {showLadder && (
        <div className="px-3 pb-3 pt-1">
          <div className="space-y-1">
            {CONTRIBUTOR_LEVELS.map((level) => {
              const isCurrentLevel = level.rank === current.rank
              const isUnlocked = totalCoins >= level.minCoins
              return (
                <div
                  key={level.rank}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                    isCurrentLevel
                      ? `${level.bgClass} border ${level.borderClass}`
                      : isUnlocked
                        ? 'bg-secondary/20'
                        : 'opacity-40'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isUnlocked ? level.bgClass : 'bg-secondary'
                  }`}>
                    <LevelIcon
                      level={level}
                      className={`w-3.5 h-3.5 ${isUnlocked ? level.textClass : 'text-muted-foreground'}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-medium ${isUnlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {level.name}
                      </span>
                      {isCurrentLevel && (
                        <span className={`text-[9px] px-1 py-0.5 rounded ${level.bgClass} ${level.textClass} font-bold uppercase`}>
                          You
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono ${isUnlocked ? level.textClass : 'text-muted-foreground'}`}>
                    {level.minCoins.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
