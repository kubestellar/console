import { memo } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '../../ui/Tooltip'

export const RemoveClusterButton = memo(function RemoveClusterButton({
  onRemove,
  size = 'sm',
}: {
  onRemove: () => void
  size?: 'sm' | 'xs'
}) {
  const { t } = useTranslation()
  const iconClass = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const buttonClass = size === 'xs' ? 'p-1' : 'p-1.5'

  return (
    <button
      onClick={(event) => {
        event.stopPropagation()
        onRemove()
      }}
      className={`${buttonClass} rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/20 transition-colors`}
      title={t('cluster.removeCluster')}
      aria-label={t('cluster.removeCluster')}
      data-testid="remove-cluster-button"
    >
      <Trash2 className={iconClass} aria-hidden="true" />
    </button>
  )
})

export function ActionTooltipWrapper({
  tooltip,
  children,
}: {
  tooltip: string
  children: ReactNode
}) {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  return (
    <span
      className="inline-flex"
      role="button"
      tabIndex={0}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      aria-label={tooltip}
    >
      <Tooltip content={tooltip}>{children}</Tooltip>
    </span>
  )
}

export function handleCardKeyDown(callback: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      callback()
    }
  }
}
