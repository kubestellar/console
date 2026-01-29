import { Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ConsoleAIIconProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * KubeStellar Console AI icon - KubeStellar logo with AI sparkle effect.
 * Uses the same pattern as the Tour component for consistency.
 */
export function ConsoleAIIcon({ className, size = 'md' }: ConsoleAIIconProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }
  const sparkleSizeClasses = {
    sm: 'w-2 h-2 -top-0.5 -right-0.5',
    md: 'w-2.5 h-2.5 -top-0.5 -right-0.5',
    lg: 'w-3 h-3 -top-1 -right-1',
  }

  return (
    <div className={cn('relative inline-flex', sizeClasses[size], className)}>
      <img
        src="/kubestellar-logo.svg"
        alt=""
        className="w-full h-full"
      />
      <Sparkles className={cn('absolute text-purple-400 animate-pulse', sparkleSizeClasses[size])} />
    </div>
  )
}
