export interface CardStatusBadgeProps {
  status: string
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  size?: 'sm' | 'md'
}

const statusBadgeVariants = {
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  error: 'bg-red-500/20 text-red-400',
  info: 'bg-blue-500/20 text-blue-400',
  neutral: 'bg-secondary text-muted-foreground' }

export function CardStatusBadge({
  status,
  variant = 'neutral',
  size = 'sm' }: CardStatusBadgeProps) {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'

  return (
    <span
      className={`rounded ${statusBadgeVariants[variant]} ${sizeClasses}`}
      title={`Status: ${status}`}
    >
      {status}
    </span>
  )
}
