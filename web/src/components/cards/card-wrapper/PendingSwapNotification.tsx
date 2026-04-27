import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button'

interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

/** Default snooze duration (re-exported for CardWrapper's countdown logic) */
export { MS_PER_HOUR as DEFAULT_SNOOZE_MS } from '../../../lib/constants/time'

export interface PendingSwapNotificationProps {
  pendingSwap: PendingSwap
  newTitle: string
  onSnooze: (durationMs: number) => void
  onSwapNow: () => void
  onCancel: () => void
  defaultSnoozeDurationMs: number
}

/**
 * Banner shown at the bottom of a card when an AI-suggested swap is pending.
 * Displays the target card name, reason, and snooze/swap/keep buttons.
 */
export function PendingSwapNotification({
  pendingSwap,
  newTitle,
  onSnooze,
  onSwapNow,
  onCancel,
  defaultSnoozeDurationMs,
}: PendingSwapNotificationProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="px-4 py-3 bg-purple-500/10 border-t border-purple-500/20">
      <div className="flex items-center gap-2 text-sm">
        <span title={t('cardWrapper.swapPending')}><Clock className="w-4 h-4 text-purple-400 animate-pulse" /></span>
        <span className="text-purple-300">
          {t('common:labels.swappingTo', { cardName: newTitle })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{pendingSwap.reason}</p>
      <div className="flex gap-2 mt-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSnooze(defaultSnoozeDurationMs)}
          className="rounded"
          title={t('cardWrapper.snoozeTooltip')}
        >
          {t('common:buttons.snoozeHour')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={onSwapNow}
          className="rounded"
          title={t('cardWrapper.swapNowTooltip')}
        >
          {t('common:buttons.swapNow')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="rounded"
          title={t('cardWrapper.keepThisTooltip')}
        >
          {t('common:buttons.keepThis')}
        </Button>
      </div>
    </div>
  )
}
