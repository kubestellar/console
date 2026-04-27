/**
 * Coin display component for showing user's coin balance.
 *
 * Both CoinDisplay and CoinBadge wrap the coin count in a Tooltip that
 * explains coins update periodically (same cadence as the leaderboard),
 * addressing user confusion about delayed balance changes (#10495).
 */

import { Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useRewards } from '../../hooks/useRewards'
import { Tooltip } from '../ui/Tooltip'

interface CoinDisplayProps {
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export function CoinDisplay({ size = 'md', showLabel = false, className = '' }: CoinDisplayProps) {
  const { totalCoins, isLoading } = useRewards()
  const { t } = useTranslation()

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1.5 ${sizeClasses[size]} ${className}`}>
        <div className={`${iconSizes[size]} rounded-full bg-yellow-500/20 animate-pulse`} />
        <span className="text-muted-foreground">...</span>
      </div>
    )
  }

  return (
    <Tooltip content={t('profile.coinsUpdateHint')} side="bottom">
      <div
        className={`flex items-center gap-1.5 ${sizeClasses[size]} ${className} cursor-help`}
      >
        <Coins className={`${iconSizes[size]} text-yellow-500`} />
        <span className="font-medium text-foreground">{totalCoins.toLocaleString()}</span>
        {showLabel && <span className="text-muted-foreground">coins</span>}
      </div>
    </Tooltip>
  )
}

// Compact version for header/navbar
export function CoinBadge({ className = '' }: { className?: string }) {
  const { totalCoins, isLoading } = useRewards()
  const { t } = useTranslation()

  if (isLoading) {
    return null
  }

  return (
    <Tooltip content={t('profile.coinsUpdateHint')} side="bottom">
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 cursor-help ${className}`}
      >
        <Coins className="w-3.5 h-3.5 text-yellow-500" />
        <span className="text-xs font-medium text-yellow-400">{totalCoins.toLocaleString()}</span>
      </div>
    </Tooltip>
  )
}
