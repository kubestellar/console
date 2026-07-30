import { cn } from '../../lib/cn'
import { LogoWithStar } from './LogoWithStar'

interface ConsoleAIIconProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * KubeStellar Console AI icon with star treatment.
 */
export function ConsoleAIIcon({ className, size = 'md' }: ConsoleAIIconProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  return (
    <LogoWithStar
      className={cn(sizeClasses[size], className)}
      alt="Console AI"
    />
  )
}
