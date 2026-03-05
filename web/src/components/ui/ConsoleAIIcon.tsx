import { cn } from '../../lib/cn'

interface ConsoleAIIconProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * KubeStellar Console AI icon — clean logo without decorative overlays.
 */
export function ConsoleAIIcon({ className, size = 'md' }: ConsoleAIIconProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  return (
    <img
      src="/kubestellar-logo.svg"
      alt=""
      className={cn(sizeClasses[size], className)}
    />
  )
}
