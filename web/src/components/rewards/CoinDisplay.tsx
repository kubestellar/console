/**
 * Coin display component for showing user's coin balance
 */

import { Coins } from 'lucide-react'
import { useRewards } from '../../hooks/useRewards'
import { useTranslation } from 'react-i18next'

interface CoinDisplayProps {
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export function CoinDisplay({ size = 'md', showLabel = false, className = '' }: CoinDisplayProps) {
  const { t: _t } = useTranslation()
  const { totalCoins, isLoading } = useRewards()

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
    <div
      className={`flex items-center gap-1.5 ${sizeClasses[size]} ${className}`}
      title={`${totalCoins.toLocaleString()} coins`}
    >
      <Coins className={`${iconSizes[size]} text-yellow-500`} />
      <span className="font-medium text-foreground">{totalCoins.toLocaleString()}</span>
      {showLabel && <span className="text-muted-foreground">coins</span>}
    </div>
  )
}

// Compact version for header/navbar
export function CoinBadge({ className = '' }: { className?: string }) {
  const { totalCoins, isLoading } = useRewards()

  if (isLoading) {
    return null
  }

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 ${className}`}
      title={`${totalCoins.toLocaleString()} coins`}
    >
      <Coins className="w-3.5 h-3.5 text-yellow-500" />
      <span className="text-xs font-medium text-yellow-400">{totalCoins.toLocaleString()}</span>
    </div>
  )
}
