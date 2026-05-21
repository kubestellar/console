import { cn } from '../../../lib/cn'

interface GenerationResultBannerProps {
  message: string
  type: 'success' | 'warning'
}

export function GenerationResultBanner({ message, type }: GenerationResultBannerProps) {
  return (
    <div className={cn(
      'mb-4 p-3 rounded-lg text-sm',
      type === 'warning'
        ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300'
        : 'bg-green-500/10 border border-green-500/20 text-green-300'
    )}>
      {message}
    </div>
  )
}
